import { describe, expect, it } from 'vitest';
import { countRequested, hostMatchesDomain, insurerForOrigin, InsurerInfo, JobRecord, pickJobForOrigin } from './origin-match';

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

  it('ne remplit jamais une page non sécurisée (http), sauf localhost pour les essais', () => {
    expect(insurerForOrigin('http://extranet.assureur-a.fr', INSURERS)).toBeNull();
    expect(insurerForOrigin('http://localhost:8080', [{ id: 'x', name: 'X', extranetDomains: ['localhost'] }])?.id).toBe('x');
  });
});

describe('pickJobForOrigin', () => {
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
