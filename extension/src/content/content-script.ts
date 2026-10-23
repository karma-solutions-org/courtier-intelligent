import { matchesUrlPattern } from '@shared';
import { isAuthPage } from '../engine/analyzer';
import { describeClick, findActionTarget } from '../engine/entry-path';
import { JobUpdateError } from '../engine/runner-ports';
import type { FormLayout } from '../engine/layout-ai';
import { LoadedMemory, MemoryPort, type MemorySaveOutcome } from '../engine/memory';
import { FormRunner } from '../engine/runner';
import { waitForSettled } from '../engine/steps';
import { createFloatingBar, type FloatingBar } from './floating-bar';
import { AskAiResponse, EntryInstruction, ExtensionMessage, JobContext, JobUpdate, RUNNER_PORT, type UpdateJobResponse, type FieldsDiscoveredResponse, RunState, TabMessage } from '../shared/messages';

/** Compte les champs de formulaire visibles (affiché dans le side panel). */
function countVisibleFields(): number {
  return [...document.querySelectorAll<HTMLElement>('input, select, textarea')].filter(
    el => !(el instanceof HTMLInputElement && el.type === 'hidden') && el.offsetParent !== null,
  ).length;
}

let runner: FormRunner | null = null;
/** Barre flottante (pause, sauvegarde du tarif) de la page principale pendant un remplissage. */
let bar: FloatingBar | null = null;

/** Message de la barre selon l'état publié par le remplissage (capture du tarif surtout). */
function barStatusFor(state: RunState): string | null {
  switch (state.phase) {
    case 'capturing':
      return 'Lecture du tarif affiché…';
    case 'capture_review':
      return 'Enregistrement…';
    case 'capture_failed':
      return 'Aucun tarif lisible';
    default:
      return null;
  }
}
/** Arrête le remplissage de la page (apprentissage du chemin d'accès), ou null sans remplissage. */
let stopRunner: (() => void) | null = null;
/** Job de la page (page principale) : le remplissage reprend avec lui après l'apprentissage. */
let currentJob: JobContext | null = null;

/** Arrête le remplissage en cours (fermeture de la page ou extension rechargée). */
const teardowns: (() => void)[] = [];
let orphaned = false;

/**
 * Extension rechargée, mise à jour ou désactivée : ce content script reste dans la page mais n'a plus de
 * contexte (`chrome.runtime.id` disparaît) et chaque appel à `chrome.runtime` lève « Extension context
 * invalidated ». On s'arrête une fois pour toutes ; la nouvelle version est réinjectée au prochain chargement.
 */
function contextLost(): boolean {
  if (orphaned) return true;
  try {
    if (chrome.runtime?.id) return false;
  } catch {
    // L'accès lui-même peut lever : contexte perdu.
  }
  orphaned = true;
  teardowns.splice(0).forEach(teardown => teardown());
  return true;
}

/** Toujours une promesse : `sendMessage` lève de façon synchrone quand le contexte est perdu. */
const send = <T = unknown>(message: ExtensionMessage): Promise<T> => {
  if (contextLost()) return Promise.reject(new Error('extension_context_invalidated'));
  try {
    return chrome.runtime.sendMessage(message) as Promise<T>;
  } catch (error) {
    contextLost();
    return Promise.reject(error);
  }
};

