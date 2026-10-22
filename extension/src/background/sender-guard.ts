import type { ExtensionMessage } from '../shared/messages';

/**
 * Contrôle de l'expéditeur des messages internes. Toute page où le content script tourne (donc un site tiers) peut
 * envoyer n'importe quel message au service worker : chaque commande n'est acceptée que de l'expéditeur prévu.
 */

/** Commandes réservées au side panel (page de l'extension, hors onglet). */
export const PANEL_COMMANDS: ReadonlySet<string> = new Set<ExtensionMessage['type']>([
  'GET_STATE',
  'GET_ACTIVE_PAGE',
  'GET_ACCESS_REQUEST',
  'ACCESS_GRANTED',
  'SIGN_IN',
  'SIGN_OUT',
  'CONFIRM_CAPTURE',
  'REJECT_CAPTURE',
  'MANUAL_MAP',
  'REFILL',
  'CAPTURE_NOW',
  'ENTRY_RECORD_START',
  'ENTRY_RECORD_SAVE',
  'ENTRY_RECORD_CANCEL',
]);

/** Commandes réservées au content script d'un onglet (cadre principal). */
export const TAB_COMMANDS: ReadonlySet<string> = new Set<ExtensionMessage['type']>([
  'PAGE_DETECTED',
  'GET_JOB_FOR_ORIGIN',
  'RUN_STATE',
  'UPDATE_JOB',
  'ASK_AI',
  'REPORT_ISSUE',
  'MEMORY_LOAD',
  'MEMORY_SAVE',
  'MEMORY_TOUCH',
  'MEMORY_INVALIDATE',
  'FIELDS_DISCOVERED',
  'ENTRY_GET',
  'ENTRY_RECORDED',
  'ENTRY_CLICKED',
  'ENTRY_FAILED',
  'ENTRY_FORM_REACHED',
]);

/** Commandes d'onglet qui exigent en plus un remplissage en cours sur cet onglet (job suivi). */
export const JOB_COMMANDS: ReadonlySet<string> = new Set<ExtensionMessage['type']>([
  'UPDATE_JOB',
  'ASK_AI',
  'REPORT_ISSUE',
  'MEMORY_LOAD',
  'MEMORY_SAVE',
  'MEMORY_TOUCH',
  'MEMORY_INVALIDATE',
  'FIELDS_DISCOVERED',
  'ENTRY_GET',
  'ENTRY_RECORDED',
  'ENTRY_CLICKED',
  'ENTRY_FAILED',
  'ENTRY_FORM_REACHED',
]);

type Sender = Pick<chrome.runtime.MessageSender, 'tab' | 'url' | 'frameId' | 'id'>;

/** Le message vient-il du side panel de cette extension ? `panelPrefix` = chrome.runtime.getURL('sidepanel/'). */
export function isPanelSender(sender: Sender, panelPrefix: string, extensionId: string): boolean {
  return !sender.tab && sender.id === extensionId && !!sender.url?.startsWith(panelPrefix);
}

/**
 * Origine du cadre d'un onglet qui envoie le message, ou null. Cadre principal ou iframe : beaucoup d'extranets placent
 * leur formulaire dans une iframe. L'origine est celle du cadre lui-même (jamais celle de la page qui l'inclut), et le
 * content script n'est injecté que dans les cadres des extranets autorisés.
 */
export function tabSenderOrigin(sender: Sender, extensionId: string): { tabId: number; origin: string } | null {
  if (sender.tab?.id === undefined || sender.id !== extensionId || !sender.url) return null;
  try {
    const origin = new URL(sender.url).origin;
    return origin && origin !== 'null' ? { tabId: sender.tab.id, origin } : null;
  } catch {
    return null;
  }
}

/** Accès accordé à un message : du side panel, ou d'un onglet (avec son origine réelle). null : refusé. */
export type SenderAccess = { kind: 'panel' } | { kind: 'tab'; tabId: number; origin: string };

