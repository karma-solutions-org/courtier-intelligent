/**
 * Chemin d'accès au formulaire de devis (profil d'extranet, brique 1), côté service worker : état de chaque onglet
 * (apprentissage ou rejeu) et profils enregistrés.
 *
 * Chemins communs : publiés dans le catalogue (`entryPaths` de l'assureur), enregistrés une fois par Courtier
 * Intelligent pour tous les cabinets. Un chemin appris dans ce navigateur (chrome.storage.local) prime sur eux.
 */
import { ENTRY_MAX_ACTIONS, ExtranetProfile, extranetProfileId, NavAction, sanitizeEntry } from '@shared';
import type { EntryInstruction, EntryPanelState, JobContext, TabEntry } from '../shared/messages';
import { loadInsurers } from './jobs-service';

const TAB_PREFIX = 'entry:';
const PROFILE_PREFIX = 'extranetProfile:';

// ── Transitions (pures) ─────────────────────────────────────────────────────

/**
 * Même site, sous-domaine près : un chemin appris depuis la page de connexion (`connexion.oyat-assurances.fr`) se
 * rejoue sur l'extranet (`extranet.oyat-assurances.fr`). Comparaison sur les deux derniers éléments du nom d'hôte.
 */
export function sameSite(a: string, b: string): boolean {
  const site = (origin: string) => {
    try {
      const { protocol, hostname } = new URL(origin);
      return `${protocol}//${hostname.split('.').slice(-2).join('.')}`;
    } catch {
      return null;
    }
  };
  const left = site(a);
  return left !== null && left === site(b);
}

/**
 * État d'un onglet qui commence un job : rejeu du profil s'il y en a un ; sinon apprentissage automatique (premier
 * passage sur cet extranet pour ce produit) : les clics du courtier sont retenus jusqu'au formulaire de devis.
 */
export function initialEntry(job: JobContext & { productId: string }, origin: string, profile: ExtranetProfile | null): TabEntry {
  const replay = !!profile && sameSite(profile.origin, origin) && profile.entry.length > 0;
  return {
    dossierId: job.dossierId,
    insurerId: job.insurerId,
    productId: job.productId,
    origin,
    mode: replay ? 'replaying' : 'recording',
    auto: !replay,
    actions: replay ? profile.entry : [],
    index: 0,
    message: replay
      ? null
      : 'Premier passage sur cet extranet : allez jusqu’au formulaire de devis, le chemin sera retenu et rejoué les fois suivantes.',
  };
}

/** Ce que la page doit faire : enregistrer les clics, rejouer le prochain, ou rien (remplir). */
export function instructionFor(entry: TabEntry | null): EntryInstruction {
  if (entry?.mode === 'recording') return { mode: 'record', auto: entry.auto === true };
  if (entry?.mode === 'replaying' && entry.index < entry.actions.length) {
    return { mode: 'replay', action: entry.actions[entry.index], index: entry.index, total: entry.actions.length };
  }
  // Chemin passé ou interrompu sans atteindre le formulaire : la page est observée jusqu'à ce qu'il soit reconnu
  // (jamais le tableau de bord d'un extranet rempli comme un devis).
  return entry && (entry.mode === 'done' || entry.mode === 'failed') && !entry.reached ? { mode: 'none', waitForForm: true } : { mode: 'none' };
}

/** Le clic `index` va être fait : enregistré avant le clic (la page peut se recharger aussitôt). */
export function entryClicked(entry: TabEntry, index: number): TabEntry {
  if (entry.mode !== 'replaying' || index !== entry.index) return entry;
  const next = index + 1;
  return next >= entry.actions.length
    ? { ...entry, index: next, mode: 'done', reached: true, message: 'Formulaire de devis atteint : le remplissage commence.' }
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
    auto: false,
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

/**
 * Formulaire de devis reconnu pendant l'apprentissage automatique : le chemin suivi jusque-là devient le profil.
 * Aucun clic retenu (extranet ouvert directement sur le formulaire) : rien à apprendre, l'onglet passe à « done ».
 */
export function entryFormReached(entry: TabEntry, previous: ExtranetProfile | null): { entry: TabEntry; profile: ExtranetProfile | null } {
  // Chemin passé ou interrompu : le formulaire est maintenant reconnu, les pages suivantes se remplissent normalement.
  if ((entry.mode === 'done' || entry.mode === 'failed') && !entry.reached) return { entry: { ...entry, reached: true }, profile: null };
  if (entry.mode !== 'recording' || !entry.auto) return { entry, profile: null };
  const profile = profileFrom(entry, previous);
  const done: TabEntry = {
    ...entry,
    mode: 'done',
    auto: false,
    reached: true,
    index: entry.actions.length,
    message: profile
      ? `Chemin d’accès retenu (${profile.entry.length} clic${profile.entry.length > 1 ? 's' : ''}) : il sera rejoué à la prochaine tarification sur cet extranet.`
      : null,
  };
  return { entry: done, profile };
}

export function entryPanelState(entry: TabEntry, hasProfile: boolean, learned: ExtranetProfile | null = null): EntryPanelState {
  return {
    mode: entry.mode,
    hasProfile,
    labels: entry.actions.map(action => action.label),
    index: entry.index,
    message: entry.message,
    catalogSnippet: learned ? catalogSnippet(learned) : null,
  };
}

/** Chemin appris, au format de `entryPaths` du catalogue : « "auto": { "origin": …, "entry": [ … ] } ». */
export function catalogSnippet(profile: ExtranetProfile): string {
  const path = { origin: profile.origin, entry: profile.entry };
  return `${JSON.stringify(profile.productId)}: ${JSON.stringify(path, null, 2)}`;
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

/** Chemin appris dans ce navigateur (il prime : le courtier l'a réappris), sinon le chemin commun du catalogue. */
export async function loadProfile(insurerId: string, productId: string): Promise<ExtranetProfile | null> {
  return (await loadLearnedProfile(insurerId, productId)) ?? catalogProfile(insurerId, productId);
}

/** Chemin appris dans ce navigateur seulement, ou null. */
export async function loadLearnedProfile(insurerId: string, productId: string): Promise<ExtranetProfile | null> {
  const key = `${PROFILE_PREFIX}${extranetProfileId(insurerId, productId)}`;
  const stored = await chrome.storage.local.get(key).catch(() => ({}) as Record<string, unknown>);
  const profile = stored[key] as ExtranetProfile | undefined;
  return profile && sanitizeEntry(profile.entry) ? profile : null;
}

/** Chemin commun publié dans le catalogue pour cet assureur et ce produit, ou null. */
async function catalogProfile(insurerId: string, productId: string): Promise<ExtranetProfile | null> {
  const insurers = await loadInsurers().catch(() => []);
  const path = insurers.find(insurer => insurer.id === insurerId)?.entryPaths?.[productId];
  return path ? { insurerId, productId, origin: path.origin, version: 0, status: 'validated', entry: path.entry } : null;
}

export async function saveProfile(profile: ExtranetProfile): Promise<void> {
  await chrome.storage.local.set({ [`${PROFILE_PREFIX}${extranetProfileId(profile.insurerId, profile.productId)}`]: profile });
}
