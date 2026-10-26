import { sanitizeNavAction } from '@shared';
import { EntryResponse, ExtensionMessage, JobContext, TabMessage } from '../shared/messages';
import {
  entryClicked,
  entryFailed,
  entryFormReached,
  entryRecorded,
  initialEntry,
  catalogProfile,
  entryRecovered,
  forgetLearnedProfile,
  instructionFor,
  loadProfile,
  profileFrom,
  readTabEntry,
  removeTabEntry,
  saveProfile,
  startRecording,
  writeTabEntry,
} from './entry-service';
import { jobMatches } from './sender-guard';
import { activeTabId, broadcast, jobByTab } from './worker-state';

// ── Chemin d'accès au formulaire (profil d'extranet, brique 1) ──────────────
/**
 * Un onglet commence un job (page principale) : il rejoue le chemin d'accès enregistré pour cet extranet et ce produit.
 * Un onglet qui reprend le même job (page suivante du chemin, rechargement) garde son état.
 */
export async function ensureTabEntry(tabId: number, job: JobContext, origin: string): Promise<void> {
  const current = await readTabEntry(tabId);
  if (current && current.dossierId === job.dossierId && current.insurerId === job.insurerId) return;
  if (!job.productId) {
    await removeTabEntry(tabId);
    return;
  }
  const productId = job.productId;
  await writeTabEntry(tabId, initialEntry({ ...job, productId }, origin, await loadProfile(job.insurerId, productId)));
}

/** Transmet une commande d'apprentissage à tous les cadres de l'onglet (extranet en cadres : Oyat). */
function sendToFrames(tabId: number, message: TabMessage): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

/** Commandes d'apprentissage du side panel, sur l'onglet actif. */
export async function entryCommand(type: 'ENTRY_RECORD_START' | 'ENTRY_RECORD_SAVE' | 'ENTRY_RECORD_CANCEL'): Promise<EntryResponse> {
  const tabId = await activeTabId();
  const entry = tabId !== undefined ? await readTabEntry(tabId) : null;
  if (tabId === undefined || !entry) {
    return { ok: false, message: 'Lancez d’abord une tarification depuis l’application, puis ouvrez l’extranet dans cet onglet.' };
  }
  if (type === 'ENTRY_RECORD_START') {
    await writeTabEntry(tabId, startRecording(entry));
    sendToFrames(tabId, { type: 'ENTRY_RECORD_START' });
  } else if (entry.mode !== 'recording') {
    return { ok: false, message: 'Aucun apprentissage en cours sur cet onglet.' };
  } else if (type === 'ENTRY_RECORD_SAVE') {
    const profile = profileFrom(entry, await loadProfile(entry.insurerId, entry.productId));
    if (!profile) return { ok: false, message: 'Aucun clic enregistré : cliquez jusqu’au formulaire de devis avant d’enregistrer.' };
    await saveProfile(profile);
    await writeTabEntry(tabId, {
      ...entry,
      mode: 'done',
      index: entry.actions.length,
      message: `Chemin enregistré (${profile.entry.length} clic${profile.entry.length > 1 ? 's' : ''}) : il sera rejoué à la prochaine tarification sur cet extranet.`,
    });
    sendToFrames(tabId, { type: 'ENTRY_RECORD_STOP' });
  } else {
    await writeTabEntry(tabId, { ...entry, mode: 'done', actions: [], index: 0, message: null });
    sendToFrames(tabId, { type: 'ENTRY_RECORD_STOP' });
  }
  void broadcast();
  return { ok: true };
}

/** Messages de la page sur le chemin d'accès : seulement la page principale, pour le job suivi par l'onglet. */
export async function entryFromTab(
  tabId: number,
  message: Extract<ExtensionMessage, { type: `ENTRY_${'GET' | 'RECORDED' | 'CLICKED' | 'FAILED' | 'FORM_REACHED'}` }>,
): Promise<unknown> {
  const entry = await readTabEntry(tabId);
  if (!entry || !jobMatches(jobByTab.get(tabId), entry.dossierId, entry.insurerId)) return message.type === 'ENTRY_GET' ? instructionFor(null) : false;
  if (message.type === 'ENTRY_GET') return instructionFor(entry);
  let next = entry;
  if (message.type === 'ENTRY_FORM_REACHED') {
    const reached = entryFormReached(entry, await loadProfile(entry.insurerId, entry.productId));
    if (reached.profile) await saveProfile(reached.profile);
    next = reached.entry;
  } else if (message.type === 'ENTRY_RECORDED') {
    const action = sanitizeNavAction(message.action);
    if (action) next = entryRecorded(entry, action);
  } else if (message.type === 'ENTRY_CLICKED') {
    next = entryClicked(entry, Number(message.index));
  } else if (Number(message.index) === 0 && entry.mode === 'replaying' && entry.index === 0) {
    // Premier clic impossible : chemin du catalogue, sinon réapprentissage (et le chemin appris à tort est oublié).
    await forgetLearnedProfile(entry.insurerId, entry.productId);
    next = entryRecovered(entry, await catalogProfile(entry.insurerId, entry.productId));
  } else {
    next = entryFailed(entry, Number(message.index), message.reason === 'skipped' ? 'skipped' : 'not_found');
  }
  if (next !== entry) {
    await writeTabEntry(tabId, next);
    void broadcast();
  }
  return true;
}
