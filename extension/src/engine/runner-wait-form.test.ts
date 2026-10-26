import type { ExtensionReportIssue } from '@shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { JobContext, JobUpdate } from '../shared/messages';
import { FormRunner } from './runner';

// Apprentissage du chemin d'accès : le tableau de bord de l'extranet (moteur de recherche d'Oyat) n'est jamais rempli.
const job: JobContext = {
  dossierId: 'dossier-1',
  insurerId: 'oyat',
  insurerName: 'Oyat',
  status: 'requested',
  quoteData: { 'client.lastName': 'Dupont', 'client.firstName': 'Jeanne', 'client.email': 'jeanne.dupont@exemple.fr', 'vehicle.registration': 'AB-123-CD' },
  missingFields: [],
};

const DASHBOARD = `
  <form>
    <label for="sol">Solution :</label>
    <select id="sol" name="sol" required><option value="">Choisir</option><option value="auto">Assurance Automobile</option></select>
    <label for="type">Je recherche un...</label>
    <select id="type" name="type" required><option value="">Choisir</option><option value="c">Contrat</option></select>
    <label for="immat">Immatriculation ou nom, n° devis :</label><input id="immat" name="immat">
    <button type="button">Lancer la recherche</button>
  </form>`;

const QUOTE_FORM = `
  <form>
    <label for="nom">Nom *</label><input id="nom" name="nom" required>
    <label for="prenom">Prénom *</label><input id="prenom" name="prenom" required>
    <label for="mail">Email</label><input id="mail" name="mail" type="email">
  </form>`;

describe('FormRunner : apprentissage du chemin (waitForForm)', () => {
  let runner: FormRunner | null = null;
  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  const run = async (html: string, waitForForm: boolean) => {
    document.body.innerHTML = html;
    const updates: JobUpdate[] = [];
    const issues: ExtensionReportIssue[] = [];
    const discovered: string[] = [];
    let reached = 0;
    runner = new FormRunner(job, {
      doc: document,
      report: async update => void updates.push(update),
      publish: () => undefined,
      reportIssue: async (_step, issue) => void issues.push(issue),
      reportDiscovered: async (_fingerprint, fields) => void discovered.push(...fields.map(f => f.label)),
      askAi: async () => '{"mappings":[]}',
      formReached: () => void reached++,
      waitForForm,
      quietMs: 20,
      settleTimeoutMs: 300,
    });
    await runner.start();
    return { updates, issues, discovered, reached };
  };

  it('tableau de bord : rien n’est rempli, demandé ni signalé', async () => {
    const result = await run(DASHBOARD, true);
    expect((document.getElementById('immat') as HTMLInputElement).value).toBe('');
    // Seul le passage du job en « analyse » au démarrage : aucun champ manquant, aucune étape.
    expect(result.updates).toEqual([{ status: 'analyzing' }]);
    expect(result.discovered).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.reached).toBe(0);
  });

  it('formulaire de devis reconnu : il est rempli et le chemin est enregistré', async () => {
    const result = await run(QUOTE_FORM, true);
    expect((document.getElementById('nom') as HTMLInputElement).value).toBe('Dupont');
    expect(result.reached).toBe(1);
  });

  it('hors apprentissage, le comportement ne change pas', async () => {
    const result = await run(DASHBOARD, false);
    expect(result.updates.length).toBeGreaterThan(0);
  });
});
