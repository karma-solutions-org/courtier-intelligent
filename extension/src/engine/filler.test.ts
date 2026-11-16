import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeForm, FormField } from './analyzer';
import { dateFormatOf, fillField, formatDate, matchOption, registrationFor, matchVersion } from './filler';

/** Monte un formulaire et renvoie le champ analysé, ses éléments et la liste des événements reçus. */
function setup(html: string) {
  document.body.innerHTML = html;
  const { fields, elements } = analyzeForm(document);
  const events: string[] = [];
  for (const type of ['focus', 'input', 'change', 'blur', 'click']) {
    document.body.addEventListener(type, event => events.push(`${type}:${(event.target as HTMLElement).getAttribute('name') ?? ''}`), true);
  }
  const fill = (index: number, value: string | number | boolean, options: { date?: boolean } = {}) =>
    fillField(fields[index], elements.get(fields[index].key)!, value, { suggestionTimeoutMs: 200, ...options });
  return { fields, elements, events, fill };
}

describe('Champs de texte', () => {
  it('écrit la valeur et émet focus, input, change et blur, comme une saisie réelle', async () => {
    const { fill, events } = setup('<label for="n">Nom</label><input id="n" name="nom" />');

    const result = await fill(0, 'Dupont');

    expect(result).toEqual({ fieldKey: expect.any(String), status: 'filled' });
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('Dupont');
    expect(events).toEqual(expect.arrayContaining(['focus:nom', 'input:nom', 'change:nom', 'blur:nom']));
    expect(events.indexOf('input:nom')).toBeLessThan(events.indexOf('change:nom'));
    expect(events.indexOf('change:nom')).toBeLessThan(events.indexOf('blur:nom'));
  });

  it('prévient un framework qui suit les saisies (React, Angular) : il lit la valeur dans l’événement input', async () => {
    const { fill } = setup('<label for="n">Nom</label><input id="n" name="nom" />');
    let seen = '';
    document.getElementById('n')!.addEventListener('input', e => (seen = (e.target as HTMLInputElement).value));

    await fill(0, 'Dupont');

    expect(seen).toBe('Dupont');
  });

  it('remplit un textarea', async () => {
    const { fill } = setup('<label for="t">Remarques</label><textarea id="t" name="t"></textarea>');
    expect((await fill(0, 'RAS')).status).toBe('filled');
    expect((document.getElementById('t') as HTMLTextAreaElement).value).toBe('RAS');
  });

  it('remplit un nombre, y compris 0', async () => {
    const { fill } = setup('<label for="n">CV</label><input id="n" name="cv" type="number" />');
    expect((await fill(0, 0)).status).toBe('filled');
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('0');
    expect((await fill(0, 5.5)).status).toBe('filled');
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('5.5');
  });

  it('signale ce que l’extranet a refusé (masque de saisie, longueur maximale) au lieu de le croire rempli', async () => {
    const { fill } = setup('<label for="c">Code postal</label><input id="c" name="cp" maxlength="5" />');

    const result = await fill(0, '750020');

    expect(result.status).toBe('failed');
    expect(result.reason).toContain('longueur maximale');
  });

  it('refuse un oui/non dans un champ de texte, et un texte dans un champ numérique', async () => {
    const { fill } = setup('<label for="a">Nom</label><input id="a" name="a" /><label for="b">CV</label><input id="b" name="b" type="number" />');

    expect((await fill(0, true)).status).toBe('failed');
    expect((await fill(1, 'cinq')).status).toBe('failed');
  });

  it('échoue proprement si le champ a disparu de la page', async () => {
    const { fill } = setup('<label for="n">Nom</label><input id="n" name="nom" />');
    document.body.innerHTML = '';

    expect((await fill(0, 'Dupont')).reason).toContain("plus dans la page");
  });
});

