import type { CanonicalData, CanonicalPath, ExtensionReportIssue, ExtensionReportStep, FormMemoryField, MissingField, QuoteJobStatus } from '@shared';

/** Utilisateur connecté dans l'extension (affiché dans le side panel). */
export interface ExtensionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  cabinetId: string;
  role: 'admin' | 'courtier';
}

/** État de la connexion : l'extension a sa propre connexion Firebase, liée à la session de l'app sur l'appareil. */
export type AuthState =
  | { status: 'signed_out'; /** Pourquoi la session s'est fermée (null : déconnexion normale ou jamais connecté). */ notice: string | null }
  | { status: 'signed_in'; user: ExtensionUser };

/** Job de tarification en cours pour le courtier connecté. */
export interface CurrentJob {
  dossierId: string;
  insurerId: string;
  insurerName: string | null;
  dossierReference: string | null;
  status: QuoteJobStatus;
  currentStep: number | null;
  totalSteps: number | null;
  error: string | null;
}

/** Job de tarification à exécuter sur une page : ce que le content script reçoit pour remplir l'extranet. */
export interface JobContext {
  dossierId: string;
  insurerId: string;
  insurerName: string | null;
  status: QuoteJobStatus;
  /** Données à remplir, par chemin canonique (`null` = non renseigné, niveaux de connaissance respectés). */
  quoteData: CanonicalData;
  missingFields: MissingField[];
}

/** Modification du job écrite par l'extension (les règles Firestore n'autorisent que ces champs). */
export interface JobUpdate {
  status: QuoteJobStatus;
  currentStep?: number | null;
  totalSteps?: number | null;
  missingFields?: MissingField[];
  error?: string | null;
}

export type RunFieldStatus = 'filled' | 'failed' | 'missing' | 'unmapped' | 'uncertain';

/** Un champ de l'extranet tel que le side panel l'affiche. */
export interface RunField {
  key: string;
  label: string;
  required: boolean;
  section: string | null;
  canonicalPath: CanonicalPath | null;
  confidence: number;
  source: 'heuristic' | 'ai' | 'manual' | 'memory';
  status: RunFieldStatus;
  reason: string | null;
}

/** Une garantie lue sur la page de résultat (le code du référentiel est posé côté serveur). */
export interface CapturedGuarantee {
  label: string;
  included: boolean;
  limit: number | null;
  deductible: number | null;
}

/** L'offre lue sur la page de résultat de l'extranet (E10) : jamais inventée, `null` quand l'information manque. */
export interface CapturedOffer {
  quoteNumber: string | null;
  premiumAnnual: number | null;
  premiumMonthly: number | null;
  /** `general` : franchise générale. */
  deductibles: Record<string, number>;
  guarantees: CapturedGuarantee[];
  exclusions: string[];
}

/** Capture en cours sur l'onglet : offre à confirmer par le courtier, ou ce qui a empêché de la lire. */
export interface CaptureState {
  offer: CapturedOffer | null;
  /** D'où vient l'offre : DOM seul, ou complété par l'IA. */
  source: 'dom' | 'ai' | null;
}

/** Corrections du courtier avant de confirmer la capture. */
export interface CaptureEdits {
  quoteNumber: string | null;
  premiumAnnual: number | null;
  premiumMonthly: number | null;
}

/** Avancement du remplissage sur l'onglet actif (envoyé par le content script). */
export interface RunState {
  /**
   * Remplissage : analyzing, filling, waiting_user, awaiting_submit, error.
   * Capture du tarif : capturing (lecture), capture_review (à confirmer), captured, capture_failed.
   */
  phase: 'analyzing' | 'filling' | 'waiting_user' | 'awaiting_submit' | 'error' | 'capturing' | 'capture_review' | 'captured' | 'capture_failed';
  insurerId: string;
  dossierId: string;
  step: { current: number | null; total: number | null };
  fields: RunField[];
  /** Champs obligatoires que le dossier ne fournit pas : demandés au courtier dans l'app. */
  missing: MissingField[];
  aiUsed: boolean;
  /** Mémoire partagée : `used` (formulaire connu, mapping sans IA), `learned` (appris après un remplissage validé), `invalidated` (elle a échoué : réapprentissage). */
  memory: 'used' | 'learned' | 'invalidated' | null;
  /** Chemins parmi lesquels la correction manuelle peut choisir (ceux du dossier). */
  assignablePaths: CanonicalPath[];
  message: string | null;
  /** Page de résultat : l'offre lue (absent pendant le remplissage). */
  capture?: CaptureState | null;
}

