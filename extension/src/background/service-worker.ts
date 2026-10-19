import { EXTENSION_REPORT_ISSUES, EXTENSION_REPORT_STEPS, ExtensionReportIssue, ExtensionReportStep } from '@shared';
import { hasPremium, sanitizeOffer } from '../engine/offer';
import {
  AccessRequest,
  ActivePage,
  AskAiResponse,
  AuthState,
  CaptureEdits,
  CaptureResponse,
  ConnectResponse,
  CurrentJob,
  ExtensionMessage,
  ExtensionUser,
  ExternalMessage,
  JobContext,
  PanelState,
  PongResponse,
  PortMessage,
  RUNNER_PORT,
  RunState,
  SIDE_PANEL_PORT,
  SignInResponse,
  TabMessage,
  type JobUpdate,
  type UpdateJobResponse,
} from '../shared/messages';
import { createAuthController, MESSAGES, toAiMessage, toUserMessage, UserFacingError } from './auth-controller';
import { APP_DEVICE_KEY, firebaseAuthPort, firebaseBackendPort, firestoreSessionPort } from './firebase-adapters';
import { addExtensionReport, askAi, explainJobDenied, findJobForOrigin, listRecentJobs, loadInsurers, updateJob, watchJob, watchRecentJobs, writeCapturedOffer } from './jobs-service';
import { startLiveWatch } from './live';
import { invalidateMemory, loadMemory, reportDiscoveredFields, saveMemory, touchMemory } from './memory-service';
import { countRequested, extranetPatterns, insurerForOrigin, JobRef } from './origin-match';
import { checkSender, externalOriginsFromMatches, JOB_COMMANDS, jobMatches, MemoryKeyRegistry, sanitizeAiRequest } from './sender-guard';
import { MAPPING_SYSTEM_PROMPT } from '../engine/ai-fallback';
import { CAPTURE_SYSTEM_PROMPT } from '../engine/capture-ai';
import { memoryKeyFor } from '../engine/memory';

// Un clic sur l'icône de l'extension ouvre le side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

/** Fréquence de la vérification de session en arrière-plan (le service worker est arrêté entre deux). */
const SESSION_CHECK_ALARM = 'session-check';
const SESSION_CHECK_PERIOD_MINUTES = 1;

const auth = createAuthController({ auth: firebaseAuthPort, backend: firebaseBackendPort, sessions: firestoreSessionPort });

// ── État partagé avec le side panel ─────────────────────────────────────────
const panels = new Set<chrome.runtime.Port>();
let currentJob: CurrentJob | null = null;
let stopLive: (() => void) | null = null;

/** Avancement du remplissage de chaque onglet (envoyé par son content script). */
const runByTab = new Map<number, RunState>();
/** Suivi du dossier de chaque onglet qui remplit un extranet. */
const jobWatchByTab = new Map<number, () => void>();
/** Job (dossier, assureur) suivi par chaque onglet : seul celui-ci peut être mis à jour depuis cet onglet. */
const jobByTab = new Map<number, { dossierId: string; insurerId: string }>();

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

async function panelState(authState?: AuthState): Promise<PanelState> {
  const state = authState ?? (await auth.getState());
  const tabId = await activeTabId();
  return {
    auth: state,
    job: state.status === 'signed_in' ? currentJob : null,
    run: state.status === 'signed_in' && tabId !== undefined ? (runByTab.get(tabId) ?? null) : null,
  };
}

async function broadcast(authState?: AuthState): Promise<void> {
  const message: PortMessage = { type: 'STATE', state: await panelState(authState) };
  panels.forEach(port => port.postMessage(message));
}

/** Utilisateur connecté, ou null (l'extension n'agit pour personne sinon). */
async function signedInUser(): Promise<ExtensionUser | null> {
  const state = await auth.getState();
  return state.status === 'signed_in' ? state.user : null;
}

async function setBadge(count: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#0b63ff' });
  } catch {
    // Le badge est un confort : une erreur ne doit rien casser.
  }
}

/**
 * Affiche sur l'icône le nombre de tarifications « requested » à lancer. Tant que le suivi en continu est actif,
 * il tient le badge à jour ; sinon (suivi coupé, réveil par l'alarme) on relit les jobs une fois.
 */
