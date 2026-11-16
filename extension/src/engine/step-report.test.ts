import { sanitizeSnapshot, type BlockedStepSnapshot, type ExtensionReportIssue } from '@shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { JobContext } from '../shared/messages';
import { failureCode } from './flow/step-report';
import { FormRunner } from './runner';

// Photo d'une étape bloquée (signalements step_blocked / advance_refused) : structure seulement, jamais de valeur.
const job: JobContext = {
  dossierId: 'dossier-1',
  insurerId: 'assureur-a',
  insurerName: 'Assureur A',
  status: 'requested',
  quoteData: { 'client.lastName': 'Dupont', 'client.firstName': 'Jeanne', 'client.email': 'jeanne.dupont@exemple.fr', 'client.birthDate': '1980-05-12' },
  missingFields: [],
};

describe('failureCode : raison du moteur → code fermé', () => {
  it.each([
    ['Aucune option ne correspond à « Peugeot 208 ».', 'no_option'],
    ['Aucune suggestion ne correspond à « Lyon » : valeur saisie à vérifier.', 'no_option'],
    ["L'extranet n'a pas accepté la valeur (« 12 »).", 'rejected'],
    ["L'option n'a pas pu être sélectionnée.", 'rejected'],
    ['Date illisible : 1980-13-45', 'bad_value'],
    ['La valeur dépasse la longueur maximale du champ (5 caractères).', 'bad_value'],
    ['Le bouton radio est introuvable.', 'not_found'],
    ["Le champ n'est plus dans la page.", 'not_found'],
    ['autre chose', 'other'],
  ])('« %s » → %s', (reason, code) => {
    expect(failureCode(reason)).toBe(code);
  });
});

describe('sanitizeSnapshot : revérifiée avant l’écriture', () => {
  const field = { label: 'Usage', kind: 'select', required: true, status: 'failed', path: 'vehicle.usage', failure: 'no_option', optionCount: 0 };

  it('garde une photo valide telle quelle', () => {
    const photo = { stepNumber: 2, fields: [field], buttons: ['Suivant'] };
    expect(sanitizeSnapshot(photo)).toEqual(photo);
  });

  it('écarte les clés, codes et champs inconnus', () => {
    const photo = sanitizeSnapshot({
      stepNumber: 2,
      html: '<form>',
      fields: [{ ...field, value: 'Dupont', failure: 'Aucune option « Dupont »' }, { ...field, status: 'bizarre' }],
      buttons: ['Suivant', 42],
    });
    expect(photo).toEqual({ stepNumber: 2, fields: [{ ...field, failure: undefined }].map(({ failure: _, ...f }) => f), buttons: ['Suivant'] });
  });

  it('plafonne les listes et refuse une photo vide', () => {
    expect(sanitizeSnapshot({ stepNumber: null, fields: Array(200).fill(field), buttons: [] })!.fields).toHaveLength(80);
    expect(sanitizeSnapshot({ stepNumber: 1, fields: [], buttons: [] })).toBeNull();
    expect(sanitizeSnapshot('nope')).toBeNull();
  });
});

describe('FormRunner : étape bloquée signalée avec sa photo', () => {
  let runner: FormRunner | null = null;
  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  const run = async (html: string) => {
    document.body.innerHTML = html;
    const reports: [ExtensionReportIssue, BlockedStepSnapshot | undefined][] = [];
    runner = new FormRunner(job, {
      doc: document,
      report: async () => undefined,
      publish: () => undefined,
      reportIssue: async (_step, issue, snapshot) => void reports.push([issue, snapshot]),
      askAi: async () => '{"mappings":[]}',
      autoAdvance: true,
      quietMs: 20,
      settleTimeoutMs: 300,
    });
    await runner.start();
    return reports;
  };
  const photoOf = (reports: [ExtensionReportIssue, BlockedStepSnapshot | undefined][], issue: ExtensionReportIssue) =>
    reports.find(([code]) => code === issue)?.[1];

  const IDENTITY = `
    <label for="prenom">Prénom</label><input id="prenom" name="prenom">
    <label for="mail">Adresse e-mail</label><input id="mail" name="mail" type="email">`;

  it('champ obligatoire en échec : step_blocked, avec la raison codée et sans valeur du dossier', async () => {
    const reports = await run(`
      <form>
        <label for="nom">Nom</label><input id="nom" name="nom">
        <label for="naissance">Date de naissance *</label><input id="naissance" name="naissance" required maxlength="4">
        ${IDENTITY}
        <button type="button">Suivant</button>
      </form>`);
    const photo = photoOf(reports, 'step_blocked');
    expect(photo).toBeDefined();
    expect(photo!.fields.find(f => f.label === 'Date de naissance')).toMatchObject({ required: true, status: 'failed', failure: 'bad_value', path: 'client.birthDate' });
    expect(photo!.buttons).toContain('Suivant');
    expect(JSON.stringify(photo)).not.toMatch(/Dupont|Jeanne|exemple\.fr|1980/);
  });

  it('« Suivant » refusé par l’extranet : advance_refused, avec l’état de chaque champ', async () => {
    const reports = await run(`
      <form>
        <label for="nom">Nom</label><input id="nom" name="nom">
        ${IDENTITY}
        <label for="mystere">Code apporteur Wxq *</label><input id="mystere" name="mystere" required>
        <button type="button">Suivant</button>
      </form>`);
    const photo = photoOf(reports, 'advance_refused');
    expect(photo).toBeDefined();
    expect(photo!.fields.find(f => f.label.startsWith('Code apporteur'))).toMatchObject({ required: true, status: 'unmapped', path: null });
    expect(photo!.fields.find(f => f.label === 'Nom')).toMatchObject({ status: 'filled', path: 'client.lastName' });
    expect(JSON.stringify(photo)).not.toMatch(/Dupont|Jeanne|exemple\.fr|1980/);
  });
});