/** Tout ce que le side panel affiche. */
export interface PanelState {
  auth: AuthState;
  job: CurrentJob | null;
  /** Remplissage en cours sur l'onglet actif (null : aucune page d'assureur analysée). */
  run: RunState | null;
}

/** Messages internes à l'extension (content script ↔ service worker ↔ side panel). */
export type ExtensionMessage =
  | { type: 'PAGE_DETECTED'; origin: string; title: string; fieldCount: number }
  | { type: 'GET_ACTIVE_PAGE' }
  | { type: 'GET_STATE' }
  | { type: 'SIGN_IN'; email: string; password: string }
  | { type: 'SIGN_OUT' }
  // Content script → service worker
  | { type: 'GET_JOB_FOR_ORIGIN'; origin: string }
  | { type: 'UPDATE_JOB'; dossierId: string; insurerId: string; update: JobUpdate }
  | { type: 'RUN_STATE'; state: RunState | null }
  | { type: 'ASK_AI'; system: string; messages: { role: 'user'; content: string }[]; maxTokens: number }
  | { type: 'REPORT_ISSUE'; insurerId: string; origin: string; step: ExtensionReportStep; issue: ExtensionReportIssue }
  // Side panel → service worker : capture du tarif de l'onglet actif
  | { type: 'CONFIRM_CAPTURE'; edits: CaptureEdits }
  | { type: 'REJECT_CAPTURE' }
  | { type: 'CAPTURE_NOW' }
  // Side panel → service worker → content script de l'onglet actif
  | { type: 'MANUAL_MAP'; fieldKey: string; canonicalPath: CanonicalPath | null }
  | { type: 'REFILL' }
  // Content script → service worker : mémoire partagée des formulaires
  | { type: 'MEMORY_LOAD'; origin: string; fingerprint: string }
  | { type: 'MEMORY_SAVE'; origin: string; fingerprint: string; fields: FormMemoryField[] }
  | { type: 'MEMORY_TOUCH'; key: string }
  | { type: 'MEMORY_INVALIDATE'; key: string };

/** Réponse à ASK_AI. */
export type AskAiResponse = { ok: true; text: string } | { ok: false; message: string };

/** Messages du service worker vers le content script d'un onglet. */
export type TabMessage =
  | { type: 'MANUAL_MAP'; fieldKey: string; canonicalPath: CanonicalPath | null }
  | { type: 'REFILL' }
  | { type: 'JOB_CHANGED'; job: JobContext }
  /** Lire le tarif de la page affichée (détection manquée, ou nouvel essai). */
  | { type: 'CAPTURE_NOW' }
  /** La capture est terminée (offre enregistrée ou échec signalé) : la page n'a plus rien à faire. */
  | { type: 'CAPTURE_DONE' };

/** Réponse à CONFIRM_CAPTURE et REJECT_CAPTURE. */
export type CaptureResponse = { ok: true } | { ok: false; message: string };

/** Réponse à SIGN_IN. */
export type SignInResponse = { ok: true; state: PanelState } | { ok: false; message: string };

/** Messages envoyés par le service worker au side panel, sur le port « sidepanel ». */
export type PortMessage = { type: 'STATE'; state: PanelState };

/** Port ouvert par le content script pendant un remplissage : il garde le service worker éveillé et reçoit les changements du job. */
export const RUNNER_PORT = 'runner';

/** Nom du port ouvert par le side panel : tant qu'il est ouvert, le service worker suit la session et le job en direct. */
export const SIDE_PANEL_PORT = 'sidepanel';

export interface ActivePage {
  origin: string;
  title: string;
  fieldCount: number;
}

/** Messages reçus depuis l'app Angular (chrome.runtime.onMessageExternal). */
export type ExternalMessage = { type: 'PING' };
