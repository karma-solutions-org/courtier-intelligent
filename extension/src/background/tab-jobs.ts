import { ExtensionUser, JobContext, TabMessage } from '../shared/messages';
import { findJobForOrigin, watchJob } from './jobs-service';
import { JobRef } from './origin-match';
import { jobByTab, runByTab } from './worker-state';

/** Suivi du dossier de chaque onglet qui remplit un extranet. */
const jobWatchByTab = new Map<number, () => void>();

// ── Job épinglé par onglet (chrome.storage.session : survit aux redémarrages du service worker) ──
/**
 * Un onglet qui commence un job le garde : au rechargement ou à l'étape suivante, c'est ce dossier qui est repris,
 * jamais « le plus récent » (qui peut être celui d'un autre client). Un job n'est suivi que par un seul onglet.
 */
const PIN_PREFIX = 'jobPin:';
let pinLock: Promise<unknown> = Promise.resolve();

/** Exécute `task` seul (deux onglets qui chargent en même temps ne prennent pas le même job). */
function withPinLock<T>(task: () => Promise<T>): Promise<T> {
  const run = pinLock.then(task, task);
  pinLock = run.catch(() => undefined);
  return run;
}

async function readPins(): Promise<Map<number, JobRef>> {
  const all = await chrome.storage.session.get(null).catch(() => ({}) as Record<string, unknown>);
  const pins = new Map<number, JobRef>();
  for (const [key, value] of Object.entries(all)) {
    const ref = value as Partial<JobRef> | undefined;
    if (key.startsWith(PIN_PREFIX) && typeof ref?.dossierId === 'string' && typeof ref.insurerId === 'string') {
      pins.set(Number(key.slice(PIN_PREFIX.length)), { dossierId: ref.dossierId, insurerId: ref.insurerId });
    }
  }
  return pins;
}

export async function unpinJob(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`${PIN_PREFIX}${tabId}`).catch(() => undefined);
}

async function clearPins(): Promise<void> {
  const pins = await readPins();
  await chrome.storage.session.remove([...pins.keys()].map(tabId => `${PIN_PREFIX}${tabId}`)).catch(() => undefined);
}

/**
 * Jobs que d'autres onglets tiennent encore : seulement ceux d'un onglet toujours ouvert sur cet extranet. Un onglet
 * parti ailleurs (site public de l'assureur, autre page) ne bloque plus son job : sans cela, l'extranet rouvert dans un
 * nouvel onglet ne trouvait plus « aucun job » et rien ne démarrait.
 */
async function heldElsewhere(pins: Map<number, JobRef>, origin: string): Promise<JobRef[]> {
  const held: JobRef[] = [];
  for (const [otherTab, ref] of pins) {
    const tab = await chrome.tabs.get(otherTab).catch(() => null);
    let tabOrigin: string | null = null;
    try {
      tabOrigin = tab?.url ? new URL(tab.url).origin : null;
    } catch {
      tabOrigin = null;
    }
    if (tabOrigin === origin) held.push(ref);
    else await unpinJob(otherTab);
  }
  return held;
}

/** Le job de cet onglet : son job épinglé s'il est toujours à faire, sinon un job libre (épinglé alors à l'onglet). */
export function findTabJob(user: ExtensionUser, tabId: number, origin: string): Promise<JobContext | null> {
  return withPinLock(async () => {
    const pins = await readPins();
    const pinned = pins.get(tabId) ?? null;
    pins.delete(tabId);
    const found = await findJobForOrigin(user, origin, { pinned, exclude: await heldElsewhere(pins, origin) });
    if (found) await chrome.storage.session.set({ [`${PIN_PREFIX}${tabId}`]: { dossierId: found.dossierId, insurerId: found.insurerId } });
    else if (pinned) await unpinJob(tabId);
    return found;
  });
}

export function stopJobWatch(tabId: number): void {
  jobWatchByTab.get(tabId)?.();
  jobWatchByTab.delete(tabId);
  jobByTab.delete(tabId);
}

/** Prévient le content script quand le courtier répond aux champs manquants dans l'app. */
export function startJobWatch(tabId: number, user: ExtensionUser, job: JobContext): void {
  stopJobWatch(tabId);
  jobByTab.set(tabId, { dossierId: job.dossierId, insurerId: job.insurerId });
  jobWatchByTab.set(
    tabId,
    watchJob(user, job.dossierId, job.insurerId, changed => {
      const message: TabMessage = { type: 'JOB_CHANGED', job: { ...changed, insurerName: job.insurerName } };
      chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
    }),
  );
}

/** Déconnexion : plus aucun onglet ne suit de job, et les jobs épinglés sont libérés. */
export function forgetAllTabJobs(): void {
  jobWatchByTab.forEach(stop => stop());
  jobWatchByTab.clear();
  jobByTab.clear();
  void clearPins();
}

/** Le job suivi par l'onglet (son remplissage en cours), d'après le service worker et jamais d'après la page. */
export function tabJob(tabId: number): { dossierId: string; insurerId: string } | undefined {
  return jobByTab.get(tabId) ?? runByTab.get(tabId);
}
