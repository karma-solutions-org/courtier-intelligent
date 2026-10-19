import { afterEach, describe, expect, it } from 'vitest';
import { buttonLabels, detectStepHint, isFinalStep, isLoading, isNewStep, waitForSettled } from './steps';

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
