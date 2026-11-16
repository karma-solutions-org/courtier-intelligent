import { Dossier } from '@shared';
import { currentStageOf, DOSSIER_STAGES, stageEnabledFor, stageStateFor } from './dossier-stages.utils';

const dossier = (overrides: Partial<Dossier>): Dossier =>
  ({ id: 'd', reference: '2026-000001', assureId: 'a', productId: 'auto', status: 'brouillon', decision: null, proposal: null, needAnalysis: null, ...overrides }) as Dossier;

describe('currentStageOf', () => {
  it('ouvre l’étape qui correspond au statut', () => {
    expect(currentStageOf(null)).toBe('infos');
    expect(currentStageOf(dossier({ status: 'complet' }))).toBe('need');
    expect(currentStageOf(dossier({ status: 'tarification' }))).toBe('pricing');
    expect(currentStageOf(dossier({ status: 'souscrit' }))).toBe('proposal');
  });

  it('sans suite : la dernière étape réellement atteinte', () => {
    expect(currentStageOf(dossier({ status: 'sans_suite', completeness: { ok: false, missing: [] } }))).toBe('infos');
    expect(currentStageOf(dossier({ status: 'sans_suite', completeness: { ok: true, missing: [] } }))).toBe('need');
    expect(currentStageOf(dossier({ status: 'sans_suite', needAnalysis: { validatedAt: 1 } as unknown as Dossier['needAnalysis'] }))).toBe('pricing');
    expect(currentStageOf(dossier({ status: 'sans_suite', decision: {} as Dossier['decision'] }))).toBe('proposal');
  });
});

describe('stageEnabledFor', () => {
  it('n’ouvre que les étapes atteintes', () => {
    const draft = dossier({ status: 'brouillon' });
    expect(stageEnabledFor('infos', draft)).toBe(true);
    expect(stageEnabledFor('need', draft)).toBe(false);
    expect(stageEnabledFor('pricing', dossier({ status: 'complet' }))).toBe(false);
    expect(stageEnabledFor('comparison', dossier({ status: 'tarification' }))).toBe(true);
  });

  it('n’ouvre la proposition qu’avec une offre retenue', () => {
    expect(stageEnabledFor('proposal', dossier({ status: 'decision' }))).toBe(false);
    expect(stageEnabledFor('proposal', dossier({ status: 'decision', decision: {} as Dossier['decision'] }))).toBe(true);
  });
});

describe('stageStateFor', () => {
  it('marque les étapes faites, en cours et à faire', () => {
    expect(DOSSIER_STAGES.map((stage) => stageStateFor(stage.key, dossier({ status: 'tarification' })))).toEqual(['done', 'done', 'current', 'todo', 'todo']);
  });

  it('un dossier souscrit a toutes ses étapes faites', () => {
    expect(DOSSIER_STAGES.every((stage) => stageStateFor(stage.key, dossier({ status: 'souscrit' })) === 'done')).toBe(true);
  });
});