async function refreshBadge(): Promise<void> {
  try {
    const user = await signedInUser();
    if (user && jobsWatch?.uid === user.uid && jobsWatch.received) return;
    await setBadge(user ? countRequested(await listRecentJobs(user)) : 0);
  } catch {
    // Le badge est un confort : une erreur réseau ne doit rien casser.
  }
}

// ── Suivi en continu des jobs du courtier (E7-1), side panel ouvert ou non ──
/** Suivi actif : pour quel courtier, et a-t-il déjà reçu un premier résultat. */
let jobsWatch: { uid: string; stop: () => void; received: boolean } | null = null;

function stopJobsWatch(): void {
  jobsWatch?.stop();
  jobsWatch = null;
}

/**
 * (Re)branche le suivi des jobs récents du courtier connecté, ou le coupe s'il est déconnecté. Appelé à chaque réveil
 * du service worker, à chaque changement de session et par l'alarme : l'écoute Firestore s'arrête avec le service
 * worker, l'alarme d'une minute la rattache (et relit le badge entre-temps).
 */
async function syncJobsWatch(): Promise<void> {
  const user = await signedInUser();
  if (!user) {
    stopJobsWatch();
    await setBadge(0);
    return;
  }
  if (jobsWatch?.uid === user.uid) return;
  stopJobsWatch();
  const watch: NonNullable<typeof jobsWatch> = { uid: user.uid, stop: () => undefined, received: false };
  watch.stop = watchRecentJobs(
    user,
    jobs => {
      watch.received = true;
      void setBadge(countRequested(jobs));
    },
    () => {
      // Règles refusées (session coupée) ou réseau : on lâche l'écoute, la prochaine alarme la rattachera.
      if (jobsWatch === watch) jobsWatch = null;
      void verifySession();
    },
  );
  jobsWatch = watch;
}

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

async function unpinJob(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`${PIN_PREFIX}${tabId}`).catch(() => undefined);
}

async function clearPins(): Promise<void> {
  const pins = await readPins();
  await chrome.storage.session.remove([...pins.keys()].map(tabId => `${PIN_PREFIX}${tabId}`)).catch(() => undefined);
}

/** Le job de cet onglet : son job épinglé s'il est toujours à faire, sinon un job libre (épinglé alors à l'onglet). */
function findTabJob(user: ExtensionUser, tabId: number, origin: string): Promise<JobContext | null> {
  return withPinLock(async () => {
    const pins = await readPins();
    const pinned = pins.get(tabId) ?? null;
    pins.delete(tabId);
    const found = await findJobForOrigin(user, origin, { pinned, exclude: [...pins.values()] });
    if (found) await chrome.storage.session.set({ [`${PIN_PREFIX}${tabId}`]: { dossierId: found.dossierId, insurerId: found.insurerId } });
    else if (pinned) await unpinJob(tabId);
    return found;
  });
}

function stopJobWatch(tabId: number): void {
  jobWatchByTab.get(tabId)?.();
  jobWatchByTab.delete(tabId);
  jobByTab.delete(tabId);
}

/** Prévient le content script quand le courtier répond aux champs manquants dans l'app. */
function startJobWatch(tabId: number, user: ExtensionUser, job: JobContext): void {
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

/** Suit en direct la session et le job tant qu'un side panel est ouvert et que le courtier est connecté. */
async function syncLiveWatch(): Promise<void> {
  const state = await auth.getState();
  stopLive?.();
  stopLive = null;
  if (panels.size === 0 || state.status !== 'signed_in') {
    currentJob = null;
    return;
  }
  stopLive = startLiveWatch(state.user, {
    onSessionMaybeChanged: () => void verifySession(),
    onJob: job => {
      currentJob = job;
      void broadcast();
      void refreshBadge();
    },
  });
}

/** Vérifie que la session de l'appareil est toujours ouverte ; sinon l'extension est déconnectée. */
async function verifySession(): Promise<void> {
  const state = await auth.verify();
  if (state.status === 'signed_out') await syncLiveWatch();
  await broadcast(state);
}

// Les changements d'état (connexion, perte de session) sont diffusés au side panel.
auth.onChange(state => {
  void syncJobsWatch();
  if (state.status === 'signed_out') {
    runByTab.clear();
    jobWatchByTab.forEach(stop => stop());
    jobWatchByTab.clear();
    jobByTab.clear();
    void clearPins();
  }
  void syncContentScripts();
  void syncLiveWatch().then(() => broadcast(state));
  void refreshBadge();
});

// ── Side panel ──────────────────────────────────────────────────────────────
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== SIDE_PANEL_PORT) return;
  panels.add(port);
  port.onDisconnect.addListener(() => {
    panels.delete(port);
    if (panels.size === 0) void syncLiveWatch();
  });
  // Le side panel envoie un signal régulier : il garde le service worker éveillé tant qu'il est ouvert.
  port.onMessage.addListener(() => undefined);
  void verifySession().then(syncLiveWatch);
});