describe('Dates', () => {
  it('écrit la date ISO dans un champ type=date', async () => {
    const { fill } = setup('<label for="d">Naissance</label><input id="d" name="d" type="date" />');
    expect((await fill(0, '1985-03-12')).status).toBe('filled');
    expect((document.getElementById('d') as HTMLInputElement).value).toBe('1985-03-12');
  });

  it('formate pour un champ texte selon son texte d’aide (JJ/MM/AAAA par défaut)', async () => {
    const { fill } = setup('<label for="d">Date de naissance</label><input id="d" name="d" placeholder="JJ/MM/AAAA" />');
    expect((await fill(0, '1985-03-12', { date: true })).status).toBe('filled');
    expect((document.getElementById('d') as HTMLInputElement).value).toBe('12/03/1985');
  });

  it.each([
    ['JJ/MM/AAAA', '12/03/1985'],
    ['jj-mm-aaaa', '12-03-1985'],
    ['AAAA-MM-JJ', '1985-03-12'],
    ['JJMMAAAA', '12031985'],
    ['MM/AAAA', '03/1985'],
    ['', '12/03/1985'],
  ])('format %j → %s', (placeholder, expected) => {
    const field = { placeholder, pattern: null, label: 'Date', inputType: 'text' } as FormField;
    expect(formatDate('1985-03-12', field)).toBe(expected);
  });

  it('refuse une date invalide', async () => {
    const { fill, fields } = setup('<label for="d">Naissance</label><input id="d" name="d" type="date" />');
    expect(formatDate('12/03/1985', fields[0])).toBeNull();
    expect(formatDate('1985-13-45', fields[0])).toBeNull();
    expect((await fill(0, 'hier')).status).toBe('failed');
  });

  it('lit le format dans le motif (pattern) ou le libellé', () => {
    expect(dateFormatOf({ placeholder: null, pattern: '\\d{2}-\\d{2}-\\d{4}', label: 'Date (jj-mm-aaaa)' } as FormField)).toBe('dd-MM-yyyy');
  });
});

describe('Listes déroulantes', () => {
  const html = `<label for="m">Marque</label><select id="m" name="marque"><option value="">Choisir…</option>
    <option value="RENAULT">Renault</option><option value="CITROEN">Citroën</option></select>`;

  it('sélectionne l’option par sa valeur ou son libellé, sans tenir compte de la casse ni des accents', async () => {
    const { fill } = setup(html);
    expect((await fill(0, 'citroen')).status).toBe('filled');
    expect((document.getElementById('m') as HTMLSelectElement).value).toBe('CITROEN');
    expect((await fill(0, 'RENAULT')).status).toBe('filled');
    expect((document.getElementById('m') as HTMLSelectElement).value).toBe('RENAULT');
  });

  it('émet input et change', async () => {
    const { fill, events } = setup(html);
    await fill(0, 'Renault');
    expect(events).toEqual(expect.arrayContaining(['input:marque', 'change:marque']));
  });

  it('ne choisit aucune option au hasard quand rien ne correspond', async () => {
    const { fill } = setup(html);
    const result = await fill(0, 'Tesla');

    expect(result.status).toBe('failed');
    expect(result.reason).toContain('Aucune option');
    expect((document.getElementById('m') as HTMLSelectElement).value).toBe('');
  });

  it('traduit les valeurs canoniques du questionnaire en libellés d’assureur', async () => {
    const { fill } = setup(`<label for="p">Stationnement</label><select id="p" name="p"><option value="">-</option>
      <option value="G">Garage privé</option><option value="P">Parking fermé</option><option value="V">Voie publique</option></select>`);

    await fill(0, 'voie_publique');
    expect((document.getElementById('p') as HTMLSelectElement).value).toBe('V');
    await fill(0, 'garage_prive');
    expect((document.getElementById('p') as HTMLSelectElement).value).toBe('G');
  });
});

