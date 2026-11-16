import { AI_SYSTEM_PROMPTS } from '@shared';
import { memoryKeyFor } from '../engine/memory';
import {
  AskAiResponse,
  CaptureResponse,
  EntryResponse,
  ExtensionMessage,
  RUNNER_PORT,
  SIDE_PANEL_PORT,
  SignInResponse,
  TabMessage,
  type FieldsDiscoveredResponse,
  type UpdateJobResponse,
} from '../shared/messages';
import { MESSAGES, toAiMessage, toUserMessage, UserFacingError } from './auth-controller';
import { applyRunState, confirmCapture, rejectCapture, report, updateJobWithCause } from './capture-service';
import { accessRequest, ensureInjected, onAccessGranted, syncContentScripts } from './content-scripts';
import { ensureTabEntry, entryCommand, entryFromTab } from './entry-commands';
import { removeTabEntry, instructionFor } from './entry-service';
import { onExternalMessage } from './external-messages';
import { askAi } from './jobs-service';
import { invalidateMemory, loadMemory, reportDiscoveredFields, saveMemory, touchMemory } from './memory-service';
import { addSeenFields, forgetSighting } from './sighting-service';
import { checkSender, JOB_COMMANDS, jobMatches, MemoryKeyRegistry, sanitizeAiRequest } from './sender-guard';
import { ensureAlarm, refreshBadge, SESSION_CHECK_ALARM, syncJobsWatch, syncLiveWatch, verifySession } from './session-watch';
import { findTabJob, forgetAllTabJobs, startJobWatch, stopJobWatch, tabJob, unpinJob } from './tab-jobs';
import { activeTabId, auth, broadcast, jobByTab, pagesByTab, panels, panelState, runByTab, signedInUser } from './worker-state';

// Aiguillage du service worker : les écouteurs Chrome sont tous enregistrés ici, au premier tour (exigé par MV3 pour
// qu'un réveil les retrouve) ; le travail est fait par les modules importés.

// Un clic sur l'icône de l'extension ouvre le side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Les changements d'état (connexion, perte de session) sont diffusés au side panel.
auth.onChange(state => {
  void syncJobsWatch();
  if (state.status === 'signed_out') {
    runByTab.clear();
    forgetAllTabJobs();
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

// ── Content script des extranets ────────────────────────────────────────────
chrome.permissions.onAdded.addListener(() => void syncContentScripts());
chrome.permissions.onRemoved.addListener(() => void syncContentScripts());
void syncContentScripts();

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  // Nouvelle page dans l'onglet : l'ancienne analyse ne vaut plus (le script de la nouvelle page se signalera).
  if (info.status === 'loading') pagesByTab.delete(tabId);
  if (info.status === 'complete') void ensureInjected(tabId, tab.url);
});

// ── Messages internes ───────────────────────────────────────────────────────
const PANEL_URL_PREFIX = chrome.runtime.getURL('sidepanel/');

/** Prompts système fixes de l'IA, par usage : la page ne choisit que l'usage. */
const AI_PROMPTS: Readonly<Record<string, string>> = AI_SYSTEM_PROMPTS;
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
          // Le chemin d'accès se joue dans la page principale (l'origine de l'extranet, pas celle d'une iframe).
          if (found && sender.frameId === 0) await ensureTabEntry(tabId, found, origin).catch(() => undefined);
          sendResponse(found);
        })
        .catch(() => sendResponse(null));
      return true;
    }

    case 'ENTRY_GET':
    case 'ENTRY_RECORDED':
    case 'ENTRY_CLICKED':
    case 'ENTRY_FAILED':
    case 'ENTRY_FORM_REACHED':
      // Extranet en cadres (Oyat) : un cadre lit l'instruction (il attend pendant un rejeu, observe pendant un
      // apprentissage), y enregistre les clics du courtier et signale le formulaire. Le rejeu se joue en page principale.
      if (sender.frameId !== 0 && (message.type === 'ENTRY_CLICKED' || message.type === 'ENTRY_FAILED')) {
        sendResponse(false);
        return false;
      }
      entryFromTab(tab!.tabId, message)
        .then(sendResponse)
        .catch(() => sendResponse(false));
      return true;

    case 'ENTRY_RECORD_START':
    case 'ENTRY_RECORD_SAVE':
    case 'ENTRY_RECORD_CANCEL':
      entryCommand(message.type)
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, message: toUserMessage(error) } satisfies EntryResponse));
      return true;

    case 'UPDATE_JOB':
      // Seul le job suivi par cet onglet peut être mis à jour.
      if (!jobMatches(job, message.dossierId, message.insurerId)) {
        sendResponse({ ok: false, message: 'Ce job n’est pas suivi par cet onglet.' } satisfies UpdateJobResponse);
        return false;
      }
      updateJobWithCause(message.dossierId, message.insurerId, message.update).then(sendResponse);
      return true;

    case 'RUN_STATE':
      applyRunState(tab!.tabId, message.state);
      return false;

    case 'REPORT_ISSUE':
      report(job!.insurerId, tab!.origin, message.step, message.issue, message.snapshot)
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
        sendResponse({ ok: false, mapping: {} } satisfies FieldsDiscoveredResponse);
        return false;
      }
      signedInUser()
        .then(user => (user ? reportDiscoveredFields(insurerId, tab!.origin, String(message.fingerprint), message.fields, Array.isArray(message.requiredPaths) ? message.requiredPaths : []) : {}))
        .then(mapping => sendResponse({ ok: true, mapping } satisfies FieldsDiscoveredResponse))
        .catch(() => sendResponse({ ok: false, mapping: {} } satisfies FieldsDiscoveredResponse));
      return true;
    }

    case 'FIELDS_SEEN':
      if (Array.isArray(message.fields)) void addSeenFields(tab!.tabId, job!, message.fields);
      return false;

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
  void removeTabEntry(tabId);
  void forgetSighting(tabId);
});
// Le side panel montre l'avancement de l'onglet actif : il change avec lui.
chrome.tabs.onActivated.addListener(() => void broadcast());

// Messages de l'app Angular (connexion automatique) : voir external-messages.ts.
chrome.runtime.onMessageExternal.addListener(onExternalMessage);
