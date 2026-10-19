import type { ExtensionReportIssue, ExtensionReportStep } from '@shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { JobContext, JobUpdate } from '../shared/messages';
import { FormRunner } from './runner';

const job: JobContext = {
  dossierId: 'dossier-1',
  insurerId: 'assureur-a',
  insurerName: 'Assureur A',
  status: 'requested',
  quoteData: { 'client.lastName': 'Dupont' },
  missingFields: [],
};

/** Signalements du remplissage (E10-4) : des codes seulement, jamais de donnée client. */
describe('FormRunner : signalements du remplissage', () => {
  let runner: FormRunner | null = null;

  const run = async (report: (update: JobUpdate) => Promise<void> = async () => undefined) => {
    const issues: [ExtensionReportStep, ExtensionReportIssue][] = [];
    runner = new FormRunner(job, {
      doc: document,
      report,
      publish: () => undefined,
      reportIssue: async (step, issue) => void issues.push([step, issue]),
      askAi: async () => '{"mappings":[]}',
      quietMs: 20,
      settleTimeoutMs: 300,
    });
    await runner.start();
    return issues;
  };

  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  it('signale une première page sans champ (analyse)', async () => {
    document.body.innerHTML = '<p>Bienvenue sur votre espace.</p>';
    expect(await run()).toEqual([['analyze', 'no_fields']]);
  });

  it('signale un formulaire dont aucun champ ne correspond au dossier (mapping)', async () => {
    document.body.innerHTML = '<form><label for="x">Code interne XZ</label><input id="x" name="zz_code" /></form>';
    expect(await run()).toContainEqual(['mapping', 'no_field_mapped']);
  });

  it('signale un avancement du job non enregistré, sans interrompre le remplissage', async () => {
    document.body.innerHTML = '<p>Bienvenue sur votre espace.</p>';
    const issues = await run(async () => {
      throw new Error('hors ligne');
    });
    expect(issues).toContainEqual(['analyze', 'job_update_failed']);
  });

  it('ne transmet que des codes connus', async () => {
    document.body.innerHTML = '<form><label for="n">Nom</label><input id="n" name="nom" /></form>';
    const issues = await run();
    for (const [step, issue] of issues) {
      expect(typeof step).toBe('string');
      expect(issue).not.toContain('Dupont');
    }
  });
});
