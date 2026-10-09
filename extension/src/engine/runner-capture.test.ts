import type { CanonicalData, ExtensionReportIssue, ExtensionReportStep } from '@shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext, JobUpdate, RunState } from '../shared/messages';
import { mountAssureurA } from './__fixtures__/assureur-a';
import { RESULT_EMPTY, RESULT_FREE_TEXT, RESULT_TABLE } from './__fixtures__/resultats';
import { AskAi } from './ai-fallback';
import { FormRunner } from './runner';

const QUOTE_DATA: CanonicalData = {
  'client.lastName': 'Dupont',
  'client.firstName': 'Jean',
  'client.email': 'jean@example.fr',
  'client.phone': '0612345678',
  'vehicle.registration': 'AB-123-CD',
};

const job: JobContext = {
  dossierId: 'dossier-1',
  insurerId: 'assureur-a',
  insurerName: 'Assureur A',
  status: 'awaiting_submit',
  quoteData: QUOTE_DATA,
  missingFields: [],
};

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('Délai dépassé : la condition ne s’est pas réalisée.');
    await pause(20);
  }
}

describe('FormRunner : capture du tarif', () => {
  let reports: JobUpdate[];
  let states: RunState[];
  let issues: [ExtensionReportStep, ExtensionReportIssue][];
  let ask: ReturnType<typeof vi.fn<AskAi>>;
  let runner: FormRunner;
  let clicked: string[];

  const lastState = () => states.at(-1)!;
  const create = () => {
    runner = new FormRunner(job, {
      doc: document,
      report: async update => void reports.push(update),
      publish: state => void states.push(state),
      reportIssue: async (step, issue) => void issues.push([step, issue]),
      askAi: ask,
      quietMs: 40,
      settleTimeoutMs: 1000,
    });
  };

  beforeEach(() => {
    reports = [];
    states = [];
    issues = [];
    clicked = [];
    ask = vi.fn<AskAi>(async () => '{"mappings":[]}');
    document.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('button')) clicked.push((event.target as HTMLElement).textContent ?? '');
    }, true);
  });

  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  it('page de résultat ouverte après la soumission : lit le tarif sans rien remplir ni rien écrire, et le propose au courtier', async () => {
    document.body.innerHTML = RESULT_TABLE;
    create();
    await runner.start();

    expect(lastState()).toMatchObject({ phase: 'capture_review', insurerId: 'assureur-a', dossierId: 'dossier-1', capture: { source: 'dom' } });
    expect(lastState().capture?.offer).toMatchObject({ premiumAnnual: 642.3, premiumMonthly: 53.53, quoteNumber: 'DEV-2026-0042' });
    // Rien n'est enregistré avant la confirmation du courtier, et aucun bouton n'est cliqué.
    expect(reports).toEqual([]);
    expect(clicked).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
    expect(issues).toEqual([]);
  });

  it('le courtier soumet et l’extranet affiche le tarif sans recharger la page : la capture prend le relais du remplissage', async () => {
    const extranet = mountAssureurA(document);
    create();
    await runner.start();
    expect(reports[0]).toEqual({ status: 'analyzing' });

    // Le courtier clique lui-même : la page de résultat remplace le formulaire.
    document.getElementById('wizard')!.outerHTML = RESULT_TABLE;
    await until(() => lastState().phase === 'capture_review');
    expect(lastState().capture?.offer?.premiumAnnual).toBe(642.3);
    expect(extranet.step).toBe(1);
  });

  it('montants sans libellé clair : l’IA complète, sans recevoir aucune donnée du client', async () => {
    ask.mockResolvedValue(
      JSON.stringify({
        isResultPage: true,
        quoteNumber: null,
        premiumAnnual: 712,
        premiumMonthly: 61.2,
        generalDeductible: null,
        guarantees: [{ label: 'Responsabilité civile', included: true, limit: null, deductible: null }],
        exclusions: [],
      }),
    );
    document.body.innerHTML = RESULT_FREE_TEXT;
    create();
    await runner.start();

    const sent = JSON.stringify(ask.mock.calls[0][0]);
    for (const secret of ['Dupont', 'Jean', 'jean@example.fr', '06 12 34 56 78', 'AB123CD']) expect(sent).not.toContain(secret);
    expect(lastState()).toMatchObject({ phase: 'capture_review', aiUsed: true, capture: { source: 'ai', offer: { premiumAnnual: 712, premiumMonthly: 61.2 } } });
  });

  it('aucun tarif lisible : échec affiché et signalé par un code, sans donnée client', async () => {
    ask.mockRejectedValue(new Error('IA indisponible'));
    document.body.innerHTML = RESULT_EMPTY;
    create();
    await runner.start();

    expect(lastState()).toMatchObject({ phase: 'capture_failed', capture: { offer: null } });
    expect(lastState().message).toContain('Aucun tarif');
    expect(issues).toEqual([['extract', 'ai_unavailable']]);
  });

  it('« Lire le tarif de cette page » : lecture à la demande quand la détection n’a rien reconnu', async () => {
    document.body.innerHTML = '<h1>Espace courtier</h1><p>Montant TTC à régler : 590 € par an</p>';
    create();
    await runner.start();
    expect(states.some(s => s.phase === 'capture_review')).toBe(false);

    await runner.captureNow();
    expect(lastState()).toMatchObject({ phase: 'capture_review', capture: { offer: { premiumAnnual: 590 } } });
  });
});
