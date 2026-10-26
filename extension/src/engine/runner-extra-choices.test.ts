import { afterEach, describe, expect, it } from 'vitest';
import type { JobContext } from '../shared/messages';
import { FormRunner } from './runner';

// Question ajoutée depuis un extranet : la réponse est un code de choix de cet extranet (`M`) ; un autre extranet
// (Oyat) n'affiche que les libellés, on choisit donc par le libellé du choix.
const job: JobContext = {
  dossierId: 'dossier-1',
  insurerId: 'oyat',
  insurerName: 'Oyat',
  status: 'requested',
  quoteData: { 'client.lastName': 'Dupont', 'client.firstName': 'Jeanne', 'client.email': 'jeanne@exemple.fr', 'extra.situation_matrimoniale': 'M' },
  missingFields: [],
  productQuestions: [
    {
      path: 'extra.situation_matrimoniale',
      label: 'Situation matrimoniale',
      type: 'choice',
      choices: ['Célibataire', 'Marié(e)'],
      choiceLabels: { C: 'Célibataire', M: 'Marié(e)' },
    },
  ],
};

describe('FormRunner : choix d’une question ajoutée depuis un autre extranet', () => {
  let runner: FormRunner | null = null;
  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  it('le code `M` choisit l’option « Marié(e) »', async () => {
    document.body.innerHTML = `
      <form>
        <label for="nom">Nom</label><input id="nom" name="nom">
        <label for="prenom">Prénom</label><input id="prenom" name="prenom">
        <label for="mail">Email</label><input id="mail" name="mail" type="email">
        <label for="sit">Situation matrimoniale</label>
        <select id="sit" name="sit"><option value="1">Célibataire</option><option value="2">Marié(e)</option><option value="3">Veuf(ve)</option></select>
      </form>`;
    runner = new FormRunner(job, {
      doc: document,
      report: async () => undefined,
      publish: () => undefined,
      askAi: async () => '{"mappings":[]}',
      quietMs: 20,
      settleTimeoutMs: 300,
    });
    await runner.start();
    expect((document.getElementById('sit') as HTMLSelectElement).value).toBe('2');
  });
});