export function checkSender(type: string, sender: Sender, panelPrefix: string, extensionId: string): SenderAccess | null {
  if (PANEL_COMMANDS.has(type)) return isPanelSender(sender, panelPrefix, extensionId) ? { kind: 'panel' } : null;
  if (TAB_COMMANDS.has(type)) {
    const tab = tabSenderOrigin(sender, extensionId);
    return tab ? { kind: 'tab', ...tab } : null;
  }
  return null;
}

/** Le job suivi pour un onglet correspond-il au dossier et à l'assureur visés par le message ? */
export function jobMatches(job: { dossierId: string; insurerId: string } | undefined, dossierId: string, insurerId: string): boolean {
  return !!job && job.dossierId === dossierId && job.insurerId === insurerId;
}

/**
 * Origines autorisées pour les messages externes, d'après `externally_connectable.matches` du manifest
 * (`https://app.example/*` → `https://app.example`). Les motifs à joker (`*.`) sont ignorés : jamais acceptés.
 */
export function externalOriginsFromMatches(matches: string[] | undefined): Set<string> {
  const origins = new Set<string>();
  for (const pattern of matches ?? []) {
    const match = /^(https?):\/\/([^/*]+)\/.*$/.exec(pattern);
    if (!match) continue;
    try {
      origins.add(new URL(`${match[1]}://${match[2]}`).origin);
    } catch {
      // Motif invalide : ignoré.
    }
  }
  return origins;
}

/** Plafond de tokens d'une réponse d'IA, quel que soit ce que demande la page. */
export const MAX_AI_TOKENS = 2000;
/** Plafond du texte envoyé à l'IA (somme des messages). */
export const MAX_AI_INPUT_CHARS = 30_000;

/**
 * Requête d'IA reconstruite par le service worker : le prompt système vient de `prompts` d'après `purpose` (jamais
 * de la page, un éventuel `system` du message est ignoré), maxTokens est plafonné, le texte est borné. null : refusée.
 */
export function sanitizeAiRequest(
  message: { purpose?: unknown; messages?: unknown; maxTokens?: unknown },
  prompts: Readonly<Record<string, string>>,
): { purpose: string; system: string; messages: { role: 'user'; content: string }[]; maxTokens: number } | null {
  const purpose = typeof message.purpose === 'string' ? message.purpose : '';
  if (!Object.prototype.hasOwnProperty.call(prompts, purpose) || !Array.isArray(message.messages)) return null;
  let budget = MAX_AI_INPUT_CHARS;
  const messages: { role: 'user'; content: string }[] = [];
  for (const entry of message.messages.slice(0, 4)) {
    const content = typeof entry?.content === 'string' ? entry.content.slice(0, budget) : '';
    if (!content) continue;
    budget -= content.length;
    messages.push({ role: 'user', content });
  }
  if (messages.length === 0) return null;
  const requested = Number(message.maxTokens);
  const maxTokens = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), MAX_AI_TOKENS) : MAX_AI_TOKENS;
  return { purpose, system: prompts[purpose], messages, maxTokens };
}

/**
 * Clés de mémoire connues par onglet : une clé (hachage origine|empreinte, non réversible) n'est utilisable par un
 * onglet que si le service worker l'a lui-même calculée pour l'origine réelle de cet onglet (MEMORY_LOAD/MEMORY_SAVE).
 */
export class MemoryKeyRegistry {
  private readonly byTab = new Map<number, Map<string, string>>();

  remember(tabId: number, origin: string, key: string): void {
    const keys = this.byTab.get(tabId) ?? new Map<string, string>();
    keys.set(key, origin);
    this.byTab.set(tabId, keys);
  }

  /** La clé appartient-elle à l'origine actuelle de l'onglet ? */
  allows(tabId: number, origin: string, key: unknown): boolean {
    return typeof key === 'string' && this.byTab.get(tabId)?.get(key) === origin;
  }

  forget(tabId: number): void {
    this.byTab.delete(tabId);
  }
}