// Un content script qui remplit un extranet garde le service worker éveillé tant que sa page est ouverte.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== RUNNER_PORT) return;
  const tabId = port.sender?.tab?.id;
  let origin = '';
  try {
    origin = port.sender?.url ? new URL(port.sender.url).origin : '';
  } catch {
    origin = '';
  }
  // Content script d'un onglet (cadre principal, ou iframe de l'extranet qui porte le formulaire).
  if (tabId === undefined || !origin) {
    port.disconnect();
    return;
  }
  port.onMessage.addListener((message: { type?: string; dossierId?: unknown; insurerId?: unknown }) => {
    // Port rouvert après un redémarrage du service worker : le suivi du job est rétabli, après vérification
    // (le job annoncé par la page doit être celui que le service worker trouve lui-même pour cette origine).
    if (message?.type !== 'JOB' || jobByTab.has(tabId)) return;
    void signedInUser()
      .then(async user => {
        if (!user) return;
        const job = await findTabJob(user, tabId, origin);
        if (job && jobMatches(job, String(message.dossierId), String(message.insurerId)) && !jobByTab.has(tabId)) startJobWatch(tabId, user, job);
      })
      .catch(() => undefined);
  });
  port.onDisconnect.addListener(() => {
    stopJobWatch(tabId);
    runByTab.delete(tabId);
    void broadcast();
  });
});

// ── Vérification périodique : perte d'accès dès que la session de l'appareil est coupée ──
async function ensureAlarm(): Promise<void> {
  if (!(await chrome.alarms.get(SESSION_CHECK_ALARM))) {
    chrome.alarms.create(SESSION_CHECK_ALARM, { periodInMinutes: SESSION_CHECK_PERIOD_MINUTES });
  }
}
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SESSION_CHECK_ALARM) {
    void verifySession()
      .then(syncJobsWatch)
      .then(refreshBadge);
  }
});
chrome.runtime.onInstalled.addListener(() => void ensureAlarm());
chrome.runtime.onStartup.addListener(() => void ensureAlarm());
// À chaque réveil du service worker : même vérification (et jeton rafraîchi s'il approche de son expiration).
void ensureAlarm();
void verifySession().then(syncJobsWatch).then(refreshBadge);

// ── Messages internes ───────────────────────────────────────────────────────
/** Dernière page analysée par onglet. */
const pagesByTab = new Map<number, ActivePage>();

/** Origine seule (jamais le chemin ni les paramètres de l'URL, qui peuvent porter des données). */
function originOnly(value: string | undefined): string {
  try {
    return value ? new URL(value).origin : '';
  } catch {
    return '';
  }
}

/** Signalement d'un échec (E10-4) : seulement des codes connus, l'assureur et l'origine. Une panne n'empêche rien. */
async function report(insurerId: string, origin: string, step: ExtensionReportStep, issue: ExtensionReportIssue): Promise<void> {
  if (!EXTENSION_REPORT_STEPS.includes(step) || !EXTENSION_REPORT_ISSUES.includes(issue) || !(await signedInUser())) return;
  await addExtensionReport({ insurerId: insurerId.slice(0, 100), origin: originOnly(origin), step, issue }).catch(() => undefined);
}

/** Termine la capture de l'onglet : nouvel état pour le side panel, et la page arrête de surveiller. */
function finishCapture(tabId: number, run: RunState, update: Partial<RunState>): void {
  runByTab.set(tabId, { ...run, ...update });
  void broadcast();
  chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_DONE' } satisfies TabMessage).catch(() => undefined);
}

