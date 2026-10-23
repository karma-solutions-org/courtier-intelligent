import { Dossier } from '@shared';
import { currentStageOf, isStageEnabled, pipelineOf } from './dossier-stages.utils';

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

describe('isStageEnabled', () => {
  it('n’ouvre que les étapes atteintes', () => {
    const draft = dossier({ status: 'brouillon' });
    expect(isStageEnabled(draft, 'infos')).toBe(true);
    expect(isStageEnabled(draft, 'need')).toBe(false);
    expect(isStageEnabled(dossier({ status: 'complet' }), 'pricing')).toBe(false);
    expect(isStageEnabled(dossier({ status: 'tarification' }), 'comparison')).toBe(true);
  });

  it('n’ouvre la proposition qu’avec une offre retenue', () => {
    expect(isStageEnabled(dossier({ status: 'decision' }), 'proposal')).toBe(false);
    expect(isStageEnabled(dossier({ status: 'decision', decision: {} as Dossier['decision'] }), 'proposal')).toBe(true);
  });
});

describe('pipelineOf', () => {
  it('marque les étapes faites, en cours et à faire', () => {
    expect(pipelineOf(dossier({ status: 'tarification' })).map(step => step.state)).toEqual(['done', 'done', 'current', 'todo', 'todo']);
  });

  it('un dossier souscrit a toutes ses étapes faites', () => {
    expect(pipelineOf(dossier({ status: 'souscrit' })).every(step => step.state === 'done')).toBe(true);
  });
});