describe('Boutons radio', () => {
  const yesNo = `<fieldset><legend>Assuré actuellement ?</legend>
    <label><input type="radio" name="a" value="1"> Oui</label><label><input type="radio" name="a" value="0"> Non</label></fieldset>`;

  it('coche Oui pour true et Non pour false (0 et false sont des réponses)', async () => {
    const { fill } = setup(yesNo);
    await fill(0, true);
    expect((document.querySelector('input[value="1"]') as HTMLInputElement).checked).toBe(true);
    await fill(0, false);
    expect((document.querySelector('input[value="0"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('input[value="1"]') as HTMLInputElement).checked).toBe(false);
  });

  it('coche par un clic (le framework reçoit input et change)', async () => {
    const { fill, events } = setup(yesNo);
    await fill(0, true);
    expect(events).toEqual(expect.arrayContaining(['click:a', 'change:a']));
  });

  it('choisit un libellé d’assureur pour une valeur canonique', async () => {
    const { fill } = setup(`<fieldset><legend>Usage</legend>
      <label><input type="radio" name="u" value="U1"> Privé</label>
      <label><input type="radio" name="u" value="U2"> Privé et trajet domicile-travail</label>
      <label><input type="radio" name="u" value="U3"> Professionnel</label></fieldset>`);

    await fill(0, 'prive_trajet');
    expect((document.querySelector('input[value="U2"]') as HTMLInputElement).checked).toBe(true);
    await fill(0, 'professionnel');
    expect((document.querySelector('input[value="U3"]') as HTMLInputElement).checked).toBe(true);
  });

  it('échoue quand aucune option ne correspond', async () => {
    const { fill } = setup(yesNo);
    expect((await fill(0, 'peut-être')).status).toBe('failed');
  });
});

describe('Cases à cocher', () => {
  it('coche et décoche selon le booléen, sans clic inutile', async () => {
    const { fill, events } = setup('<label><input type="checkbox" name="c"> Newsletter</label>');
    const box = document.querySelector('input') as HTMLInputElement;

    await fill(0, true);
    expect(box.checked).toBe(true);
    const clicks = events.filter(e => e === 'click:c').length;
    await fill(0, true);
    expect(events.filter(e => e === 'click:c')).toHaveLength(clicks);
    await fill(0, false);
    expect(box.checked).toBe(false);
  });

  it('refuse une valeur qui n’est pas un booléen', async () => {
    const { fill } = setup('<label><input type="checkbox" name="c"> Newsletter</label>');
    expect((await fill(0, 'oui')).status).toBe('failed');
  });
});

describe('Saisie assistée (autocomplete)', () => {
  const html = `<label for="v">Ville</label><input id="v" name="ville" role="combobox" aria-autocomplete="list" aria-controls="l"><ul id="l" role="listbox"></ul>`;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('saisit, attend les suggestions et clique celle qui correspond', async () => {
    const { fill } = setup(html);
    const input = document.getElementById('v') as HTMLInputElement;
    input.addEventListener('input', () =>
      setTimeout(() => {
        document.getElementById('l')!.innerHTML = '<li role="option">Lyon 3e</li><li role="option">Lyon 6e</li>';
        document.querySelectorAll('#l li').forEach(li => li.addEventListener('click', () => (input.value = li.textContent!)));
      }, 30),
    );

    const result = await fill(0, 'Lyon 6e');

    expect(result.status).toBe('filled');
    expect(input.value).toBe('Lyon 6e');
  });

  it('garde le texte saisi quand aucune suggestion n’apparaît, mais le signale à vérifier', async () => {
    const { fill } = setup(html);

    const result = await fill(0, 'Saint-Étienne');

    expect(result.status).toBe('failed');
    expect((document.getElementById('v') as HTMLInputElement).value).toBe('Saint-Étienne');
  });

  it('une liste HTML5 (datalist) se contente de la valeur saisie', async () => {
    const { fill } = setup('<label for="v">Ville</label><input id="v" name="ville" list="d"><datalist id="d"><option value="Lyon"></datalist>');
    expect((await fill(0, 'Lyon')).status).toBe('filled');
  });
});

describe('matchOption', () => {
  const options = [
    { value: 'a', label: 'Privé' },
    { value: 'b', label: 'Professionnel' },
    { value: 'c', label: 'Oui' },
    { value: 'd', label: 'Non' },
  ];

  it('ne confond pas deux options proches', () => {
    expect(matchOption(options, 'professionnel')?.value).toBe('b');
    expect(matchOption(options, 'prive')?.value).toBe('a');
  });

  it('booléens → Oui / Non', () => {
    expect(matchOption(options, true)?.value).toBe('c');
    expect(matchOption(options, false)?.value).toBe('d');
    expect(matchOption([{ value: 'x', label: 'Peut-être' }], true)).toBeNull();
  });

  it('une valeur inconnue ne correspond à rien', () => {
    expect(matchOption(options, 'spatial')).toBeNull();
  });
});

describe('registrationFor (immatriculation avec ou sans séparateurs)', () => {
  const plate = (html: string) => {
    document.body.innerHTML = html;
    const { fields, elements } = analyzeForm(document);
    return registrationFor(fields[0], elements.get(fields[0].key)?.[0], 'CM-359-VC');
  };

  it('colle la plaque quand la page le demande (consigne ou exemple)', () => {
    expect(plate('<div><div><label for="i">Immatriculation</label><input id="i" /></div><p>Saisissez votre numéro sans espace et sans tiret, ex: AA001AA</p></div>')).toBe('CM359VC');
    expect(plate('<label for="i">Immatriculation</label><input id="i" placeholder="AA001AA" />')).toBe('CM359VC');
  });

  it('colle la plaque quand le champ est trop court pour les tirets', () => {
    expect(plate('<label for="i">Immatriculation</label><input id="i" maxlength="7" />')).toBe('CM359VC');
  });

  it('garde les tirets sinon', () => {
    expect(plate('<label for="i">Immatriculation</label><input id="i" placeholder="AB-123-CD" />')).toBe('CM-359-VC');
  });
});

describe('registrationFor : consigne éloignée du champ (cadre Zéphir)', () => {
  it('trouve la consigne plusieurs niveaux plus haut', () => {
    document.body.innerHTML = `<section><h3>Par immatriculation</h3><div class="body"><div class="row"><div class="col"><div class="wrap">
      <input id="i" name="immat" aria-label="Immatriculation" /></div></div></div>
      <p>Saisissez votre numéro sans espace et sans tiret, ex: AA001AA</p><button>Rechercher</button></div></section>`;
    const { fields, elements } = analyzeForm(document);
    expect(registrationFor(fields[0], elements.get(fields[0].key)?.[0], 'CM-359-VC')).toBe('CM359VC');
  });
});

describe('matchVersion (désignation la plus proche)', () => {
  const opt = (...labels: string[]) => labels.map((label, i) => ({ value: String(i + 1), label }));
  const VERSION = '2.0 90 ch Gazole Fourgon (FLA0A6)';

  it('choisit la désignation qui partage cylindrée et puissance', () => {
    const options = opt('1.6 DCI 120 L1H1 GRAND CONFORT', '2.0 DCI 90 L1H1 CONFORT', '2.0 DCI 115 L2H1 GRAND CONFORT');
    expect(matchVersion(options, VERSION)?.label).toBe('2.0 DCI 90 L1H1 CONFORT');
  });

  it('à égalité, prend la première désignation de la liste', () => {
    const options = opt('2.0 DCI 90 L1H1 CONFORT', '2.0 DCI 90 L2H1 CONFORT');
    expect(matchVersion(options, VERSION)?.label).toBe('2.0 DCI 90 L1H1 CONFORT');
  });

  it('sans nombre en commun, prend la première option (le tarif doit sortir)', () => {
    expect(matchVersion(opt('Sélectionner', 'FOURGON CONFORT', 'FOURGON GRAND CONFORT'), VERSION)?.label).toBe('FOURGON CONFORT');
  });

  it('lit les nombres collés aux lettres (Zephir : « 2.5DCI »)', () => {
    const options = opt('GENERATION 2.0DCI 115', 'GENERATION 2.5DCI 140 EXPRESSION', 'GENERATION 2.5DCI 140 PRIVILEGE', 'GENERATION L1H1 2.0DCI 90');
    expect(matchVersion(options, '2.5 dCi 140 ch Gazole')?.label).toBe('GENERATION 2.5DCI 140 EXPRESSION');
  });
});

describe('Extranet type Oyat : date en trois cases, adresse à suggestions', () => {
  const dateRow = (name: string, sizes = [2, 2, 4]) =>
    `<div class="row"><span>Date de naissance : *</span><span>${sizes
      .map((size, i) => `<input type="text" name="${name}${i}" maxlength="${size}" />`)
      .join('')}</span></div>`;

  it('regroupe jour / mois / année en un seul champ date et remplit chaque case', async () => {
    const { fields, fill } = setup(dateRow('naiss'));

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ kind: 'date', inputType: 'split-dmy', label: expect.stringMatching(/date de naissance/i) });
    expect(await fill(0, '1985-10-16')).toMatchObject({ status: 'filled' });
    const values = [...document.querySelectorAll('input')].map(input => input.value);
    expect(values).toEqual(['16', '10', '1985']);
  });

  it('reconnaît l’ordre année / mois / jour', async () => {
    const { fields, fill } = setup(dateRow('d', [4, 2, 2]));

    expect(fields[0].inputType).toBe('split-ymd');
    await fill(0, '2014-03-18');
    expect([...document.querySelectorAll('input')].map(input => input.value)).toEqual(['2014', '03', '18']);
  });

  it('ne regroupe pas trois champs de texte ordinaires', () => {
    const { fields } = setup('<p><input name="nom" /><input name="prenom" /><input name="ville" /></p>');
    expect(fields.map(f => f.kind)).toEqual(['text', 'text', 'text']);
  });

  it('choisit la suggestion d’adresse proposée après la saisie', async () => {
    const { fields, elements } = setup('<label for="a">Adresse</label><input id="a" name="adresse" /><ul id="s"></ul>');
    const input = document.getElementById('a') as HTMLInputElement;
    const list = document.getElementById('s')!;
    let picked = '';
    input.addEventListener('input', () => {
      list.innerHTML = '<li>225 Boulevard paul claudel 13010 Marseille</li><li>Boulevard paul claudel 13009 Marseille</li>';
      list.querySelectorAll('li').forEach(li =>
        li.addEventListener('click', () => {
          picked = li.textContent ?? '';
          input.value = picked;
        }),
      );
    });

    const result = await fillField(fields[0], elements.get(fields[0].key)!, '225 BOULEVARD PAUL CLAUDEL', { suggest: true, suggestionTimeoutMs: 300 });

    expect(result.status).toBe('filled');
    expect(picked).toBe('225 Boulevard paul claudel 13010 Marseille');
  });

  it('sans suggestion, garde le texte saisi', async () => {
    const { fields, elements } = setup('<label for="a">Adresse</label><input id="a" name="adresse" />');
    const result = await fillField(fields[0], elements.get(fields[0].key)!, '1 rue de Paris', { suggest: true, suggestionTimeoutMs: 100 });
    expect(result.status).toBe('filled');
    expect((document.getElementById('a') as HTMLInputElement).value).toBe('1 rue de Paris');
  });
});

describe('Saisie en plusieurs cases', () => {
  const boxes = (label: string, name: string, widths: number[]) =>
    `<div><span>${label}</span><span>${widths.map((w, i) => `<input type="text" name="${name}${i}" maxlength="${w}" />`).join('')}</span></div>`;
  const values = () => [...document.querySelectorAll('input')].map(input => input.value);

  it('découpe un téléphone en cinq cases, et repasse +33 au format national', async () => {
    const { fields, fill } = setup(boxes('Téléphone portable', 'tel', [2, 2, 2, 2, 2]));

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ kind: 'text', inputType: 'segmented', segments: [2, 2, 2, 2, 2] });
    expect(await fill(0, '+33 6 12 34 56 78')).toMatchObject({ status: 'filled' });
    expect(values()).toEqual(['06', '12', '34', '56', '78']);
  });

  it('découpe une plaque en trois cases (2/3/2), sans les tirets', async () => {
    const { fill } = setup(boxes('Immatriculation', 'plaque', [2, 3, 2]));
    expect(await fill(0, 'CM-359-VC')).toMatchObject({ status: 'filled' });
    expect(values()).toEqual(['CM', '359', 'VC']);
  });

  it('refuse une valeur de mauvaise longueur au lieu de remplir à moitié', async () => {
    const { fill } = setup(boxes('Téléphone', 'tel', [2, 2, 2, 2, 2]));
    expect(await fill(0, '0612')).toMatchObject({ status: 'failed' });
    expect(values()).toEqual(['', '', '', '', '']);
  });

  it('ne regroupe pas des champs longs côte à côte (nom, prénom)', () => {
    const { fields } = setup('<p><input name="nom" maxlength="50" /><input name="prenom" maxlength="50" /></p>');
    expect(fields.map(f => f.inputType)).toEqual(['text', 'text']);
  });
});

