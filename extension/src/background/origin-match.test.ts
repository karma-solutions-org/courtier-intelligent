import { describe, expect, it } from 'vitest';
import { countRequested, extranetPatterns, hostMatchesDomain, insurerForOrigin, InsurerInfo, JobRecord, pickJobForOrigin } from './origin-match';

const INSURERS: InsurerInfo[] = [
  { id: 'assureur-a', name: 'Assureur A', extranetDomains: ['extranet.assureur-a.fr'] },
  { id: 'assureur-b', name: 'Assureur B', extranetDomains: ['courtiers.assureur-b.com', 'b-pro.example'] },
];

const job = (insurerId: string, status: JobRecord['data']['status'], dossierId = 'd1', quoteData = { 'client.lastName': 'Dupont' }): JobRecord => ({
  dossierId,
  insurerId,
  data: { status, quoteData },
});

describe('hostMatchesDomain', () => {
  it.each([
    ['extranet.assureur-a.fr', 'extranet.assureur-a.fr', true],
    ['EXTRANET.Assureur-A.fr', 'extranet.assureur-a.fr', true],
    ['login.extranet.assureur-a.fr', 'extranet.assureur-a.fr', true],
    ['extranet.assureur-a.fr.', 'extranet.assureur-a.fr', true],
    ['x.assureur-a.fr', '*.assureur-a.fr', true],
    ['assureur-a.fr', 'extranet.assureur-a.fr', false],
    ['evil-extranet.assureur-a.fr', 'extranet.assureur-a.fr', false],
    ['extranet.assureur-a.fr.evil.com', 'extranet.assureur-a.fr', false],
    ['extranet.assureur-a.frx', 'extranet.assureur-a.fr', false],
    ['anything.com', '', false],
    // Domaine sans point : refusé (couvrirait tout un TLD ou un hôte interne).
    ['evil.com', 'com', false],
    ['intranet', 'intranet', false],
    ['localhost', 'localhost', false],
  ])('%s ∈ %s : %s', (host, domain, expected) => {
    expect(hostMatchesDomain(host, domain)).toBe(expected);
  });
});

describe('insurerForOrigin', () => {
  it('reconnaît l’assureur d’après le domaine de la page', () => {
    expect(insurerForOrigin('https://extranet.assureur-a.fr', INSURERS)?.id).toBe('assureur-a');
    expect(insurerForOrigin('https://courtiers.assureur-b.com/tarif', INSURERS)?.id).toBe('assureur-b');
    expect(insurerForOrigin('https://b-pro.example', INSURERS)?.id).toBe('assureur-b');
  });

  it('ignore les autres sites', () => {
    expect(insurerForOrigin('https://www.google.com', INSURERS)).toBeNull();
    expect(insurerForOrigin('https://extranet.assureur-a.fr.evil.com', INSURERS)).toBeNull();
    expect(insurerForOrigin('not a url', INSURERS)).toBeNull();
  });

  it('ne remplit jamais une page non sécurisée (http), sauf localhost dans un build de développement', () => {
    const local: InsurerInfo[] = [{ id: 'x', name: 'X', extranetDomains: ['localhost:8080'] }];
    expect(insurerForOrigin('http://extranet.assureur-a.fr', INSURERS)).toBeNull();
    expect(insurerForOrigin('http://extranet.assureur-a.fr', INSURERS, { allowLocalhost: true })).toBeNull();
    // Build de production (défaut dans les tests) : localhost refusé.
    expect(insurerForOrigin('http://localhost:8080', local)).toBeNull();
    expect(insurerForOrigin('http://localhost:8080', local, { allowLocalhost: true })?.id).toBe('x');
  });

  it('localhost : hôte ET port comparés au domaine du catalogue (jamais une autre démo ou l’app sur un autre port)', () => {
    const local: InsurerInfo[] = [
      { id: 'auto', name: 'Auto', extranetDomains: ['localhost:8090'] },
      { id: 'hab', name: 'Hab', extranetDomains: ['localhost:8091'] },
    ];
    expect(insurerForOrigin('http://localhost:8090', local, { allowLocalhost: true })?.id).toBe('auto');
    expect(insurerForOrigin('http://localhost:8091', local, { allowLocalhost: true })?.id).toBe('hab');
    expect(insurerForOrigin('http://localhost:9999', local, { allowLocalhost: true })).toBeNull();
    // « localhost » sans port : port par défaut seulement.
    const bare: InsurerInfo[] = [{ id: 'x', name: 'X', extranetDomains: ['localhost'] }];
    expect(insurerForOrigin('http://localhost:8090', bare, { allowLocalhost: true })).toBeNull();
    expect(insurerForOrigin('http://localhost', bare, { allowLocalhost: true })?.id).toBe('x');
    expect(extranetPatterns(['localhost:8090'], { allowLocalhost: true })).toEqual(['http://localhost/*']);
  });

  it('ignore un domaine du catalogue sans point', () => {
    expect(insurerForOrigin('https://www.google.com', [{ id: 'x', name: 'X', extranetDomains: ['com'] }])).toBeNull();
  });
});

describe('extranetPatterns', () => {
  it('https seulement, domaine et sous-domaines', () => {
    expect(extranetPatterns(['extranet.assureur-a.fr', '*.b.com'])).toEqual([
      'https://extranet.assureur-a.fr/*',
      'https://*.extranet.assureur-a.fr/*',
      'https://b.com/*',
      'https://*.b.com/*',
    ]);
  });

  it('écarte les domaines invalides ; localhost seulement en développement', () => {
    expect(extranetPatterns(['com', '', 'localhost', 'a b.fr'])).toEqual([]);
    expect(extranetPatterns(['localhost'], { allowLocalhost: true })).toEqual(['http://localhost/*']);
  });
});