// Injecté par l'enregistrement dynamique ou, juste après l'autorisation, par executeScript : une seule fois par page.
const LOADED_FLAG = '__courtierIntelligentLoaded';
const alreadyLoaded = (globalThis as Record<string, unknown>)[LOADED_FLAG] === true;
(globalThis as Record<string, unknown>)[LOADED_FLAG] = true;
if (!alreadyLoaded) {

/** Mémoire partagée des formulaires : le service worker lit et écrit pour nous (il a la connexion Firebase). */
const memoryPort: MemoryPort = {
  load: (origin, fingerprint) => send<LoadedMemory | null>({ type: 'MEMORY_LOAD', origin, fingerprint }),
  save: async (origin, fingerprint, fields) => {
    const outcome = await send<MemorySaveOutcome | boolean>({ type: 'MEMORY_SAVE', origin, fingerprint, fields });
    if (outcome === false) throw new Error('memory_save_failed');
    return typeof outcome === 'string' ? outcome : undefined;
  },
  touch: async key => void (await send({ type: 'MEMORY_TOUCH', key })),
  invalidate: async key => void (await send({ type: 'MEMORY_INVALIDATE', key })),
};

/** Lance le remplissage de l'extranet pour ce job. */
async function startRunner(job: JobContext): Promise<void> {
  // Un port ouvert garde le service worker éveillé et lui permet de nous prévenir quand le dossier change.
  // Le service worker redémarre (et coupe le port) : on le rouvre tant que la page est ouverte.
  let port: chrome.runtime.Port | null = null;
  let closed = false;
  const openPort = () => {
    if (closed || contextLost()) return;
    try {
      port = chrome.runtime.connect({ name: RUNNER_PORT });
    } catch {
      // Extension rechargée ou désactivée : ce content script n'a plus de contexte.
      port = null;
      return;
    }
    port.onDisconnect.addListener(() => {
      port = null;
      if (!closed) setTimeout(openPort, 1_000);
    });
    port.postMessage({ type: 'JOB', dossierId: job.dossierId, insurerId: job.insurerId });
  };
  openPort();
  const keepAlive = setInterval(() => {
    try {
      port?.postMessage({ type: 'PING' });
    } catch {
      // Port coupé entre-temps : il est rouvert par onDisconnect.
    }
  }, 20_000);

  runner = new FormRunner(job, {
    doc: document,
    report: async (update: JobUpdate) => {
      // `false` : le service worker n'a pas pu écrire l'avancement (le runner le signale, E10-4).
      const saved = await send<UpdateJobResponse>({ type: 'UPDATE_JOB', dossierId: job.dossierId, insurerId: job.insurerId, update });
      if (!saved?.ok) throw new JobUpdateError(saved?.message ?? 'Avancement non enregistré dans l’application.', saved?.cancelled === true);
    },
    publish: (state: RunState) => {
      const text = barStatusFor(state);
      if (text) bar?.setStatus(text);
      void send({ type: 'RUN_STATE', state }).catch(() => undefined);
    },
    memory: memoryPort,
    reportDiscovered: async (fingerprint, fields, requiredPaths) =>
      (await send<FieldsDiscoveredResponse>({ type: 'FIELDS_DISCOVERED', fingerprint, fields, requiredPaths }))?.mapping ?? {},
    origin: location.origin,
    autoAdvance: true,
    // Formulaire de devis atteint : l'apprentissage automatique du chemin d'accès s'arrête et l'enregistre.
    formReached: () => {
      stopRecording();
      void send({ type: 'ENTRY_FORM_REACHED' }).catch(() => undefined);
    },
    // Lecture de la mise en page par l'IA : gardée dans le navigateur (structure seulement), par extranet et formulaire.
    layoutCache: {
      load: async fingerprint => {
        const key = `layout:${location.origin}:${fingerprint}`;
        const stored = await chrome.storage.local.get(key);
        return (stored[key] as FormLayout | undefined) ?? null;
      },
      save: async (fingerprint, layout) => {
        await chrome.storage.local.set({ [`layout:${location.origin}:${fingerprint}`]: layout });
      },
    },
    reportIssue: async (step, issue) =>
      void (await send({ type: 'REPORT_ISSUE', insurerId: job.insurerId, origin: location.origin, step, issue })),
    askAi: async request => {
      const response = await send<AskAiResponse>({ type: 'ASK_AI', purpose: request.purpose, messages: request.messages, maxTokens: request.maxTokens });
      if (!response.ok) throw new Error(response.message);
      return response.text;
    },
  });
  const stop = () => {
    closed = true;
    clearInterval(keepAlive);
    try {
      port?.disconnect();
    } catch {
      // Port déjà invalide (contexte perdu).
    }
    runner?.stop();
    bar?.destroy();
    bar = null;
  };
  teardowns.push(stop);
  stopRunner = () => {
    stop();
    runner = null;
    stopRunner = null;
    void send({ type: 'RUN_STATE', state: null }).catch(() => undefined);
  };
  window.addEventListener('pagehide', () => {
    stop();
    void send({ type: 'RUN_STATE', state: null }).catch(() => undefined);
  });
  // Page principale seulement : une barre par onglet, jamais dans une iframe de l'extranet.
  if (window === window.top) {
    const current = runner;
    bar = createFloatingBar(document, {
      pause: () => current.pause(),
      resume: () => void current.resume(),
      save: () => current.captureNow().then(() => true, () => false),
    });
    // « Sauvegarder le tarif » seulement quand un tarif est affiché : vérifié quand la page cesse de bouger.
    let tariffCheck: ReturnType<typeof setTimeout> | undefined;
    const checkTariff = () => bar?.setSaveVisible(current.hasTariffOnPage());
    const watcher = new MutationObserver(() => {
      clearTimeout(tariffCheck);
      tariffCheck = setTimeout(checkTariff, 700);
    });
    watcher.observe(document.body, { childList: true, subtree: true, characterData: true });
    teardowns.push(() => {
      watcher.disconnect();
      clearTimeout(tariffCheck);
    });
    checkTariff();
  }
  await runner.start();
}

/** Répond toujours : `false` sans remplissage en cours ou si l'action échoue (l'appelant n'attend jamais en vain). */
function respond(action: Promise<unknown>, sendResponse: (response: boolean) => void): true {
  action.then(() => sendResponse(true), () => sendResponse(false));
  return true;
}

chrome.runtime.onMessage.addListener((message: TabMessage, sender, sendResponse) => {
  // Seul le service worker de cette extension nous parle (jamais un autre onglet).
  if (sender.id !== chrome.runtime.id || sender.tab) return false;
  // Apprentissage du chemin d'accès : envoyé à la seule page principale.
  if (message.type === 'ENTRY_RECORD_START') {
    stopRunner?.();
    startRecording();
    sendResponse(true);
    return false;
  }
  if (message.type === 'ENTRY_RECORD_STOP') {
    stopRecording();
    if (currentJob && !runner) void startRunner(currentJob).catch(() => undefined);
    sendResponse(true);
    return false;
  }
  // Le message est envoyé à tous les cadres de l'onglet : seul celui qui remplit répond (les autres laissent la main).
  if (!runner) return false;
  switch (message.type) {
    case 'MANUAL_MAP':
      return respond(runner.manualMap(message.fieldKey, message.canonicalPath), sendResponse);
    case 'REFILL':
      return respond(runner.refill(), sendResponse);
    case 'JOB_CHANGED':
      return respond(runner.updateJob(message.job), sendResponse);
    case 'CAPTURE_NOW':
      return respond(runner.captureNow(), sendResponse);
    case 'CAPTURE_SAVE_FAILED':
      bar?.setStatus('Tarif non enregistré : voir le panneau');
      sendResponse(true);
      return false;
    case 'CAPTURE_DONE':
      runner.stop();
      bar?.setStatus('Tarif enregistré ✓');
      sendResponse(true);
      return false;
  }
  return false;
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** GET_JOB_FOR_ORIGIN, avec quelques nouveaux essais (service worker en cours de démarrage, réseau). */
async function findJob(): Promise<JobContext | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return (await send<JobContext | null>({ type: 'GET_JOB_FOR_ORIGIN', origin: location.origin })) ?? null;
    } catch {
      if (attempt < 2) await delay(500 * 2 ** attempt);
    }
  }
  return null;
}