describe('Contrôles dessinés (rôles ARIA)', () => {
  it('coche un bouton radio dessiné Oui / Non', async () => {
    const { fields, fill } = setup(`
      <div role="radiogroup" aria-label="Conducteur déjà assuré">
        <div role="radio" aria-checked="false" tabindex="0">Oui</div>
        <div role="radio" aria-checked="false" tabindex="0">Non</div>
      </div>`);
    document.querySelectorAll<HTMLElement>('[role="radio"]').forEach(radio =>
      radio.addEventListener('click', () => {
        document.querySelectorAll('[role="radio"]').forEach(r => r.setAttribute('aria-checked', 'false'));
        radio.setAttribute('aria-checked', 'true');
      }),
    );

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ kind: 'radio', inputType: 'aria-radio', label: 'Conducteur déjà assuré' });
    expect(fields[0].options.map(o => o.label)).toEqual(['Oui', 'Non']);
    expect(await fill(0, false)).toMatchObject({ status: 'filled' });
    expect(document.querySelectorAll('[role="radio"]')[1].getAttribute('aria-checked')).toBe('true');
  });

  it('bascule un interrupteur dessiné', async () => {
    const { fields, fill } = setup('<span id="l">Garage fermé</span><div role="switch" aria-labelledby="l" aria-checked="false"></div>');
    const toggle = document.querySelector<HTMLElement>('[role="switch"]')!;
    toggle.addEventListener('click', () => toggle.setAttribute('aria-checked', String(toggle.getAttribute('aria-checked') !== 'true')));

    expect(fields[0]).toMatchObject({ kind: 'checkbox', inputType: 'aria-checkbox', label: 'Garage fermé' });
    expect(await fill(0, true)).toMatchObject({ status: 'filled' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('ouvre une liste déroulante maison et choisit l’option', async () => {
    const { fields, fill } = setup(`
      <span id="lbl">Usage du véhicule</span>
      <div role="combobox" aria-labelledby="lbl" aria-controls="lst" tabindex="0">Choisir</div>
      <ul role="listbox" id="lst" hidden></ul>`);
    const combo = document.querySelector<HTMLElement>('[role="combobox"]')!;
    const list = document.getElementById('lst')!;
    combo.addEventListener('click', () => {
      list.hidden = false;
      list.innerHTML = '<li role="option">Privé</li><li role="option">Domicile-travail</li><li role="option">Professionnel</li>';
      list.querySelectorAll<HTMLElement>('[role="option"]').forEach(option =>
        option.addEventListener('click', () => {
          combo.textContent = option.textContent;
          list.hidden = true;
        }),
      );
    });

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ kind: 'select', inputType: 'custom-select', label: 'Usage du véhicule' });
    expect(await fill(0, 'prive_trajet')).toMatchObject({ status: 'filled' });
    expect(combo.textContent).toBe('Domicile-travail');
  });
});

