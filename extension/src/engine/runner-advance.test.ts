import type { CanonicalData } from '@shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext, JobUpdate, RunState } from '../shared/messages';
import { AssureurA, mountAssureurA } from './__fixtures__/assureur-a';
import { AskAi } from './ai-fallback';
import { FormRunner } from './runner';

const QUOTE_DATA: CanonicalData = {
  'client.lastName': 'Dupont',
  'client.firstName': 'Jean',
  'client.birthDate': '1985-03-12',
  'client.email': 'jean@example.fr',
  'client.phone': '0612345678',
  'client.address.street': '1 rue de la Paix',
  'client.address.postalCode': '75002',
  'client.address.city': 'Lyon 6e',
  'vehicle.registration': 'AB-123-CD',
  'vehicle.brand': 'Renault',
  'vehicle.model': 'Clio',
  'vehicle.firstRegistrationDate': '2019-05-01',
  'vehicle.fiscalPower': 5,
  'vehicle.usage': 'prive_trajet',
  'vehicle.parkingType': 'voie_publique',
  'driver.lastName': 'Dupont',
  'driver.firstName': 'Jean',
  'driver.birthDate': '1985-03-12',
  'driver.licenseDate': '2004-07-01',
  'insuranceHistory.currentlyInsured': false,
  'insuranceHistory.previousInsurer': null,
  'insuranceHistory.bonusMalus': { value: 0.9, knowledge: 'KNOWN' },
  'insuranceHistory.claimsCount': { value: 0, knowledge: 'KNOWN' },
  'insuranceHistory.wasTerminated': false,
};

const job = (): JobContext => ({
  dossierId: 'dossier-1',
  insurerId: 'assureur-a',
  insurerName: 'Assureur A',
  status: 'requested',
  quoteData: QUOTE_DATA,
  missingFields: [],
});

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function until(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('Délai dépassé : la condition ne s’est pas réalisée.');
    await pause(20);
  }
}

describe('FormRunner : passage automatique à l’étape suivante', () => {
  let reports: JobUpdate[];
  let states: RunState[];
  let ax: AssureurA;
  let runner: FormRunner;
  let clicked: string[];

  const create = (onNext: () => void) => {
    ax = mountAssureurA(document);
    document.getElementById('next')!.addEventListener('click', onNext);
    runner = new FormRunner(job(), {
      doc: document,
      report: async update => void reports.push(update),
      publish: state => void states.push(state),
      askAi: vi.fn<AskAi>(async () => '{"mappings":[]}'),
      autoAdvance: true,
      quietMs: 40,
      settleTimeoutMs: 1000,
    });
  };

  const recordClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest('button');
    if (button) clicked.push(button.id);
  };

  beforeEach(() => {
    reports = [];
    states = [];
    clicked = [];
    document.addEventListener('click', recordClick, true);
  });

  afterEach(() => {
    runner?.stop();
    document.removeEventListener('click', recordClick, true);
    document.body.innerHTML = '';
  });

  it('remplit chaque étape, clique sur « Suivant », et s’arrête avant « Obtenir mon tarif »', async () => {
    create(() => ax.next());
    await runner.start();

    await until(() => reports.at(-1)?.status === 'awaiting_submit');
    expect(ax.step).toBe(3);
    expect(clicked.filter(id => id === 'next')).toHaveLength(2);
    expect(clicked).not.toContain('submit');
  });

  it('rend la main au courtier quand l’extranet refuse l’étape', async () => {
    create(() => {
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert');
      alert.textContent = 'Le numéro de téléphone est invalide.';
      document.getElementById('content')!.appendChild(alert);
    });
    await runner.start();

    await until(() => states.some(state => state.message?.includes('refusé cette étape') ?? false));
    expect(ax.step).toBe(1);
    expect(states.at(-1)!.phase).toBe('waiting_user');
    // Un seul essai par étape : pas de clics en boucle.
    await pause(300);
    expect(clicked.filter(id => id === 'next')).toHaveLength(1);
  });
});