describe('pickJobForOrigin', () => {
  it('reprend les productPaths du job', () => {
    const record = { ...job('assureur-a', 'requested'), data: { status: 'requested' as const, productPaths: ['client.lastName'] } };
    expect(pickJobForOrigin([record], INSURERS, 'https://extranet.assureur-a.fr')?.productPaths).toEqual(['client.lastName']);
  });

  it('ne prend jamais un job annulé', () => {
    expect(pickJobForOrigin([job('assureur-a', 'cancelled')], INSURERS, 'https://extranet.assureur-a.fr')).toBeNull();
  });

  it('prend le job de l’assureur de la page', () => {
    const picked = pickJobForOrigin([job('assureur-b', 'requested'), job('assureur-a', 'requested', 'd2')], INSURERS, 'https://extranet.assureur-a.fr/devis');

    expect(picked).toMatchObject({ insurerId: 'assureur-a', insurerName: 'Assureur A', dossierId: 'd2', status: 'requested', quoteData: { 'client.lastName': 'Dupont' }, missingFields: [] });
  });

  it('prend le plus récent quand plusieurs jobs visent le même assureur', () => {
    expect(pickJobForOrigin([job('assureur-a', 'requested', 'recent'), job('assureur-a', 'requested', 'ancien')], INSURERS, 'https://extranet.assureur-a.fr')?.dossierId).toBe('recent');
  });

  // « awaiting_submit » : le courtier a soumis, la page qui s'ouvre est celle du résultat (capture du tarif).
  it.each(['requested', 'analyzing', 'needs_info', 'filling', 'awaiting_submit'] as const)('exécute ou reprend un job « %s »', status => {
    expect(pickJobForOrigin([job('assureur-a', status)], INSURERS, 'https://extranet.assureur-a.fr')).not.toBeNull();
  });

  it.each(['captured', 'failed'] as const)('ne touche pas un job « %s »', status => {
    expect(pickJobForOrigin([job('assureur-a', status)], INSURERS, 'https://extranet.assureur-a.fr')).toBeNull();
  });

  it('plusieurs assureurs sur le même domaine : prend le job de celui qui en a un (démos sur localhost)', () => {
    const localInsurers: InsurerInfo[] = [
      { id: 'assureur-test-local', name: 'Assureur Test', extranetDomains: ['localhost:8091'] },
      { id: 'assureur-habitat-demo', name: 'Habitation Démo', extranetDomains: ['localhost:8091'] },
    ];
    const picked = pickJobForOrigin([job('assureur-habitat-demo', 'requested', 'd-hab')], localInsurers, 'http://localhost:8091/index.html', {
      allowLocalhost: true,
    });

    expect(picked).toMatchObject({ insurerId: 'assureur-habitat-demo', insurerName: 'Habitation Démo', dossierId: 'd-hab' });
  });

  it("l'application elle-même n'est jamais un extranet, même sur le domaine d'un extranet de démo", () => {
    const localInsurers: InsurerInfo[] = [{ id: 'assureur-habitat-demo', name: 'Habitation Démo', extranetDomains: ['localhost:8091'] }];
    const jobs = [job('assureur-habitat-demo', 'requested', 'd-hab')];
    expect(pickJobForOrigin(jobs, localInsurers, 'http://localhost:4200/espace/parametres', { allowLocalhost: true })).toBeNull();
    expect(pickJobForOrigin(jobs, localInsurers, 'http://localhost:8091/devis-etape1.html', { allowLocalhost: true })).not.toBeNull();
  });

  it('reprend le job épinglé à l’onglet au rechargement, même si un autre est plus récent', () => {
    const jobs = [job('assureur-a', 'requested', 'd-recent'), job('assureur-a', 'filling', 'd-pinned')];
    const picked = pickJobForOrigin(jobs, INSURERS, 'https://extranet.assureur-a.fr', { pinned: { dossierId: 'd-pinned', insurerId: 'assureur-a' } });
    expect(picked?.dossierId).toBe('d-pinned');
  });

  it('job épinglé terminé : prend un autre job libre', () => {
    const jobs = [job('assureur-a', 'requested', 'd-new'), job('assureur-a', 'captured', 'd-pinned')];
    const picked = pickJobForOrigin(jobs, INSURERS, 'https://extranet.assureur-a.fr', { pinned: { dossierId: 'd-pinned', insurerId: 'assureur-a' } });
    expect(picked?.dossierId).toBe('d-new');
  });

  it('jamais deux onglets sur le même job : ceux des autres onglets sont exclus', () => {
    const jobs = [job('assureur-a', 'requested', 'd1'), job('assureur-a', 'requested', 'd2')];
    const exclude = [{ dossierId: 'd1', insurerId: 'assureur-a' }];
    expect(pickJobForOrigin(jobs, INSURERS, 'https://extranet.assureur-a.fr', { exclude })?.dossierId).toBe('d2');
    expect(pickJobForOrigin([jobs[0]], INSURERS, 'https://extranet.assureur-a.fr', { exclude })).toBeNull();
  });

  it('rien sur un site inconnu, ou sans job pour cet assureur', () => {
    expect(pickJobForOrigin([job('assureur-a', 'requested')], INSURERS, 'https://www.google.com')).toBeNull();
    expect(pickJobForOrigin([job('assureur-b', 'requested')], INSURERS, 'https://extranet.assureur-a.fr')).toBeNull();
    expect(pickJobForOrigin([], INSURERS, 'https://extranet.assureur-a.fr')).toBeNull();
  });
});

describe('countRequested', () => {
  it('compte les jobs à lancer', () => {
    expect(countRequested([job('a', 'requested'), job('b', 'requested'), job('c', 'filling'), job('d', 'captured')])).toBe(2);
    expect(countRequested([])).toBe(0);
  });
});