/** Le courtier confirme le tarif lu sur l'onglet actif (avec ses corrections) : offre écrite, job `captured` (E10-3). */
/** Écrit l'avancement d'un job ; en cas d'échec, renvoie la cause exacte (session, annulation, dossier, réseau). */
async function updateJobWithCause(dossierId: string, insurerId: string, update: JobUpdate): Promise<UpdateJobResponse> {
  const user = await signedInUser().catch(() => null);
  if (!user) return { ok: false, message: MESSAGES.sessionExpired };
  try {
    await updateJob(user, dossierId, insurerId, update);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...(await deniedCause(user, dossierId, insurerId, error)) };
  }
}

/** Message d'un refus d'écriture : annulation ou dossier hors tarification si c'est la cause, sinon message générique. */
async function deniedCause(user: ExtensionUser, dossierId: string, insurerId: string, error: unknown): Promise<{ message: string; cancelled: boolean }> {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'permission-denied') {
    const cause = await explainJobDenied(user, dossierId, insurerId);
    if (cause) return cause;
  }
  return { message: toUserMessage(error), cancelled: false };
}

async function confirmCapture(edits: CaptureEdits): Promise<CaptureResponse> {
  const user = await signedInUser();
  const tabId = await activeTabId();
  const run = tabId !== undefined ? runByTab.get(tabId) : undefined;
  if (!user || tabId === undefined || !run || run.phase !== 'capture_review' || !run.capture?.offer) {
    return { ok: false, message: 'Aucun tarif à confirmer sur cet onglet.' };
  }
  const offer = sanitizeOffer({ ...run.capture.offer, ...edits });
  if (!hasPremium(offer)) return { ok: false, message: 'Indiquez au moins la prime annuelle ou la prime mensuelle.' };
  try {
    await writeCapturedOffer(user, run.dossierId, run.insurerId, offer);
  } catch (error) {
    await report(run.insurerId, pagesByTab.get(tabId)?.origin ?? '', 'write', 'offer_write_failed');
    return { ok: false, message: (await deniedCause(user, run.dossierId, run.insurerId, error)).message };
  }
  finishCapture(tabId, run, { phase: 'captured', capture: { ...run.capture, offer }, message: 'Tarif enregistré : il apparaît dans le dossier.' });
  return { ok: true };
}

