import { afterEach, describe, expect, it } from 'vitest';
import { buttonLabels, detectStepHint, findNextButton, findResultRows, findSearchButton, isFinalStep, isLoading, isNewStep, pickResultRow, waitForSettled } from './steps';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('detectStepHint', () => {
  it.each([
    ['Étape 2 sur 5', { current: 2, total: 5 }],
    ['étape 1/3', { current: 1, total: 3 }],
    ['Step 3 of 4', { current: 3, total: 4 }],
    ['ETAPE 4 SUR 4', { current: 4, total: 4 }],
  ])('lit « %s »', (text, expected) => {
    document.body.innerHTML = `<header><span>${text}</span></header><form></form>`;
    expect(detectStepHint(document)).toEqual(expected);
  });

  it('lit un fil d’Ariane avec aria-current="step"', () => {
    document.body.innerHTML = '<ol><li>Vous</li><li aria-current="step">Véhicule</li><li>Conducteur</li><li>Tarif</li></ol>';
    expect(detectStepHint(document)).toEqual({ current: 2, total: 4 });
  });

  it('lit une barre de progression', () => {
    document.body.innerHTML = '<div role="progressbar" aria-valuenow="3" aria-valuemax="6"></div>';
    expect(detectStepHint(document)).toEqual({ current: 3, total: 6 });
  });

  it('ne devine rien quand la page ne dit rien (pas de chiffre inventé)', () => {
    document.body.innerHTML = '<form><input name="a"></form>';
    expect(detectStepHint(document)).toEqual({ current: null, total: null });
  });

  it('ignore une barre de progression indéterminée ou d’un chargement', () => {
    document.body.innerHTML = '<div role="progressbar"></div><div role="progressbar" aria-valuenow="50" aria-valuemax="100"></div>';
    expect(detectStepHint(document)).toEqual({ current: null, total: null });
  });
});

describe('findNextButton', () => {
  it.each(['Continuer vers la souscription', 'Suivant : paiement', 'Continuer et valider', 'Valider cette étape', 'Poursuivre et confirmer'])(
    'ne clique jamais « %s »',
    label => {
      document.body.innerHTML = `<button type="button">${label}</button>`;
      expect(findNextButton(document)).toBeNull();
    },
  );

  it('clique un simple « Suivant »', () => {
    document.body.innerHTML = '<button type="button">Suivant</button><button type="button">Obtenir mon tarif</button>';
    expect(findNextButton(document)?.textContent).toBe('Suivant');
  });

  it('lit le bouton malgré une flèche décorative (« > Continuer Devis » d’Oyat)', () => {
    document.body.innerHTML = '<a href="#" role="button">Ajouter un Conducteur</a><a href="#" role="button">&gt; Continuer Devis</a>';
    expect(findNextButton(document)?.textContent).toBe('> Continuer Devis');
    expect(isFinalStep(document, { current: null, total: null })).toBe(false);
  });

  it('une flèche ne rend jamais cliquable un bouton final (« › Valider »)', () => {
    document.body.innerHTML = '<button type="button">› Valider</button>';
    expect(findNextButton(document)).toBeNull();
  });
});

describe('isFinalStep', () => {
  const html = (buttons: string[]) => (document.body.innerHTML = buttons.map(label => `<button type="button">${label}</button>`).join(''));

  it('l’indicateur fait foi quand il existe', () => {
    html(['Suivant']);
    expect(isFinalStep(document, { current: 3, total: 3 })).toBe(true);
    expect(isFinalStep(document, { current: 2, total: 3 })).toBe(false);
  });

  it.each(['Obtenir mon tarif', 'Calculer mon devis', 'Voir les offres', 'Valider', 'Envoyer ma demande', 'Souscrire'])(
    'sans indicateur, « %s » sans « Suivant » = dernière étape',
    label => {
      html(['Précédent', label]);
      expect(isFinalStep(document, { current: null, total: null })).toBe(true);
    },
  );

  it.each(['Suivant', 'Continuer', 'Étape suivante'])('« %s » = une étape reste à venir', label => {
    html([label, 'Obtenir mon tarif']);
    expect(isFinalStep(document, { current: null, total: null })).toBe(false);
  });

  it('sans bouton reconnu, ce n’est pas la dernière étape', () => {
    html(['Retour', 'Aide']);
    expect(isFinalStep(document, { current: null, total: null })).toBe(false);
  });

  it('ignore les boutons masqués ou désactivés', () => {
    document.body.innerHTML = '<button hidden>Suivant</button><button disabled>Continuer</button><button>Obtenir mon tarif</button>';
    expect(buttonLabels(document)).toEqual(['Obtenir mon tarif']);
    expect(isFinalStep(document, { current: null, total: null })).toBe(true);
  });
});

