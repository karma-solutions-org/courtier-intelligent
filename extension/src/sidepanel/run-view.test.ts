import { describe, expect, it } from 'vitest';
import type { RunField, RunState } from '../shared/messages';
import { describeCapture, describeRun, parseAmountInput, pathLabel } from './run-view';

const field = (overrides: Partial<RunField>): RunField => ({
  key: 'k',
  label: 'Champ',
  required: false,
  section: null,
  canonicalPath: null,
  confidence: 0,
  source: 'heuristic',
  status: 'filled',
  reason: null,
  ...overrides,
});

const run = (overrides: Partial<RunState> = {}): RunState => ({
  phase: 'filling',
  insurerId: 'assureur-a',
  dossierId: 'd1',
  step: { current: 2, total: 3 },
  fields: [],
  missing: [],
  aiUsed: false,
  memory: null,
  assignablePaths: [],
  message: null,
  ...overrides,
});

describe('describeRun', () => {
  it('résume la progression : étape et champs remplis', () => {
    const view = describeRun(run({ fields: [field({ key: 'a' }), field({ key: 'b' }), field({ key: 'c', status: 'unmapped' })] }));

    expect(view.step).toBe('Étape 2 sur 3');
    expect(view.summary).toBe('2 champs remplis sur 3');
  });

  it('accorde au singulier', () => {
    expect(describeRun(run({ fields: [field({})] })).summary).toBe('1 champ rempli sur 1');
    expect(describeRun(run({ fields: [] })).summary).toBe('0 champ rempli sur 0');
  });

  it('étape sans total, ou inconnue', () => {
    expect(describeRun(run({ step: { current: 1, total: null } })).step).toBe('Étape 1');
    expect(describeRun(run({ step: { current: null, total: null } })).step).toBeNull();
  });

  it('dit où en est le courtier selon la phase', () => {
    expect(describeRun(run({ phase: 'awaiting_submit' })).phase).toContain('validez vous-même');
    expect(describeRun(run({ phase: 'waiting_user' })).phase).toContain('complétez le dossier');
    expect(describeRun(run({ phase: 'analyzing' })).phase).toContain('Analyse');
  });

  describe('Champs qui demandent l’attention', () => {
    const view = describeRun(
      run({
        fields: [
          field({ key: 'ok', label: 'Nom', status: 'filled' }),
          field({ key: 'civ', label: 'Civilité', status: 'unmapped' }),
          field({ key: 'cp', label: 'Code postal', status: 'failed', required: true, reason: 'La valeur dépasse la longueur maximale du champ (5 caractères).' }),
          field({ key: 'mail', label: 'E-mail', status: 'missing', required: true }),
          field({ key: 'tel', label: 'Votre numéro direct', status: 'uncertain' }),
          field({ key: 'x', label: '', status: 'unmapped' }),
        ],
      }),
    );

    it('liste les champs non trouvés, incertains, en échec ou absents du dossier — pas les champs remplis', () => {
      expect(view.problems.map(p => [p.key, p.kind])).toEqual([
        ['cp', 'Échec du remplissage'],
        ['mail', 'Manquant dans le dossier'],
        ['civ', 'Non trouvé'],
        ['tel', 'Incertain'],
        ['x', 'Non trouvé'],
      ]);
    });

    it('met les champs obligatoires en premier', () => {
      expect(view.problems.slice(0, 2).every(p => p.required)).toBe(true);
    });

    it('explique l’échec', () => {
      expect(view.problems.find(p => p.key === 'cp')!.reason).toContain('longueur maximale');
    });

    it('un champ absent du dossier se complète dans l’application, les autres s’associent à la main', () => {
      expect(view.problems.find(p => p.key === 'mail')!.canAssign).toBe(false);
      expect(view.problems.find(p => p.key === 'civ')!.canAssign).toBe(true);
      expect(view.problems.find(p => p.key === 'cp')!.canAssign).toBe(true);
    });

    it('nomme un champ sans libellé', () => {
      expect(view.problems.find(p => p.key === 'x')!.label).toBe('(champ sans libellé)');
    });
  });

  it('liste les informations obligatoires que le dossier ne contient pas', () => {
    const view = describeRun(run({ missing: [{ canonicalPath: 'client.email', label: 'Adresse e-mail', type: 'text' }] }));
    expect(view.missing).toEqual([{ path: 'client.email', label: 'Adresse e-mail' }]);
  });

  it('signale que l’IA a aidé, sans la présenter comme une source de données', () => {
    expect(describeRun(run({ aiUsed: true })).aiNote).toContain('structure du formulaire');
    expect(describeRun(run({ aiUsed: false })).aiNote).toBeNull();
  });

  it('propose, pour la correction manuelle, les informations du dossier avec un nom lisible, triées', () => {
    const view = describeRun(run({ assignablePaths: ['vehicle.registration', 'client.lastName', 'client.email'] }));

    expect(view.assignable).toEqual([
      { path: 'client.email', label: 'Email' },
      { path: 'vehicle.registration', label: 'Immatriculation' },
      { path: 'client.lastName', label: 'Nom' },
    ]);
  });

  it('reprend le message du moteur (correction refusée…)', () => {
    expect(describeRun(run({ message: 'Ce champ ne peut pas recevoir cette information.' })).message).toContain('ne peut pas');
  });
});