/** Le courtier refuse le tarif lu (ou signale qu'aucun tarif n'a pu être lu) : job `failed`, rapport d'échec. */
async function rejectCapture(): Promise<CaptureResponse> {
  const user = await signedInUser();
  const tabId = await activeTabId();
  const run = tabId !== undefined ? runByTab.get(tabId) : undefined;
  if (!user || tabId === undefined || !run || (run.phase !== 'capture_review' && run.phase !== 'capture_failed')) {
    return { ok: false, message: 'Aucune capture en cours sur cet onglet.' };
  }
  try {
    await updateJob(user, run.dossierId, run.insurerId, {
      status: 'failed',
      error: 'Tarif non capturé par l’extension : relancez la tarification ou saisissez l’offre dans l’application.',
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  // Une page sans tarif lisible a déjà été signalée par la page elle-même ; un tarif refusé l'est ici.
  if (run.phase === 'capture_review') await report(run.insurerId, pagesByTab.get(tabId)?.origin ?? '', 'confirm', 'capture_rejected');
  finishCapture(tabId, run, {
    phase: 'error',
    capture: null,
    message: 'Échec signalé : dans l’application, relancez la tarification ou saisissez l’offre à la main.',
  });
  return { ok: true };
}

// ── Injection à la demande du content script (extranets du catalogue seulement) ──
const CONTENT_SCRIPT_ID = 'extranets';
const CONTENT_SCRIPT_FILE = 'content/content-script.js';

/** Motifs des extranets du catalogue (vide si personne n'est connecté ou si le catalogue est illisible). */
async function catalogPatterns(): Promise<string[]> {
  if (!(await signedInUser())) return [];
  try {
    return extranetPatterns((await loadInsurers()).flatMap(insurer => insurer.extranetDomains));
  } catch {
    return [];
  }
}

/**
 * Enregistre le content script pour les extranets du catalogue auxquels le courtier a donné accès (permissions
 * d'hôte optionnelles) ; le retire sinon. Appelé à la connexion, au réveil et quand une permission change.
 */
/**
 * Synchronisations en file : connexion, réveil et changements d'autorisation peuvent la demander au même moment.
 * Deux exécutions simultanées enregistraient deux fois le même script (« Duplicate script ID 'extranets' ») ;
 * chacune attend maintenant la fin de la précédente, et repart de l'état réellement enregistré.
 */
let contentScriptsSync: Promise<void> = Promise.resolve();

function syncContentScripts(): Promise<void> {
  contentScriptsSync = contentScriptsSync.then(syncContentScriptsNow, syncContentScriptsNow);
  return contentScriptsSync;
}

async function syncContentScriptsNow(): Promise<void> {
  try {
    const patterns = await catalogPatterns();
    const granted: string[] = [];
    for (const pattern of patterns) {
      if (await chrome.permissions.contains({ origins: [pattern] })) granted.push(pattern);
    }
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
    if (granted.length === 0) return;
    await chrome.scripting.registerContentScripts([
      { id: CONTENT_SCRIPT_ID, matches: granted, js: [CONTENT_SCRIPT_FILE], runAt: 'document_idle', allFrames: true, persistAcrossSessions: true },
    ]);
  } catch (error) {
    console.error('Enregistrement du content script impossible', error);
  }
}

/** L'onglet actif est-il l'extranet d'un assureur auquel l'extension n'a pas encore accès ? */
async function accessRequest(): Promise<AccessRequest | null> {
  if (!(await signedInUser())) return null;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const origin = originOnly(tab?.url);
  if (!origin) return null;
  const insurer = insurerForOrigin(origin, await loadInsurers());
  if (!insurer) return null;
  const origins = extranetPatterns(insurer.extranetDomains);
  if (origins.length === 0 || (await chrome.permissions.contains({ origins }))) return null;
  return { insurerName: insurer.name, origins };
}

/** Accès accordé depuis le side panel : enregistrement, puis injection immédiate dans l'onglet actif (sans recharger). */
async function onAccessGranted(): Promise<boolean> {
  await syncContentScripts();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const origin = originOnly(tab?.url);
  if (tab?.id === undefined || !origin || !insurerForOrigin(origin, await loadInsurers())) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: [CONTENT_SCRIPT_FILE] });
    return true;
  } catch {
    return false;
  }
}

chrome.permissions.onAdded.addListener(() => void syncContentScripts());
chrome.permissions.onRemoved.addListener(() => void syncContentScripts());
void syncContentScripts();

/**
 * Filet de sécurité : un extranet du catalogue a fini de charger, l'accès est accordé, mais la page n'a pas signalé
 * notre script (onglet ouvert avant un rechargement de l'extension, enregistrement perdu au réveil du service worker
 * avant la connexion…). On réenregistre et on injecte directement ; le script ignore une seconde injection.
 */
async function ensureInjected(tabId: number, url: string | undefined): Promise<void> {
  const origin = originOnly(url);
  if (!origin || !(await signedInUser())) return;
  const insurer = insurerForOrigin(origin, await loadInsurers().catch(() => []));
  if (!insurer) return;
  const origins = extranetPatterns(insurer.extranetDomains);
  if (!origins.length || !(await chrome.permissions.contains({ origins }))) return;
  // Laisse au script enregistré le temps de se signaler (PAGE_DETECTED) avant d'injecter nous-mêmes.
  await new Promise(resolve => setTimeout(resolve, 1500));
  if (pagesByTab.has(tabId)) return;
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  if (!registered.length) await syncContentScripts();
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_SCRIPT_FILE] }).catch(error => {
    console.error('Injection du content script impossible', error);
  });
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  // Nouvelle page dans l'onglet : l'ancienne analyse ne vaut plus (le script de la nouvelle page se signalera).
  if (info.status === 'loading') pagesByTab.delete(tabId);
  if (info.status === 'complete') void ensureInjected(tabId, tab.url);
});

// ── Messages internes ───────────────────────────────────────────────────────
const PANEL_URL_PREFIX = chrome.runtime.getURL('sidepanel/');

