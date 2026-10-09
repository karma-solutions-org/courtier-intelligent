import { LoadedMemory, MemoryPort } from '../engine/memory';
import { FormRunner } from '../engine/runner';
import { AskAiResponse, ExtensionMessage, JobContext, JobUpdate, RUNNER_PORT, RunState, TabMessage } from '../shared/messages';

/** Compte les champs de formulaire visibles (affiché dans le side panel). */
function countVisibleFields(): number {
  return [...document.querySelectorAll<HTMLElement>('input, select, textarea')].filter(
    el => !(el instanceof HTMLInputElement && el.type === 'hidden') && el.offsetParent !== null,
  ).length;
}

const send = <T = unknown>(message: ExtensionMessage): Promise<T> => chrome.runtime.sendMessage(message);

let runner: FormRunner | null = null;

/** Mémoire partagée des formulaires : le service worker lit et écrit pour nous (il a la connexion Firebase). */
const memoryPort: MemoryPort = {
  load: (origin, fingerprint) => send<LoadedMemory | null>({ type: 'MEMORY_LOAD', origin, fingerprint }),
  save: async (origin, fingerprint, fields) => void (await send({ type: 'MEMORY_SAVE', origin, fingerprint, fields })),
  touch: async key => void (await send({ type: 'MEMORY_TOUCH', key })),
  invalidate: async key => void (await send({ type: 'MEMORY_INVALIDATE', key })),
};

/** Lance le remplissage de l'extranet pour ce job. */
async function startRunner(job: JobContext): Promise<void> {
  // Un port ouvert garde le service worker éveillé et lui permet de nous prévenir quand le dossier change.
  const port = chrome.runtime.connect({ name: RUNNER_PORT });
  port.postMessage({ type: 'JOB', dossierId: job.dossierId, insurerId: job.insurerId });
  const keepAlive = setInterval(() => port.postMessage({ type: 'PING' }), 20_000);

  runner = new FormRunner(job, {
    doc: document,
    report: async (update: JobUpdate) => {
      // `false` : le service worker n'a pas pu écrire l'avancement (le runner le signale, E10-4).
      const saved = await send<boolean>({ type: 'UPDATE_JOB', dossierId: job.dossierId, insurerId: job.insurerId, update });
      if (saved === false) throw new Error('job_update_failed');
    },
    publish: (state: RunState) => void send({ type: 'RUN_STATE', state }).catch(() => undefined),
    memory: memoryPort,
    origin: location.origin,
    reportIssue: async (step, issue) =>
      void (await send({ type: 'REPORT_ISSUE', insurerId: job.insurerId, origin: location.origin, step, issue })),
    askAi: async request => {
      const response = await send<AskAiResponse>({ type: 'ASK_AI', ...request });
      if (!response.ok) throw new Error(response.message);
      return response.text;
    },
  });
  window.addEventListener('pagehide', () => {
    clearInterval(keepAlive);
    runner?.stop();
    void send({ type: 'RUN_STATE', state: null }).catch(() => undefined);
  });
  await runner.start();
}

chrome.runtime.onMessage.addListener((message: TabMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'MANUAL_MAP':
      void runner?.manualMap(message.fieldKey, message.canonicalPath).then(() => sendResponse(true));
      return true;
    case 'REFILL':
      void runner?.refill().then(() => sendResponse(true));
      return true;
    case 'JOB_CHANGED':
      void runner?.updateJob(message.job).then(() => sendResponse(true));
      return true;
    case 'CAPTURE_NOW':
      void runner?.captureNow().then(() => sendResponse(true));
      return true;
    case 'CAPTURE_DONE':
      runner?.stop();
      sendResponse(true);
      return false;
  }
  return false;
});

// Page analysée (side panel), puis : y a-t-il un job de tarification pour l'assureur de cet extranet ?
send({ type: 'PAGE_DETECTED', origin: location.origin, title: document.title, fieldCount: countVisibleFields() }).catch(() => {
  // Le service worker peut être en cours de redémarrage : rien à faire.
});
send<JobContext | null>({ type: 'GET_JOB_FOR_ORIGIN', origin: location.origin })
  .then(job => (job ? startRunner(job) : undefined))
  .catch(() => undefined);
