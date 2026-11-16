import { ActivePage, AuthState, CurrentJob, EntryPanelState, ExtensionUser, PanelState, PortMessage, RunState } from '../shared/messages';
import { createAuthController } from './auth-controller';
import { entryPanelState, loadLearnedProfile, loadProfile, readTabEntry } from './entry-service';
import { firebaseAuthPort, firebaseBackendPort, firestoreSessionPort } from './firebase-adapters';

// État du service worker, partagé par ses modules (il disparaît quand Chrome arrête le service worker).

export const auth = createAuthController({ auth: firebaseAuthPort, backend: firebaseBackendPort, sessions: firestoreSessionPort });

// ── État partagé avec le side panel ─────────────────────────────────────────
export const panels = new Set<chrome.runtime.Port>();
/** Job suivi en direct pour le side panel (voir `syncLiveWatch`). */
export const live: { job: CurrentJob | null } = { job: null };

/** Avancement du remplissage de chaque onglet (envoyé par son content script). */
export const runByTab = new Map<number, RunState>();
/** Job (dossier, assureur) suivi par chaque onglet : seul celui-ci peut être mis à jour depuis cet onglet. */
export const jobByTab = new Map<number, { dossierId: string; insurerId: string }>();
/** Dernière page analysée par onglet. */
export const pagesByTab = new Map<number, ActivePage>();

export async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

export async function panelState(authState?: AuthState): Promise<PanelState> {
  const state = authState ?? (await auth.getState());
  const tabId = await activeTabId();
  const signedIn = state.status === 'signed_in';
  return {
    auth: state,
    job: signedIn ? live.job : null,
    run: signedIn && tabId !== undefined ? (runByTab.get(tabId) ?? null) : null,
    entry: signedIn && tabId !== undefined ? await entryPanelFor(tabId) : null,
  };
}

/** Chemin d'accès de l'onglet, pour le side panel (null : pas de tarification sur cet onglet). */
async function entryPanelFor(tabId: number): Promise<EntryPanelState | null> {
  const entry = await readTabEntry(tabId);
  if (!entry) return null;
  const learned = await loadLearnedProfile(entry.insurerId, entry.productId);
  return entryPanelState(entry, learned !== null || (await loadProfile(entry.insurerId, entry.productId)) !== null, learned);
}

export async function broadcast(authState?: AuthState): Promise<void> {
  const message: PortMessage = { type: 'STATE', state: await panelState(authState) };
  panels.forEach(port => port.postMessage(message));
}

/** Utilisateur connecté, ou null (l'extension n'agit pour personne sinon). */
export async function signedInUser(): Promise<ExtensionUser | null> {
  const state = await auth.getState();
  return state.status === 'signed_in' ? state.user : null;
}

/** Origine seule (jamais le chemin ni les paramètres de l'URL, qui peuvent porter des données). */
export function originOnly(value: string | undefined): string {
  try {
    return value ? new URL(value).origin : '';
  } catch {
    return '';
  }
}