/** Le job suivi par l'onglet (son remplissage en cours), d'après le service worker et jamais d'après la page. */
function tabJob(tabId: number): { dossierId: string; insurerId: string } | undefined {
  return jobByTab.get(tabId) ?? runByTab.get(tabId);
}

/** Prompts système fixes de l'IA, par usage : la page ne choisit que l'usage. */
const AI_PROMPTS: Record<string, string> = { mapping: MAPPING_SYSTEM_PROMPT, capture: CAPTURE_SYSTEM_PROMPT };
/** Clés de mémoire calculées par onglet (MEMORY_TOUCH/INVALIDATE n'acceptent que celles de l'origine de l'onglet). */
const memoryKeys = new MemoryKeyRegistry();

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Expéditeur vérifié : side panel pour ses commandes, cadre principal d'un onglet pour celles du content script.
  const access = checkSender(message?.type, sender, PANEL_URL_PREFIX, chrome.runtime.id);
  if (!access) return false;
  // Origine de la page : celle de l'expéditeur, jamais celle annoncée dans le message.
  const tab = access.kind === 'tab' ? access : null;
  const job = tab ? tabJob(tab.tabId) : undefined;
  if (tab && JOB_COMMANDS.has(message.type) && !job) {
    sendResponse(message.type === 'MEMORY_LOAD' ? null : message.type === 'ASK_AI' ? ({ ok: false, message: 'Aucun remplissage en cours sur cet onglet.' } satisfies AskAiResponse) : false);
    return false;
  }

  switch (message.type) {
    case 'PAGE_DETECTED':
      pagesByTab.set(tab!.tabId, { origin: tab!.origin, title: String(message.title).slice(0, 200), fieldCount: Number(message.fieldCount) || 0 });
      return false;

    case 'GET_ACTIVE_PAGE':
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(([active]) => sendResponse(active?.id !== undefined ? (pagesByTab.get(active.id) ?? null) : null))
        .catch(() => sendResponse(null));
      return true; // réponse asynchrone

    case 'GET_STATE':
      panelState()
        .then(sendResponse)
        .catch(() => sendResponse(null));
      return true;

    case 'GET_ACCESS_REQUEST':
      accessRequest()
        .then(sendResponse)
        .catch(() => sendResponse(null));
      return true;

    case 'ACCESS_GRANTED':
      onAccessGranted()
        .then(sendResponse)
        .catch(() => sendResponse(false));
      return true;

    case 'GET_JOB_FOR_ORIGIN': {
      // Le content script d'une page demande : y a-t-il une tarification à faire sur cet extranet ?
      const { tabId, origin } = tab!;
      signedInUser()
        .then(async user => {
          const found = user ? await findTabJob(user, tabId, origin) : null;
          if (user && found) startJobWatch(tabId, user, found);
          sendResponse(found);
        })
        .catch(() => sendResponse(null));
      return true;
    }

    case 'UPDATE_JOB':
      // Seul le job suivi par cet onglet peut être mis à jour.
      if (!jobMatches(job, message.dossierId, message.insurerId)) {
        sendResponse({ ok: false, message: 'Ce job n’est pas suivi par cet onglet.' } satisfies UpdateJobResponse);
        return false;
      }
      updateJobWithCause(message.dossierId, message.insurerId, message.update).then(sendResponse);
      return true;

    case 'RUN_STATE':
      if (!message.state) runByTab.delete(tab!.tabId);
      // Un avancement n'est accepté que pour le job suivi par l'onglet.
      else if (jobMatches(jobByTab.get(tab!.tabId), message.state.dossierId, message.state.insurerId)) runByTab.set(tab!.tabId, message.state);
      else return false;
      void broadcast();
      return false;

    case 'REPORT_ISSUE':
      report(job!.insurerId, tab!.origin, message.step, message.issue)
        .then(() => sendResponse(true))
        .catch(() => sendResponse(false));
      return true;

    case 'CONFIRM_CAPTURE':
      confirmCapture(message.edits)
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, message: toUserMessage(error) } satisfies CaptureResponse));
      return true;

    case 'REJECT_CAPTURE':
      rejectCapture()
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, message: toUserMessage(error) } satisfies CaptureResponse));
      return true;

    case 'ASK_AI': {
      // Prompt système fixe (jamais celui de la page), tokens plafonnés, texte borné.
      const request = sanitizeAiRequest(message, AI_PROMPTS);
      if (!request) {
        sendResponse({ ok: false, message: 'Requête d’IA invalide.' } satisfies AskAiResponse);
        return false;
      }
      signedInUser()
        .then(user => {
          if (!user) throw new UserFacingError(MESSAGES.sessionExpired);
          return askAi(request);
        })
        .then(text => sendResponse({ ok: true, text } satisfies AskAiResponse))
        // Session expirée, autorisation manquante ou IA indisponible : message clair affiché dans le side panel.
        .catch(error => sendResponse({ ok: false, message: toAiMessage(error) } satisfies AskAiResponse));
      return true;
    }

    // Nouveaux champs d'un extranet : ajoutés au questionnaire côté serveur. Une panne ne gêne jamais le remplissage.
    case 'FIELDS_DISCOVERED': {
      const insurerId = tabJob(tab!.tabId)?.insurerId;
      if (!insurerId || !Array.isArray(message.fields)) {
        sendResponse(false);
        return false;
      }
      signedInUser()
        .then(user => (user ? reportDiscoveredFields(insurerId, tab!.origin, String(message.fingerprint), message.fields, Array.isArray(message.requiredPaths) ? message.requiredPaths : []) : undefined))
        .then(() => sendResponse(true))
        .catch(() => sendResponse(false));
      return true;
    }

    // Mémoire partagée des formulaires (E8) : une panne ne doit jamais empêcher le remplissage.
    case 'MEMORY_LOAD':
      signedInUser()
        .then(user => (user ? loadMemory(tab!.origin, message.fingerprint, user.cabinetId) : null))
        .then(async loaded => {
          // La clé est calculée ici pour l'origine réelle de l'onglet : seule celle-ci pourra être utilisée/invalidée.
          memoryKeys.remember(tab!.tabId, tab!.origin, await memoryKeyFor(tab!.origin, String(message.fingerprint)));
          sendResponse(loaded);
        })
        .catch(() => sendResponse(null));
      return true;

    case 'MEMORY_SAVE':
    case 'MEMORY_TOUCH':
    case 'MEMORY_INVALIDATE':
      // Une clé ne s'utilise que sur l'origine de l'onglet qui l'a chargée (jamais la mémoire d'un autre extranet).
      if (message.type !== 'MEMORY_SAVE' && !memoryKeys.allows(tab!.tabId, tab!.origin, message.key)) {
        sendResponse(false);
        return false;
      }
      signedInUser()
        .then(async user => {
          if (!user) return false;
          if (message.type === 'MEMORY_SAVE') {
            const outcome = await saveMemory(tab!.origin, message.fingerprint, message.fields);
            memoryKeys.remember(tab!.tabId, tab!.origin, await memoryKeyFor(tab!.origin, String(message.fingerprint)));
            return outcome;
          }
          await (message.type === 'MEMORY_TOUCH' ? touchMemory(message.key) : invalidateMemory(message.key));
          return true;
        })
        .then(sendResponse)
        .catch(() => sendResponse(false));
      return true;

    case 'MANUAL_MAP':
    case 'REFILL':
    case 'CAPTURE_NOW':
      // Depuis le side panel : transmis à la page de l'onglet actif.
      activeTabId()
        .then(tabId => {
          if (tabId === undefined) return false;
          return chrome.tabs.sendMessage(tabId, message as TabMessage).then(
            () => true,
            () => false,
          );
        })
        .then(sendResponse)
        .catch(() => sendResponse(false));
      return true;

    case 'SIGN_IN':
      auth
        .signIn(message.email, message.password)
        .then(async state => {
          const response: SignInResponse = { ok: true, state: await panelState(state) };
          sendResponse(response);
          void syncContentScripts();
        })
        .catch(error => {
          const response: SignInResponse = { ok: false, message: error instanceof UserFacingError ? error.message : toUserMessage(error) };
          sendResponse(response);
        });
      return true;

    case 'SIGN_OUT':
      auth
        .signOut()
        .then(state => panelState(state))
        .then(sendResponse)
        // Déconnexion en échec : le side panel reçoit l'état courant (il ne reste jamais sans réponse).
        .catch(() => panelState().then(sendResponse, () => sendResponse(null)));
      return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener(tabId => {
  pagesByTab.delete(tabId);
  runByTab.delete(tabId);
  memoryKeys.forget(tabId);
  stopJobWatch(tabId);
  void unpinJob(tabId);
});
// Le side panel montre l'avancement de l'onglet actif : il change avec lui.
chrome.tabs.onActivated.addListener(() => void broadcast());

