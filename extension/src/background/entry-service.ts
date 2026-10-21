/**
 * Chemin d'accès au formulaire de devis (profil d'extranet, brique 1), côté service worker : état de chaque onglet
 * (apprentissage ou rejeu) et profils enregistrés.
 *
 * Les profils sont gardés pour l'instant dans ce navigateur (chrome.storage.local) : leur partage entre courtiers
 * passera par une function du backend (les règles Firestore interdisent toute écriture directe de l'extension).
 */
import { ENTRY_MAX_ACTIONS, ExtranetProfile, extranetProfileId, NavAction, sanitizeEntry } from '@shared';
import type { EntryInstruction, EntryPanelState, JobContext, TabEntry } from '../shared/messages';

const TAB_PREFIX = 'entry:';
const PROFILE_PREFIX = 'extranetProfile:';

// ── Transitions (pures) ─────────────────────────────────────────────────────

/** État d'un onglet qui commence un job : rejeu du profil s'il y en a un. */
export function initialEntry(job: JobContext & { productId: string }, origin: string, profile: ExtranetProfile | null): TabEntry {
  const replay = !!profile && profile.origin === origin && profile.entry.length > 0;
  return {
    dossierId: job.dossierId,
    insurerId: job.insurerId,
    productId: job.productId,
    origin,
    mode: replay ? 'replaying' : 'none',
    actions: replay ? profile.entry : [],
    index: 0,
    message: null,
  };
}

/** Ce que la page doit faire : enregistrer les clics, rejouer le prochain, ou rien (remplir). */
export function instructionFor(entry: TabEntry | null): EntryInstruction {
  if (entry?.mode === 'recording') return { mode: 'record' };
  if (entry?.mode === 'replaying' && entry.index < entry.actions.length) {
    return { mode: 'replay', action: entry.actions[entry.index], index: entry.index, total: entry.actions.length };
  }
  return { mode: 'none' };
}

/** Le clic `index` va être fait : enregistré avant le clic (la page peut se recharger aussitôt). */
export function entryClicked(entry: TabEntry, index: number): TabEntry {
  if (entry.mode !== 'replaying' || index !== entry.index) return entry;
  const next = index + 1;
  return next >= entry.actions.length
    ? { ...entry, index: next, mode: 'done', message: 'Formulaire de devis atteint : le remplissage commence.' }
    : { ...entry, index: next, message: `Chemin d’accès : clic ${next} sur ${entry.actions.length} fait.` };
}

/** Le clic `index` n'a pas pu être rejoué : `skipped` (la page n'est pas celle du chemin : déjà passé), `not_found`. */
export function entryFailed(entry: TabEntry, index: number, reason: 'not_found' | 'skipped'): TabEntry {
  if (entry.mode !== 'replaying' || index !== entry.index) return entry;
  if (reason === 'skipped') return { ...entry, mode: 'done', message: null };
  const label = entry.actions[index]?.label ?? '';
  return {
    ...entry,
    mode: 'failed',
    message: `Bouton « ${label} » introuvable sur cette page : continuez à la main jusqu’au formulaire, le remplissage prendra le relais. Vous pouvez aussi réapprendre le chemin.`,
  };
}

export function startRecording(entry: TabEntry): TabEntry {
  return {
    ...entry,
    mode: 'recording',
    actions: [],
    index: 0,
    message: 'Apprentissage : cliquez comme d’habitude jusqu’au formulaire de devis, puis « Enregistrer le chemin ».',
  };
}

/** Un clic du courtier pendant l'apprentissage (un double clic sur le même élément ne compte qu'une fois). */
export function entryRecorded(entry: TabEntry, action: NavAction): TabEntry {
  if (entry.mode !== 'recording' || entry.actions.length >= ENTRY_MAX_ACTIONS) return entry;
  const last = entry.actions.at(-1);
  if (last && last.label === action.label && last.selector === action.selector && last.urlPattern === action.urlPattern) return entry;
  return { ...entry, actions: [...entry.actions, action] };
}

/** Profil à enregistrer à la fin de l'apprentissage, ou null si le chemin est vide ou invalide. */
export function profileFrom(entry: TabEntry, previous: ExtranetProfile | null): ExtranetProfile | null {
  const actions = sanitizeEntry(entry.actions);
  if (entry.mode !== 'recording' || !actions) return null;
  return {
    insurerId: entry.insurerId,
    productId: entry.productId,
    origin: entry.origin,
    version: (previous?.version ?? 0) + 1,
    status: 'draft',
    entry: actions,
  };
}

export function entryPanelState(entry: TabEntry, hasProfile: boolean): EntryPanelState {
  return { mode: entry.mode, hasProfile, labels: entry.actions.map(action => action.label), index: entry.index, message: entry.message };
}

// ── Stockage ────────────────────────────────────────────────────────────────

/** État de l'onglet (chrome.storage.session : survit aux redémarrages du service worker, pas à ceux du navigateur). */
export async function readTabEntry(tabId: number): Promise<TabEntry | null> {
  const key = `${TAB_PREFIX}${tabId}`;
  const stored = await chrome.storage.session.get(key).catch(() => ({}) as Record<string, unknown>);
  return (stored[key] as TabEntry | undefined) ?? null;
}

export async function writeTabEntry(tabId: number, entry: TabEntry): Promise<void> {
  await chrome.storage.session.set({ [`${TAB_PREFIX}${tabId}`]: entry });
}

export async function removeTabEntry(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`${TAB_PREFIX}${tabId}`).catch(() => undefined);
}

export async function loadProfile(insurerId: string, productId: string): Promise<ExtranetProfile | null> {
  const key = `${PROFILE_PREFIX}${extranetProfileId(insurerId, productId)}`;
  const stored = await chrome.storage.local.get(key).catch(() => ({}) as Record<string, unknown>);
  const profile = stored[key] as ExtranetProfile | undefined;
  return profile && sanitizeEntry(profile.entry) ? profile : null;
}

export async function saveProfile(profile: ExtranetProfile): Promise<void> {
  await chrome.storage.local.set({ [`${PROFILE_PREFIX}${extranetProfileId(profile.insurerId, profile.productId)}`]: profile });
}
