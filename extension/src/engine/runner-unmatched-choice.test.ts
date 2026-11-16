import type { DiscoveredFieldInput } from '@shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { JobContext } from '../shared/messages';
import { FormRunner } from './runner';

// Liste obligatoire de l'extranet dont aucune option ne correspond au dossier (Oyat : « Profession ») : la question est
// signalée avec les options de l'extranet, pour que le courtier y réponde dans l'application.
const job: JobContext = {
  dossierId: 'dossier-1',
  insurerId: 'oyat',
  insurerName: 'Oyat',
  status: 'requested',
  quoteData: { 'client.lastName': 'Martin', 'client.firstName': 'Paul', 'client.email': 'paul@exemple.fr', 'driver.profession': 'mètreur' },
  missingFields: [],
};

describe('FormRunner : liste sans option correspondant au dossier', () => {
  let runner: FormRunner | null = null;
  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  it('signale la question avec les options de l’extranet, sans rien choisir au hasard', async () => {
    document.body.innerHTML = `
      <form>
        <label for="nom">Nom</label><input id="nom" name="nom">
        <label for="prenom">Prénom</label><input id="prenom" name="prenom">
        <label for="mail">Email</label><input id="mail" name="mail" type="email">
        <label for="prof">Profession *</label>
        <select id="prof" name="oProfession" required>
          <option value="">Choisissez</option><option value="104">Salarié Sédentaire</option><option value="901">Artisan</option><option value="902">Commerçant</option>
        </select>
      </form>`;
    const reported: DiscoveredFieldInput[] = [];
    runner = new FormRunner(job, {
      doc: document,
      report: async () => undefined,
      publish: () => undefined,
      reportDiscovered: async (_fingerprint, fields) => void reported.push(...fields),
      askAi: async () => '{"mappings":[]}',
      quietMs: 20,
      settleTimeoutMs: 300,
    });
    await runner.start();

    expect((document.getElementById('prof') as HTMLSelectElement).value).toBe('');
    const profession = reported.find(field => field.label === 'Profession');
    expect(profession).toMatchObject({ kind: 'select', required: true });
    expect(profession!.options.map(o => o.label)).toEqual(['Salarié Sédentaire', 'Artisan', 'Commerçant']);
  });
});
