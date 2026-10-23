import { EXTENSION_REPORT_ISSUES, EXTENSION_REPORT_STEPS, ExtensionReportIssue, ExtensionReportStep } from '@shared';
import { hasPremium, sanitizeOffer } from '../engine/offer';
import { CaptureEdits, CaptureResponse, ExtensionUser, JobUpdate, RunState, TabMessage, UpdateJobResponse } from '../shared/messages';
import { MESSAGES, toUserMessage } from './auth-controller';
import { addExtensionReport, explainJobDenied, updateJob, writeCapturedOffer } from './jobs-service';
import { jobMatches } from './sender-guard';
import { activeTabId, broadcast, jobByTab, originOnly, pagesByTab, runByTab, signedInUser } from './worker-state';

/** Signalement d'un échec (E10-4) : seulement des codes connus, l'assureur et l'origine. Une panne n'empêche rien. */
export async function report(insurerId: string, origin: string, step: ExtensionReportStep, issue: ExtensionReportIssue): Promise<void> {
  if (!EXTENSION_REPORT_STEPS.includes(step) || !EXTENSION_REPORT_ISSUES.includes(issue) || !(await signedInUser())) return;
  await addExtensionReport({ insurerId: insurerId.slice(0, 100), origin: originOnly(origin), step, issue }).catch(() => undefined);
}

/** Onglets (et job) dont un tarif est déjà enregistré : une nouvelle sauvegarde ne réécrit que l'offre. */
const savedCaptures = new Set<string>();
const captureKey = (tabId: number, run: RunState) => `${tabId}|${run.dossierId}|${run.insurerId}`;
const CAPTURE_PHASES: RunState['phase'][] = ['capturing', 'capture_review', 'captured', 'capture_failed'];

/** Avancement publié par la page : accepté seulement pour le job suivi par l'onglet (`null` : plus de remplissage). */
export function applyRunState(tabId: number, state: RunState | null): void {
  if (!state) runByTab.delete(tabId);
  else if (jobMatches(jobByTab.get(tabId), state.dossierId, state.insurerId)) {
    // Un envoi du tarif est déjà en cours : l'état republié par la page ne le relance pas.
    if (state.phase === 'capture_review' && runByTab.get(tabId)?.phase === 'capturing' && runByTab.get(tabId)?.capture?.offer) return;
    // La page remplit de nouveau (job relancé) : le prochain tarif repasse le job à « captured ».
    if (!CAPTURE_PHASES.includes(state.phase)) savedCaptures.delete(captureKey(tabId, state));
    runByTab.set(tabId, state);
    autoSubmitCapture(tabId, state);
  } else return;
  void broadcast();
}

/** Termine la capture de l'onglet : nouvel état pour le side panel, et la page arrête de surveiller. */
function finishCapture(tabId: number, run: RunState, update: Partial<RunState>): void {
  runByTab.set(tabId, { ...run, ...update });
  void broadcast();
  chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_DONE' } satisfies TabMessage).catch(() => undefined);
}

/** Écrit l'avancement d'un job ; en cas d'échec, renvoie la cause exacte (session, annulation, dossier, réseau). */
export async function updateJobWithCause(dossierId: string, insurerId: string, update: JobUpdate): Promise<UpdateJobResponse> {
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

/** Le courtier confirme le tarif lu sur l'onglet actif (avec ses corrections) : offre écrite, job `captured` (E10-3). */
export async function confirmCapture(edits: CaptureEdits): Promise<CaptureResponse> {
  const tabId = await activeTabId();
  return tabId === undefined ? { ok: false, message: 'Aucun tarif à confirmer sur cet onglet.' } : submitCapture(tabId, edits);
}

/**
 * Tarif lu sur la page de résultat : enregistré aussitôt, sans attendre le side panel. Il arrive « à vérifier » dans
 * l'onglet Tarification de l'app, où le courtier le valide ou le corrige.
 */
function autoSubmitCapture(tabId: number, run: RunState): void {
  if (run.phase !== 'capture_review' || !run.capture?.offer) return;
  void submitCapture(tabId, {}).then(response => {
    if (!response.ok) {
      const current = runByTab.get(tabId);
      if (current) runByTab.set(tabId, { ...current, message: response.message });
      void broadcast();
      chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_SAVE_FAILED' } satisfies TabMessage).catch(() => undefined);
    }
  });
}

async function submitCapture(tabId: number, edits: Partial<CaptureEdits>): Promise<CaptureResponse> {
  const user = await signedInUser();
  const run = runByTab.get(tabId);
  if (!user || !run || run.phase !== 'capture_review' || !run.capture?.offer) {
    return { ok: false, message: 'Aucun tarif à confirmer sur cet onglet.' };
  }
  // Un seul envoi par tarif lu (l'état de la page peut être republié pendant l'écriture).
  runByTab.set(tabId, { ...run, phase: 'capturing' });
  const offer = sanitizeOffer({ ...run.capture.offer, ...edits });
  if (!hasPremium(offer)) {
    runByTab.set(tabId, run);
    return { ok: false, message: 'Indiquez au moins la prime annuelle ou la prime mensuelle.' };
  }
  try {
    await writeCapturedOffer(user, run.dossierId, run.insurerId, offer, savedCaptures.has(captureKey(tabId, run)));
    savedCaptures.add(captureKey(tabId, run));
  } catch (error) {
    // Le tarif reste affiché dans le side panel : le courtier peut le renvoyer de là.
    runByTab.set(tabId, run);
    await report(run.insurerId, pagesByTab.get(tabId)?.origin ?? '', 'write', 'offer_write_failed');
    return { ok: false, message: (await deniedCause(user, run.dossierId, run.insurerId, error)).message };
  }
  finishCapture(tabId, run, {
    phase: 'captured',
    capture: { ...run.capture, offer },
    message: 'Tarif envoyé dans l’application : vérifiez-le dans l’onglet Tarification du dossier.',
  });
  return { ok: true };
}

/** Le courtier refuse le tarif lu (ou signale qu'aucun tarif n'a pu être lu) : job `failed`, rapport d'échec. */
export async function rejectCapture(): Promise<CaptureResponse> {
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