/** Attend que des champs apparaissent (formulaire chargé après coup) ; false si rien au bout de `timeoutMs`. */
async function waitForFields(timeoutMs = 15_000): Promise<boolean> {
  for (let waited = 0; countVisibleFields() === 0; waited += 1_000) {
    if (waited >= timeoutMs) return false;
    await delay(1_000);
  }
  return true;
}

// ── Chemin d'accès au formulaire (profil d'extranet) ────────────────────────
/** Apprentissage : chaque clic de navigation du courtier est envoyé au service worker. */
const recordClick = (event: MouseEvent) => {
  // La connexion n'est pas un clic du chemin (« Se connecter ») : le rejeu attend que le courtier se connecte.
  if (isAuthPage(document)) return;
  const action = describeClick(event.target, location.href);
  if (action) void send({ type: 'ENTRY_RECORDED', action }).catch(() => undefined);
};

function startRecording(): void {
  document.removeEventListener('click', recordClick, true);
  document.addEventListener('click', recordClick, true);
}

function stopRecording(): void {
  document.removeEventListener('click', recordClick, true);
}

/** Délai pour trouver le bouton du prochain clic (menu chargé après coup, animation). */
const ENTRY_TARGET_TIMEOUT_MS = 10_000;

/**
 * Attend que le courtier se soit connecté à l'extranet : la page de connexion disparaît (application d'une seule page).
 * Si la connexion recharge la page, ce script s'arrête et celui de la page suivante reprend là où on en était.
 */
