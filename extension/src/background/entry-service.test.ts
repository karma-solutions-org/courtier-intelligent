import type { ExtranetProfile, NavAction } from '@shared';
import { describe, expect, it } from 'vitest';
import type { JobContext } from '../shared/messages';
import { entryClicked, entryFailed, entryRecorded, initialEntry, instructionFor, profileFrom, startRecording } from './entry-service';

const ORIGIN = 'https://zeole.zephir.fr';
const job: JobContext & { productId: string } = {
  dossierId: 'd1',
  insurerId: 'zephir',
  insurerName: 'Zeole Zephir',
  status: 'requested',
  quoteData: {},
  missingFields: [],
  productId: 'auto',
};
const action = (label: string): NavAction => ({ label, selector: null, urlPattern: '/accueil' });
const profile: ExtranetProfile = {
  insurerId: 'zephir',
  productId: 'auto',
  origin: ORIGIN,
  version: 1,
  status: 'draft',
  entry: [action('Tarificateur'), action('Auto'), action('Nouveau devis')],
};

describe('entry-service', () => {
  it('sans profil, rien à rejouer', () => {
    expect(instructionFor(initialEntry(job, ORIGIN, null))).toEqual({ mode: 'none' });
  });

  it('rejoue le profil clic par clic, puis laisse remplir', () => {
    let entry = initialEntry(job, ORIGIN, profile);
    expect(instructionFor(entry)).toEqual({ mode: 'replay', action: action('Tarificateur'), index: 0, total: 3 });
    entry = entryClicked(entry, 0);
    entry = entryClicked(entry, 0); // doublon ignoré
    expect(entry.index).toBe(1);
    entry = entryClicked(entryClicked(entry, 1), 2);
    expect(entry.mode).toBe('done');
    expect(instructionFor(entry)).toEqual({ mode: 'none' });
  });

  it('un profil d’une autre origine n’est pas rejoué', () => {
    expect(initialEntry(job, 'https://autre.fr', profile).mode).toBe('none');
  });

  it('un bouton introuvable interrompt le rejeu avec un message', () => {
    const entry = entryFailed(initialEntry(job, ORIGIN, profile), 0, 'not_found');
    expect(entry.mode).toBe('failed');
    expect(entry.message).toContain('Tarificateur');
    expect(entryFailed(initialEntry(job, ORIGIN, profile), 0, 'skipped').mode).toBe('done');
  });

  it('apprend un chemin (doublons ignorés) et en fait un profil versionné', () => {
    let entry = startRecording(initialEntry(job, ORIGIN, null));
    expect(instructionFor(entry)).toEqual({ mode: 'record' });
    entry = entryRecorded(entryRecorded(entryRecorded(entry, action('Tarificateur')), action('Tarificateur')), action('Auto'));
    expect(entry.actions.map(a => a.label)).toEqual(['Tarificateur', 'Auto']);
    expect(profileFrom(entry, profile)).toMatchObject({ version: 2, origin: ORIGIN, entry: [action('Tarificateur'), action('Auto')] });
    expect(profileFrom(startRecording(entry), null)).toBeNull(); // rien enregistré
  });
});