// Messages de l'app Angular (domaines autorisés dans manifest.json → externally_connectable).
// L'app transmet son identifiant d'appareil (PING) et, pour la connexion automatique (CONNECT), un jeton destiné à
// l'extension émis par le serveur : jamais son propre jeton. L'extension en tire sa propre connexion Firebase, et le
// serveur vérifie qu'elle s'ouvre sur l'appareil lié de la session de l'app.
const EXTERNAL_ORIGINS = externalOriginsFromMatches(chrome.runtime.getManifest().externally_connectable?.matches);

chrome.runtime.onMessageExternal.addListener((message: ExternalMessage, sender, sendResponse) => {
  // Seules les origines de l'app déclarées dans le manifest sont écoutées (jamais une autre extension).
  const origin = sender.origin ?? originOnly(sender.url);
  if (sender.id !== undefined && sender.id !== chrome.runtime.id) return false;
  if (!origin || !EXTERNAL_ORIGINS.has(origin)) return false;
  switch (message?.type) {
    case 'PING':
      if (isDeviceId(message.deviceId)) {
        void chrome.storage.local.set({ [APP_DEVICE_KEY]: message.deviceId }).catch(() => undefined);
      }
      // L'app apprend aussi si l'extension est connectée (et à quel compte) : elle ne propose la connexion
      // automatique que si besoin.
      auth
        .getState()
        .catch((): AuthState => ({ status: 'signed_out', notice: null }))
        .then(state => {
          const response: PongResponse = {
            type: 'PONG',
            version: chrome.runtime.getManifest().version,
            signedIn: state.status === 'signed_in',
            uid: state.status === 'signed_in' ? state.user.uid : null,
          };
          sendResponse(response);
        });
      return true;

    case 'CONNECT':
      if (!isDeviceId(message.deviceId) || typeof message.token !== 'string' || !message.token || message.token.length > MAX_CUSTOM_TOKEN_LENGTH) {
        sendResponse({ type: 'CONNECT_FAILED', message: MESSAGES.generic } satisfies ConnectResponse);
        return false;
      }
      void connectFromApp(message.token, message.deviceId).then(sendResponse);
      return true;
  }
  return false;
});