async function waitForLogin(): Promise<void> {
  while (isAuthPage(document)) {
    await delay(1000);
  }
  await waitForSettled(document);
}

/**
 * Rejoue le chemin d'accès enregistré, clic par clic, tant que la page reste la même (application d'une seule page) ;
 * une page rechargée reprend au clic suivant (l'avancement est gardé par le service worker, noté AVANT chaque clic).
 * Renvoie `recording` si le courtier apprend le chemin, `done` quand il faut remplir la page.
 */
async function runEntry(): Promise<'recording' | 'done'> {
  for (;;) {
    const instruction = await send<EntryInstruction | false>({ type: 'ENTRY_GET' }).catch(() => false as const);
    if (!instruction || instruction.mode === 'none') return 'done';
    if (instruction.mode === 'record') {
      startRecording();
      // Apprentissage automatique : la page se remplit quand même, le chemin s'enregistre au formulaire de devis.
      return instruction.auto ? 'done' : 'recording';
    }
    // Page de connexion : le courtier se connecte lui-même ; le chemin reprend dès qu'elle disparaît.
    await waitForLogin();
    const { action, index } = instruction;
    // Le premier clic se fait sur la page où il a été appris : ailleurs (formulaire déjà ouvert), le chemin est passé.
    if (index === 0 && !matchesUrlPattern(location.href, action.urlPattern)) {
      await send({ type: 'ENTRY_FAILED', index, reason: 'skipped' }).catch(() => undefined);
      return 'done';
    }
    let target = findActionTarget(document, action);
    for (let waited = 0; !target && waited < ENTRY_TARGET_TIMEOUT_MS; waited += 500) {
      await delay(500);
      target = findActionTarget(document, action);
    }
    if (!target) {
      await send({ type: 'ENTRY_FAILED', index, reason: 'not_found' }).catch(() => undefined);
      return 'done';
    }
    // Avancement non noté (service worker injoignable) : on ne clique pas, la page se remplit telle quelle.
    if (!(await send<boolean>({ type: 'ENTRY_CLICKED', index }).catch(() => false))) return 'done';
    target.click();
    await waitForSettled(document);
  }
}

/**
 * Le script tourne dans chaque cadre de l'extranet. Seul le cadre qui porte le formulaire remplit : une iframe sans
 * champ (publicité, menu…) reste muette ; la page principale qui ne fait qu'inclure le formulaire dans une iframe aussi.
 */
async function main(): Promise<void> {
  const isTopFrame = window === window.top;
  const detect = () =>
    send({ type: 'PAGE_DETECTED', origin: location.origin, title: document.title, fieldCount: countVisibleFields() }).catch(() => {
      // Le service worker peut être en cours de redémarrage : rien à faire.
    });
  if (isTopFrame) void detect();
  const hasFrames = document.querySelector('iframe, frame') !== null;
  if (!isTopFrame || hasFrames) {
    if (!(await waitForFields())) return;
    if (!isTopFrame) void detect();
  }
  // Y a-t-il un job de tarification pour l'assureur de cet extranet ?
  const job = await findJob();
  if (!job) return;
  // Page principale : d'abord le chemin d'accès jusqu'au formulaire (appris ou rejoué), puis le remplissage.
  if (isTopFrame) {
    currentJob = job;
    if ((await runEntry()) === 'recording') return;
    // Sans chemin à rejouer, la connexion à l'extranet est attendue aussi avant de remplir.
    await waitForLogin();
  }
  await startRunner(job);
}

void main().catch(() => undefined);
}
