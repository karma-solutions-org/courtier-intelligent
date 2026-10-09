import { describe, expect, it } from 'vitest';
import { describeJob, JobSnapshot, pickCurrentJob } from './jobs';

const job = (insurerId: string, data: JobSnapshot['data'], dossierId = 'd1'): JobSnapshot => ({ dossierId, insurerId, data });

describe('pickCurrentJob', () => {
  it('prend le job en cours le plus récent (la liste arrive du plus récent au plus ancien)', () => {
    const current = pickCurrentJob([
      job('b', { status: 'filling', currentStep: 2, totalSteps: 6, dossierReference: '2026-000007' }, 'd2'),
      job('a', { status: 'analyzing' }),
    ]);

    expect(current).toMatchObject({ dossierId: 'd2', insurerId: 'b', status: 'filling', currentStep: 2, totalSteps: 6, dossierReference: '2026-000007' });
  });

  it('ignore les jobs terminés ou en échec', () => {
    expect(pickCurrentJob([job('a', { status: 'captured' }), job('b', { status: 'failed', error: 'Page introuvable' })])).toBeNull();
    expect(pickCurrentJob([job('a', { status: 'captured' }), job('b', { status: 'needs_info' })])?.insurerId).toBe('b');
  });

  it('retient tous les statuts en cours', () => {
    for (const status of ['requested', 'analyzing', 'needs_info', 'filling', 'awaiting_submit'] as const) {
      expect(pickCurrentJob([job('a', { status })])?.status).toBe(status);
    }
  });

  it('sans job, ou sans statut lisible : aucun', () => {
    expect(pickCurrentJob([])).toBeNull();
    expect(pickCurrentJob([job('a', {})])).toBeNull();
  });

  it('complète le nom de l’assureur quand il est connu, et garde null sinon', () => {
    expect(pickCurrentJob([job('a', { status: 'filling' })], new Map([['a', 'Assureur A']]))?.insurerName).toBe('Assureur A');
    expect(pickCurrentJob([job('a', { status: 'filling' })])?.insurerName).toBeNull();
  });

  it('une progression absente reste null (pas de 0 inventé)', () => {
    const current = pickCurrentJob([job('a', { status: 'requested' })])!;
    expect(current.currentStep).toBeNull();
    expect(current.totalSteps).toBeNull();
    expect(current.error).toBeNull();
  });
});

describe('describeJob', () => {
  const base = { dossierId: 'd1', insurerId: 'a', insurerName: 'Assureur A', dossierReference: '2026-000007', status: 'filling', currentStep: 2, totalSteps: 6, error: null } as const;

  it('affiche le dossier, l’assureur, le statut et l’avancement', () => {
    expect(describeJob(base)).toEqual({ title: 'Dossier 2026-000007 · Assureur A', status: 'Remplissage en cours', progress: 'Étape 2 sur 6' });
  });

  it('retombe sur les identifiants quand la référence et le nom ne sont pas connus', () => {
    expect(describeJob({ ...base, dossierReference: null, insurerName: null }).title).toBe('Dossier d1 · a');
  });

  it('n’affiche pas d’avancement sans total', () => {
    expect(describeJob({ ...base, currentStep: null, totalSteps: null }).progress).toBeNull();
    expect(describeJob({ ...base, currentStep: 0, totalSteps: 0 }).progress).toBeNull();
  });

  it('traduit chaque statut en français', () => {
    expect(describeJob({ ...base, status: 'needs_info' }).status).toBe('Informations manquantes');
    expect(describeJob({ ...base, status: 'awaiting_submit' }).status).toBe('À valider sur l’extranet');
  });
});