describe('waitForSettled', () => {
  it('attend la fin des modifications de la page', async () => {
    document.body.innerHTML = '<div id="c"></div>';
    const started = Date.now();
    const timer = setInterval(() => document.getElementById('c')!.append(document.createElement('p')), 20);
    setTimeout(() => clearInterval(timer), 150);

    const settled = await waitForSettled(document, { quietMs: 80, timeoutMs: 2000 });

    expect(settled).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
  });

  it('attend aussi la fin d’un indicateur de chargement', async () => {
    document.body.innerHTML = '<div id="s" class="spinner">Chargement…</div>';
    setTimeout(() => document.getElementById('s')!.remove(), 200);
    const started = Date.now();

    expect(await waitForSettled(document, { quietMs: 40, timeoutMs: 2000 })).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(190);
  });

  it('rend la main après le délai si la page ne se stabilise jamais', async () => {
    document.body.innerHTML = '<div id="c"></div>';
    const timer = setInterval(() => document.getElementById('c')!.append(document.createElement('i')), 10);

    expect(await waitForSettled(document, { quietMs: 100, timeoutMs: 250 })).toBe(false);
    clearInterval(timer);
  });

  it('une page déjà stable est tout de suite prête', async () => {
    document.body.innerHTML = '<p>stable</p>';
    expect(await waitForSettled(document, { quietMs: 30, timeoutMs: 1000 })).toBe(true);
  });
});

describe('isLoading', () => {
  it('reconnaît les indicateurs d’attente visibles', () => {
    document.body.innerHTML = '<div aria-busy="true"></div>';
    expect(isLoading(document)).toBe(true);
    document.body.innerHTML = '<div class="spinner" hidden></div>';
    expect(isLoading(document)).toBe(false);
    document.body.innerHTML = '<p>rien</p>';
    expect(isLoading(document)).toBe(false);
  });
});

describe('isNewStep', () => {
  const step = (keys: string[], current: number | null = null) => ({ keys, hint: { current, total: null } });

  it('l’indicateur de l’extranet décide quand il existe', () => {
    expect(isNewStep(step(['a', 'b'], 1), step(['a', 'b'], 2))).toBe(true);
    expect(isNewStep(step(['a', 'b'], 2), step(['x', 'y'], 2))).toBe(false);
  });

  it('sans indicateur : des champs en grande partie remplacés = nouvelle étape', () => {
    expect(isNewStep(step(['a', 'b', 'c', 'd']), step(['w', 'x', 'y', 'z']))).toBe(true);
  });

  it('sans indicateur : un champ qui apparaît sous une réponse n’est pas une nouvelle étape', () => {
    expect(isNewStep(step(['a', 'b', 'c']), step(['a', 'b', 'c', 'd']))).toBe(false);
  });

  it('le premier formulaire affiché est une étape', () => {
    expect(isNewStep(step([]), step(['a']))).toBe(true);
    expect(isNewStep(step([]), step([]))).toBe(false);
  });
});

describe('Recherche du véhicule (Zephir)', () => {
  const PAGE = `
    <div class="panel"><input id="immat" value="CM359VC" /><button id="b1">Rechercher</button></div>
    <div class="panel"><select id="marque"></select><select id="modele"></select><select id="designation"></select><button id="b2">Rechercher</button></div>`;
  const el = (id: string) => document.getElementById(id)!;

  it('choisit le « Rechercher » du bloc qui contient le plus de champs remplis', () => {
    document.body.innerHTML = PAGE;
    expect(findSearchButton(document, [el('immat'), el('marque'), el('modele'), el('designation')])?.id).toBe('b2');
  });

  it('ne choisit rien sans champ rempli', () => {
    document.body.innerHTML = PAGE;
    expect(findSearchButton(document, [])).toBeNull();
  });

  const TABLE = `<table><thead><tr><th>Désignation</th><th>Type mines</th><th>Valeur d'achat</th></tr></thead><tbody>
    <tr id="r1"><td>CONFORT</td><td>FLGMA6</td><td>25,236</td></tr>
    <tr id="r2"><td>CONFORT</td><td>FLFMA6</td><td>28,883</td></tr></tbody></table>`;

  it('prend la ligne la plus proche de la valeur du véhicule, sinon la première', () => {
    document.body.innerHTML = TABLE;
    const found = findResultRows(document)!;
    expect(pickResultRow(found, 29000).id).toBe('r2');
    expect(pickResultRow(found, null).id).toBe('r1');
  });
});

describe('findResultRows sans thead', () => {
  it('trouve les lignes à bouton radio (liste de véhicules Oyat)', () => {
    document.body.innerHTML = `<table><tr><th></th><th>Véhicule</th><th>CV</th></tr>
      <tr><td><input type="radio" name="v"></td><td>TRAFIC GENERIQUE</td><td>7</td></tr>
      <tr><td><input type="radio" name="v"></td><td>TRAFIC CONFORT</td><td>7</td></tr></table>`;
    const found = findResultRows(document)!;
    expect(found.rows).toHaveLength(2);
    expect(pickResultRow(found, null)).toBe(found.rows[0]);
  });
});