describe('pathLabel', () => {
  it('donne un nom lisible à chaque chemin', () => {
    expect(pathLabel('client.birthDate')).toBe('Date de naissance');
    expect(pathLabel('insuranceHistory.bonusMalus')).toBe('Bonus malus');
  });
});

describe('describeCapture', () => {
  const offer = {
    quoteNumber: 'DEV-42',
    premiumAnnual: 642.3,
    premiumMonthly: null,
    deductibles: { general: 300 },
    guarantees: [
      { label: 'Vol', included: true, limit: 15000, deductible: 300 },
      { label: 'Bris de glace', included: false, limit: null, deductible: null },
    ],
    exclusions: ['Alcool'],
  };

  it('rien pendant le remplissage ; « Lire le tarif » proposé tant que la page n’est pas lue', () => {
    expect(describeRun(run()).capture).toBeNull();
    expect(describeRun(run()).canCapture).toBe(true);
    expect(describeRun(run({ phase: 'capture_review', capture: { offer, source: 'dom' } })).canCapture).toBe(false);
  });

  it('tarif à confirmer : champs modifiables au format français, détail lisible, confirmation et refus possibles', () => {
    const view = describeCapture(run({ phase: 'capture_review', capture: { offer, source: 'dom' } }))!;
    expect(view).toMatchObject({ premiumAnnual: '642,3', premiumMonthly: '', quoteNumber: 'DEV-42', canConfirm: true, canRetry: true, rejectLabel: 'Ce n’est pas le bon tarif' });
    expect(view.deductible).toBe('Franchise générale : 300 €');
    // toLocaleString sépare les milliers par une espace insécable.
    expect(view.guarantees.map(line => line.replace(/\s/g, ' '))).toEqual(['Vol — incluse · plafond 15 000 € · franchise 300 €', 'Bris de glace — non incluse']);
  });

  it('signale une lecture faite avec l’IA, à vérifier', () => {
    expect(describeCapture(run({ phase: 'capture_review', capture: { offer, source: 'ai' } }))!.sourceNote).toContain('IA');
  });

  it('échec : pas de confirmation, mais relecture et signalement', () => {
    expect(describeCapture(run({ phase: 'capture_failed', capture: { offer: null, source: null } }))).toMatchObject({
      canConfirm: false,
      canRetry: true,
      rejectLabel: 'Signaler l’échec',
    });
  });
});

describe('parseAmountInput', () => {
  it('lit les montants saisis à la française, vide = non renseigné, le reste est invalide', () => {
    expect(parseAmountInput('640,50')).toBe(640.5);
    expect(parseAmountInput(' 1 234 € ')).toBe(1234);
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('douze')).toBeUndefined();
    expect(parseAmountInput('-3')).toBeUndefined();
  });
});