describe('Cases avec leur propre petit libellé', () => {
  it('regroupe quand même une date dont chaque case est libellée Jour / Mois / Année', () => {
    const { fields } = setup(`<div><span>Date d'effet</span><span>
      <input aria-label="Jour" maxlength="2" /><input aria-label="Mois" maxlength="2" /><input aria-label="Année" maxlength="4" /></span></div>`);
    expect(fields).toHaveLength(1);
    expect(fields[0].inputType).toBe('split-dmy');
    expect(fields[0].label).toBe("Date d'effet");
  });
});

describe('Liste dépendante (villes du code postal)', () => {
  it('attend que la liste des villes se charge après la saisie du code postal (au keyup)', async () => {
    const { fields, elements } = setup(`
      <label for="cp">Code postal</label><input id="cp" name="cp" />
      <label for="ville">Ville</label><select id="ville" name="ville"><option value="">Sélectionner une ville...</option></select>`);
    const ville = document.getElementById('ville') as HTMLSelectElement;
    document.getElementById('cp')!.addEventListener('keyup', () =>
      setTimeout(() => (ville.innerHTML += '<option value="13210">MARSEILLE</option><option value="13299">MARSEILLE CEDEX</option>'), 300),
    );

    await fillField(fields[0], elements.get(fields[0].key)!, '13010');
    const result = await fillField(fields[1], elements.get(fields[1].key)!, 'MARSEILLE', { listTimeoutMs: 1500 });

    expect(result.status).toBe('filled');
    expect(ville.value).toBe('13210');
  });
});

