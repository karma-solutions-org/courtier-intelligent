import { afterEach, describe, expect, it } from 'vitest';
import type { JobContext, JobUpdate } from '../shared/messages';
import { FormRunner } from './runner';
import { RESULT_TABLE } from './__fixtures__/resultats';

const job: JobContext = {
  dossierId: 'dossier-1',
  insurerId: 'zephir',
  insurerName: 'Zephir',
  status: 'requested',
  quoteData: { 'client.lastName': 'Dupont' },
  missingFields: [],
};

const until = async (check: () => boolean, ms = 2000) => {
  for (const start = Date.now(); !check() && Date.now() - start < ms; ) await new Promise(r => setTimeout(r, 20));
};

/**
 * Question découverte pendant la tarification : le dossier n'est plus modifiable, la question doit donc arriver dans
 * les champs manquants du job (le courtier la renseigne dans la carte de l'assureur).
 */
describe('FormRunner : question découverte, demandée au courtier', () => {
  let runner: FormRunner | null = null;
  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  it('le chemin renvoyé par le serveur devient un champ manquant du job', async () => {
    document.body.innerHTML = `<form><div class="form-input"><label><span>Le véhicule est-il utilisé pour le transport de matières dangereuses ?</span></label>
      <div class="form-input"><mat-button-toggle-group role="group" required="" class="ng-untouched ng-pristine ng-invalid">
        <mat-button-toggle value="true"><button type="button" aria-pressed="false" name="AUTO03"><span><span>Oui</span></span></button></mat-button-toggle>
        <mat-button-toggle value="false"><button type="button" aria-pressed="false" name="AUTO03"><span><span>Non</span></span></button></mat-button-toggle>
      </mat-button-toggle-group></div></div></form>`;
    const updates: JobUpdate[] = [];
    const reported: string[][] = [];
    runner = new FormRunner(job, {
      doc: document,
      report: async update => void updates.push(update),
      publish: () => undefined,
      askAi: async () => '{"mappings":[]}',
      reportDiscovered: async (_fingerprint, fields) => {
        reported.push(fields.map(f => f.label));
        return Object.fromEntries(fields.map(f => [f.fieldKey, 'extra.transport_matieres_dangereuses']));
      },
      origin: 'https://zeole.zephir.fr',
      quietMs: 20,
      settleTimeoutMs: 300,
    });
    await runner.start();
    await until(() => updates.some(u => u.missingFields?.length));
    expect(reported[0]).toEqual(['Le véhicule est-il utilisé pour le transport de matières dangereuses ?']);
    const needsInfo = updates.find(u => u.missingFields?.length);
    expect(needsInfo?.status).toBe('needs_info');
    expect(needsInfo?.missingFields?.map(m => m.canonicalPath)).toEqual(['extra.transport_matieres_dangereuses']);
  });
});

describe('FormRunner : pause', () => {
  let runner: FormRunner | null = null;
  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  it('ne remplit rien en pause, remplit à la reprise', async () => {
    document.body.innerHTML = '<form><label for="n">Nom</label><input id="n" name="nom" /></form>';
    runner = new FormRunner(job, {
      doc: document,
      report: async () => undefined,
      publish: () => undefined,
      askAi: async () => '{"mappings":[]}',
      quietMs: 20,
      settleTimeoutMs: 300,
    });
    runner.pause();
    await runner.start();
    const input = document.querySelector<HTMLInputElement>('#n')!;
    expect(input.value).toBe('');
    await runner.resume();
    expect(input.value).toBe('Dupont');
  });
});

describe('FormRunner : tarif affiché (bouton « Sauvegarder le tarif »)', () => {
  const make = () =>
    new FormRunner(job, { doc: document, report: async () => undefined, publish: () => undefined, askAi: async () => '{}' });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('page de résultat avec un tarif : oui', () => {
    document.body.innerHTML = RESULT_TABLE;
    expect(make().hasTariffOnPage()).toBe(true);
  });

  it('formulaire à remplir : non', () => {
    document.body.innerHTML = '<form><label for="n">Nom</label><input id="n" name="nom" /><button>Suivant</button></form>';
    expect(make().hasTariffOnPage()).toBe(false);
  });
});
