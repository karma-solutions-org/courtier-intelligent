import { EXTENSION_REPORT_ISSUES, EXTENSION_REPORT_STEPS, ExtensionReportIssue, ExtensionReportStep } from '@shared';
import { hasPremium, sanitizeOffer } from '../engine/offer';
import {
  ActivePage,
  AskAiResponse,
  AuthState,
  CaptureEdits,
  CaptureResponse,
  CurrentJob,
  ExtensionMessage,
  ExtensionUser,
  ExternalMessage,
  JobContext,
  PanelState,
  PortMessage,
  RUNNER_PORT,
  RunState,
  SIDE_PANEL_PORT,
  SignInResponse,
  TabMessage,
} from '../shared/messages';
import { createAuthController, toUserMessage, UserFacingError } from './auth-controller';
import { firebaseAuthPort, firebaseBackendPort, firestoreSessionPort } from './firebase-adapters';
import { addExtensionReport, askAi, findJobForOrigin, listRecentJobs, updateJob, watchJob, writeCapturedOffer } from './jobs-service';
import { startLiveWatch } from './live';
import { invalidateMemory, loadMemory, saveMemory, touchMemory } from './memory-service';
import { countRequested } from './origin-match';

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

/** Affiche sur l'icône le nombre de tarifications « requested » à lancer. */
async function refreshBadge(): Promise<void> {
  try {
    const user = await signedInUser();
    const count = user ? countRequested(await listRecentJobs(user)) : 0;
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#00082b' });
  } catch {
    // Le badge est un confort : une erreur réseau ne doit rien casser.
  }
}

function stopJobWatch(tabId: number): void {
  jobWatchByTab.get(tabId)?.();
  jobWatchByTab.delete(tabId);
}

/** Prévient le content script quand le courtier répond aux champs manquants dans l'app. */
function startJobWatch(tabId: number, user: ExtensionUser, job: JobContext): void {
  stopJobWatch(tabId);
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
  if (state.status === 'signed_out') {
    runByTab.clear();
    jobWatchByTab.forEach(stop => stop());
    jobWatchByTab.clear();
  }
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
  port.onMessage.addListener(() => undefined);
  port.onDisconnect.addListener(() => {
    const tabId = port.sender?.tab?.id;
    if (tabId !== undefined) {
      stopJobWatch(tabId);
      runByTab.delete(tabId);
      void broadcast();
    }
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
    void verifySession();
    void refreshBadge();
  }
});
chrome.runtime.onInstalled.addListener(() => void ensureAlarm());
chrome.runtime.onStartup.addListener(() => void ensureAlarm());
// À chaque réveil du service worker : même vérification (et jeton rafraîchi s'il approche de son expiration).
void ensureAlarm();
void verifySession().then(refreshBadge);

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
    return { ok: false, message: toUserMessage(error) };
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

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  switch (message.type) {
    case 'PAGE_DETECTED':
      if (sender.tab?.id !== undefined) {
        pagesByTab.set(sender.tab.id, { origin: message.origin, title: message.title, fieldCount: message.fieldCount });
      }
      return false;

    case 'GET_ACTIVE_PAGE':
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        sendResponse(tab?.id !== undefined ? (pagesByTab.get(tab.id) ?? null) : null);
      });
      return true; // réponse asynchrone

    case 'GET_STATE':
      panelState().then(sendResponse);
      return true;

    case 'GET_JOB_FOR_ORIGIN': {
      // Le content script d'une page demande : y a-t-il une tarification à faire sur cet extranet ?
      const tabId = sender.tab?.id;
      signedInUser()
        .then(async user => {
          const job = user ? await findJobForOrigin(user, message.origin) : null;
          if (user && job && tabId !== undefined) startJobWatch(tabId, user, job);
          sendResponse(job);
        })
        .catch(() => sendResponse(null));
      return true;
    }

    case 'UPDATE_JOB':
      signedInUser()
        .then(user => (user ? updateJob(user, message.dossierId, message.insurerId, message.update) : undefined))
        .then(() => sendResponse(true))
        .catch(() => sendResponse(false));
      return true;

    case 'RUN_STATE':
      if (sender.tab?.id !== undefined) {
        if (message.state) runByTab.set(sender.tab.id, message.state);
        else runByTab.delete(sender.tab.id);
        void broadcast();
      }
      return false;

    case 'REPORT_ISSUE':
      report(message.insurerId, message.origin, message.step, message.issue).then(() => sendResponse(true));
      return true;

    case 'CONFIRM_CAPTURE':
      confirmCapture(message.edits).then(sendResponse);
      return true;

    case 'REJECT_CAPTURE':
      rejectCapture().then(sendResponse);
      return true;

    case 'ASK_AI':
      askAi({ system: message.system, messages: message.messages, maxTokens: message.maxTokens })
        .then(text => sendResponse({ ok: true, text } satisfies AskAiResponse))
        .catch(error => sendResponse({ ok: false, message: toUserMessage(error) } satisfies AskAiResponse));
      return true;

    // Mémoire partagée des formulaires (E8) : une panne ne doit jamais empêcher le remplissage.
    case 'MEMORY_LOAD':
      signedInUser()
        .then(user => (user ? loadMemory(message.origin, message.fingerprint) : null))
        .then(sendResponse)
        .catch(() => sendResponse(null));
      return true;

    case 'MEMORY_SAVE':
    case 'MEMORY_TOUCH':
    case 'MEMORY_INVALIDATE':
      signedInUser()
        .then(user => {
          if (!user) return;
          if (message.type === 'MEMORY_SAVE') return saveMemory(message.origin, message.fingerprint, message.fields);
          return message.type === 'MEMORY_TOUCH' ? touchMemory(message.key) : invalidateMemory(message.key);
        })
        .then(() => sendResponse(true))
        .catch(() => sendResponse(false));
      return true;

    case 'MANUAL_MAP':
    case 'REFILL':
    case 'CAPTURE_NOW':
      // Depuis le side panel : transmis à la page de l'onglet actif.
      activeTabId().then(tabId => {
        if (tabId === undefined) return sendResponse(false);
        chrome.tabs.sendMessage(tabId, message as TabMessage).then(
          () => sendResponse(true),
          () => sendResponse(false),
        );
      });
      return true;

    case 'SIGN_IN':
      auth
        .signIn(message.email, message.password)
        .then(async state => {
          const response: SignInResponse = { ok: true, state: await panelState(state) };
          sendResponse(response);
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
        .then(sendResponse);
      return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  pagesByTab.delete(tabId);
  runByTab.delete(tabId);
  stopJobWatch(tabId);
});
// Le side panel montre l'avancement de l'onglet actif : il change avec lui.
chrome.tabs.onActivated.addListener(() => void broadcast());

// Messages de l'app Angular (domaines autorisés dans manifest.json → externally_connectable).
// L'app ne transmet aucun identifiant : l'extension a sa propre connexion Firebase.
chrome.runtime.onMessageExternal.addListener((message: ExternalMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'PING':
      sendResponse({ type: 'PONG', version: chrome.runtime.getManifest().version });
      return false;
  }
});
