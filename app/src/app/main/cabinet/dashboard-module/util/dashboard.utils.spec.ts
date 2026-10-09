import { Dossier } from '@shared';
import { conversionRates, countByStatus, dossiersToProcess, FOLLOW_UP_DELAY_MS, proposalsToFollowUp } from './dashboard.utils';

const at = (ms: number) => ({ toMillis: () => ms });
const dossier = (overrides: Partial<Dossier>): Dossier =>
  ({ id: 'd', reference: null, assureId: 'a', productId: 'auto', assignedTo: 'u1', status: 'brouillon', proposal: null, ...overrides }) as Dossier;

describe('countByStatus', () => {
  it('compte chaque statut, zéro compris', () => {
    const counts = countByStatus([dossier({ status: 'complet' }), dossier({ status: 'complet' }), dossier({ status: 'souscrit' })]);
    expect(counts.complet).toBe(2);
    expect(counts.souscrit).toBe(1);
    expect(counts.brouillon).toBe(0);
  });
});

describe('dossiersToProcess', () => {
  it('garde mes dossiers en attente d’action, les plus anciens d’abord', () => {
    const list = [
      dossier({ id: '1', status: 'decision', updatedAt: at(300) }),
      dossier({ id: '2', status: 'brouillon', updatedAt: at(100) }),
      dossier({ id: '3', status: 'proposition_envoyee' }),
      dossier({ id: '4', status: 'complet', assignedTo: 'u2' }),
    ];
    expect(dossiersToProcess(list, 'u1').map(d => d.id)).toEqual(['2', '1']);
    expect(dossiersToProcess(list, null)).toEqual([]);
  });
});

describe('proposalsToFollowUp', () => {
  it('garde les propositions envoyées depuis plus de 7 jours', () => {
    const now = 10 * FOLLOW_UP_DELAY_MS;
    const list = [
      dossier({ id: 'old', status: 'proposition_envoyee', proposal: { sentTo: 'x', sentAt: at(now - FOLLOW_UP_DELAY_MS - 1) } }),
      dossier({ id: 'recent', status: 'proposition_envoyee', proposal: { sentTo: 'x', sentAt: at(now - 1000) } }),
      dossier({ id: 'nodate', status: 'proposition_envoyee', proposal: { sentTo: 'x' } }),
      dossier({ id: 'none', status: 'proposition_envoyee', proposal: null }),
      dossier({ id: 'done', status: 'souscrit', proposal: { sentTo: 'x', sentAt: at(0) } }),
    ];
    expect(proposalsToFollowUp(list, now).map(d => d.id)).toEqual(['old']);
  });
});

describe('conversionRates', () => {
  it('calcule souscrit / (souscrit + refusé + sans suite) par clé', () => {
    const list = [
      dossier({ assignedTo: 'u1', status: 'souscrit' }),
      dossier({ assignedTo: 'u1', status: 'refuse' }),
      dossier({ assignedTo: 'u1', status: 'decision' }),
      dossier({ assignedTo: 'u2', status: 'souscrit' }),
      dossier({ assignedTo: 'u3', status: 'brouillon' }),
    ];
    expect(conversionRates(list, d => d.assignedTo)).toEqual([
      { key: 'u2', souscrit: 1, closed: 1, rate: 1 },
      { key: 'u1', souscrit: 1, closed: 2, rate: 0.5 },
    ]);
  });
});