/** Format de l'identifiant d'appareil généré par l'app (UUID), même règle que le serveur. */
function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(value);
}

/** Un custom token Firebase fait moins d'un ko : au-delà, le message est rejeté sans être traité. */
const MAX_CUSTOM_TOKEN_LENGTH = 4096;

/** Connexion automatique en cours : plusieurs onglets de l'app peuvent l'envoyer en même temps. */
let pendingConnect: Promise<ConnectResponse> | null = null;

/**
 * Connexion automatique demandée par l'app : l'appareil est enregistré d'abord (le serveur le vérifie à
 * l'ouverture de la session d'extension), puis le jeton est échangé contre la connexion de l'extension.
 * Une connexion existante (autre compte) est fermée avant.
 */
function connectFromApp(token: string, deviceId: string): Promise<ConnectResponse> {
  pendingConnect ??= (async (): Promise<ConnectResponse> => {
    try {
      await chrome.storage.local.set({ [APP_DEVICE_KEY]: deviceId });
      const current = await auth.getState().catch(() => null);
      if (current?.status === 'signed_in') await auth.signOut();
      const state = await auth.signInWithToken(token);
      if (state.status !== 'signed_in') return { type: 'CONNECT_FAILED', message: MESSAGES.generic };
      void syncContentScripts();
      return { type: 'CONNECTED', uid: state.user.uid };
    } catch (error) {
      return { type: 'CONNECT_FAILED', message: error instanceof UserFacingError ? error.message : toUserMessage(error) };
    } finally {
      pendingConnect = null;
    }
  })();
  return pendingConnect;
}