describe('Réponses en tranches (ancienneté d’assurance)', () => {
  const OYAT = ['Non, aucune assurance', 'Oui, moins de 9 mois', 'Oui, de 9 à 23 mois', 'Oui, 24 mois et plus'].map((label, i) => ({ value: String(i), label }));

  it.each([
    [0, 'Non, aucune assurance'],
    [5, 'Oui, moins de 9 mois'],
    [9, 'Oui, de 9 à 23 mois'],
    [23, 'Oui, de 9 à 23 mois'],
    [36, 'Oui, 24 mois et plus'],
  ])('%i mois → « %s »', (months, label) => {
    expect(matchOption(OYAT, months)?.label).toBe(label);
  });

  it('« non » choisit « Non, aucune assurance » ; « oui » seul ne choisit rien au hasard', () => {
    expect(matchOption(OYAT, false)?.label).toBe('Non, aucune assurance');
    expect(matchOption(OYAT, true)).toBeNull();
  });

  it('lit aussi les tranches en années (converties en mois)', () => {
    const years = ['Moins de 2 ans', 'De 2 à 5 ans', '5 ans et plus'].map((label, i) => ({ value: String(i), label }));
    expect(matchOption(years, 30)?.label).toBe('De 2 à 5 ans');
    expect(matchOption(years, 12)?.label).toBe('Moins de 2 ans');
  });
});


describe('Garage Oui / Non déduit du lieu de stationnement', () => {
  const yesNo = [{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }];
  it('garage privé → Oui, voie publique → Non', () => {
    expect(matchOption(yesNo, 'garage_prive')?.label).toBe('Oui');
    expect(matchOption(yesNo, 'voie_publique')?.label).toBe('Non');
  });
  it('une vraie liste de stationnement garde son option', () => {
    expect(matchOption([{ value: 'g', label: 'Garage privé' }, { value: 'v', label: 'Voie publique' }], 'garage_prive')?.label).toBe('Garage privé');
  });
});
