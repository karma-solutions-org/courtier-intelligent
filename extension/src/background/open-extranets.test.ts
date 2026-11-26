import { describe, expect, it, vi } from 'vitest';

vi.mock('./jobs-service', () => ({ loadInsurers: vi.fn() }));
vi.mock('./tab-jobs', () => ({ pinJob: vi.fn() }));

import { extranetsToOpen, MAX_EXTRANETS_PER_REQUEST } from './open-extranets';
import { InsurerInfo, pinStillOnExtranet } from './origin-match';

/** « Tarifer sur tous les extranets » (phase 3) : ce que l'extension accepte d'ouvrir à la demande de l'app. */

const INSURERS: InsurerInfo[] = [
  { id: 'oyat', name: 'Oyat', extranetDomains: ['www.oyat.fr'] },
  { id: 'zephir', name: 'Zephir', extranetDomains: ['extranet.zephir.fr'] },
  { id: 'oyat-local', name: 'Démo Oyat', extranetDomains: ['localhost:8093'] },
];
const LOCAL = { allowLocalhost: true };

describe('extranetsToOpen', () => {
  it("accepte les extranets du catalogue, chacun pour l'assureur annoncé", () => {
    const plan = extranetsToOpen(
      {
        dossierId: 'd1',
        extranets: [
          { insurerId: 'oyat', url: 'https://www.oyat.fr/devis/auto' },
          { insurerId: 'zephir', url: 'https://extranet.zephir.fr/' },
        ],
      },
      INSURERS,
    );

    expect(plan).toEqual({
      dossierId: 'd1',
      accepted: [
        { dossierId: 'd1', insurerId: 'oyat', url: 'https://www.oyat.fr/devis/auto' },
        { dossierId: 'd1', insurerId: 'zephir', url: 'https://extranet.zephir.fr/' },
      ],
      refused: [],
    });
  });

  it("refuse une adresse hors catalogue, ou l'extranet d'un autre assureur que celui annoncé", () => {
    const plan = extranetsToOpen(
      {
        dossierId: 'd1',
        extranets: [
          { insurerId: 'oyat', url: 'https://phishing.example/oyat' },
          { insurerId: 'zephir', url: 'https://www.oyat.fr/' },
          { insurerId: 'inconnu', url: 'javascript:alert(1)' },
        ],
      },
      INSURERS,
    );

    expect(plan?.accepted).toEqual([]);
    expect(plan?.refused).toEqual(['oyat', 'zephir', 'inconnu']);
  });

  it("n'ouvre qu'une fois un même assureur, et accepte les démos locales en développement", () => {
    const plan = extranetsToOpen(
      {
        dossierId: 'd1',
        extranets: [
          { insurerId: 'oyat-local', url: 'http://localhost:8093/index.html' },
          { insurerId: 'oyat-local', url: 'http://localhost:8093/index.html' },
        ],
      },
      INSURERS,
      LOCAL,
    );

    expect(plan?.accepted).toEqual([{ dossierId: 'd1', insurerId: 'oyat-local', url: 'http://localhost:8093/index.html' }]);
  });

  it.each([
    ['dossier manquant', { extranets: [{ insurerId: 'oyat', url: 'https://www.oyat.fr/' }] }],
    ['dossier invalide', { dossierId: '../x', extranets: [{ insurerId: 'oyat', url: 'https://www.oyat.fr/' }] }],
    ['liste vide', { dossierId: 'd1', extranets: [] }],
    ['assureur invalide', { dossierId: 'd1', extranets: [{ insurerId: 42, url: 'https://www.oyat.fr/' }] }],
    [
      'trop d’extranets',
      { dossierId: 'd1', extranets: Array.from({ length: MAX_EXTRANETS_PER_REQUEST + 1 }, (_, i) => ({ insurerId: `a${i}`, url: 'https://www.oyat.fr/' })) },
    ],
  ])('rejette une demande mal formée (%s)', (_case, request) => {
    expect(extranetsToOpen(request, INSURERS)).toBeNull();
  });
});

describe('pinStillOnExtranet', () => {
  const ref = { dossierId: 'd1', insurerId: 'zephir' };

  it("garde l'épingle d'un onglet resté sur l'extranet de son assureur", () => {
    expect(pinStillOnExtranet(ref, 'https://extranet.zephir.fr/projet', INSURERS)).toBe(true);
  });

  it("libère l'épingle d'un onglet fermé, parti ailleurs ou sur l'extranet d'un autre assureur", () => {
    expect(pinStillOnExtranet(ref, null, INSURERS)).toBe(false);
    expect(pinStillOnExtranet(ref, 'https://www.zephir.fr/', INSURERS)).toBe(false);
    expect(pinStillOnExtranet(ref, 'https://www.oyat.fr/', INSURERS)).toBe(false);
  });
});
