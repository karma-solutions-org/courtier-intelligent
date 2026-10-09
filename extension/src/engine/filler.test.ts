import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeForm, FormField } from './analyzer';
import { dateFormatOf, fillField, formatDate, matchOption } from './filler';

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

  it('garde le texte saisi quand aucune suggestion n’apparaît', async () => {
    const { fill } = setup(html);

    const result = await fill(0, 'Saint-Étienne');

    expect(result.status).toBe('filled');
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
