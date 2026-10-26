import type { ExtranetProfile, NavAction } from '@shared';
import { describe, expect, it } from 'vitest';
import type { JobContext } from '../shared/messages';
import { sameSite, entryClicked, entryFailed, entryFormReached, entryRecorded, initialEntry, instructionFor, profileFrom, startRecording } from './entry-service';

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
  it('sans profil, apprentissage automatique ; formulaire reconnu → profil enregistré', () => {
    let entry = initialEntry(job, ORIGIN, null);
    expect(instructionFor(entry)).toEqual({ mode: 'record', auto: true });
    entry = entryRecorded(entryRecorded(entry, action('Tarificateur')), action('Auto'));
    const reached = entryFormReached(entry, null);
    expect(reached.profile).toMatchObject({ version: 1, origin: ORIGIN, entry: [action('Tarificateur'), action('Auto')] });
    expect(reached.entry.mode).toBe('done');
    expect(instructionFor(reached.entry)).toEqual({ mode: 'none' });
  });

  it('formulaire ouvert directement (aucun clic) : rien à apprendre', () => {
    const reached = entryFormReached(initialEntry(job, ORIGIN, null), null);
    expect(reached.profile).toBeNull();
    expect(reached.entry.mode).toBe('done');
  });

  it('l’apprentissage lancé à la main ne s’arrête pas tout seul', () => {
    const manual = startRecording(initialEntry(job, ORIGIN, profile));
    expect(instructionFor(manual)).toEqual({ mode: 'record', auto: false });
    expect(entryFormReached(manual, profile).entry).toBe(manual);
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

  it('un profil d’une autre origine n’est pas rejoué (on réapprend)', () => {
    expect(initialEntry(job, 'https://autre.fr', profile).mode).toBe('recording');
  });

  it('un bouton introuvable interrompt le rejeu avec un message', () => {
    const entry = entryFailed(initialEntry(job, ORIGIN, profile), 0, 'not_found');
    expect(entry.mode).toBe('failed');
    expect(entry.message).toContain('Tarificateur');
    expect(entryFailed(initialEntry(job, ORIGIN, profile), 0, 'skipped').mode).toBe('done');
  });

  it('apprend un chemin (doublons ignorés) et en fait un profil versionné', () => {
    let entry = startRecording(initialEntry(job, ORIGIN, null));
    expect(instructionFor(entry)).toEqual({ mode: 'record', auto: false });
    entry = entryRecorded(entryRecorded(entryRecorded(entry, action('Tarificateur')), action('Tarificateur')), action('Auto'));
    expect(entry.actions.map(a => a.label)).toEqual(['Tarificateur', 'Auto']);
    expect(profileFrom(entry, profile)).toMatchObject({ version: 2, origin: ORIGIN, entry: [action('Tarificateur'), action('Auto')] });
    expect(profileFrom(startRecording(entry), null)).toBeNull(); // rien enregistré
  });
});

describe('sameSite : chemin rejoué sur un autre sous-domaine du même extranet', () => {
  it.each([
    ['https://connexion.oyat-assurances.fr', 'https://extranet.oyat-assurances.fr', true],
    ['https://extranet.oyat-assurances.fr', 'https://extranet.oyat-assurances.fr', true],
    ['https://extranet.oyat-assurances.fr', 'https://extranet.axa.fr', false],
    ['https://oyat-assurances.fr.evil.com', 'https://extranet.oyat-assurances.fr', false],
    ['http://extranet.oyat-assurances.fr', 'https://extranet.oyat-assurances.fr', false],
    ['pas une url', 'https://extranet.oyat-assurances.fr', false],
  ])('%s / %s → %s', (a, b, expected) => {
    expect(sameSite(a, b)).toBe(expected);
  });
});

describe('chemin passé ou interrompu : la page est observée jusqu’au formulaire', () => {
  const replaying = initialEntry(job, ORIGIN, profile);

  it('chemin passé (page différente au premier clic) : aucun remplissage avant le formulaire reconnu', () => {
    const skipped = entryFailed(replaying, 0, 'skipped');
    expect(instructionFor(skipped)).toEqual({ mode: 'none', waitForForm: true });
    const reached = entryFormReached(skipped, profile).entry;
    expect(reached.reached).toBe(true);
    expect(instructionFor(reached)).toEqual({ mode: 'none' });
  });

  it('bouton introuvable : idem', () => {
    expect(instructionFor(entryFailed(replaying, 0, 'not_found'))).toEqual({ mode: 'none', waitForForm: true });
  });

  it('chemin rejoué jusqu’au bout : le formulaire est atteint, la page se remplit', () => {
    let entry = replaying;
    for (let index = 0; index < profile.entry.length; index++) entry = entryClicked(entry, index);
    expect(entry).toMatchObject({ mode: 'done', reached: true });
    expect(instructionFor(entry)).toEqual({ mode: 'none' });
  });
});
