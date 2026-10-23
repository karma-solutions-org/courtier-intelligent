import type { DiscoveredFieldInput, ExtensionReportIssue, ExtensionReportStep } from '@shared';
import type { JobUpdate, RunState } from '../shared/messages';
import type { AskAi } from './ai-fallback';
import type { FormLayout } from './layout-ai';
import type { MemoryPort } from './memory';

/** Échec d'écriture de l'avancement, avec la cause exacte (`cancelled` : le job a été annulé). */
export class JobUpdateError extends Error {
  constructor(message: string, readonly cancelled = false) {
    super(message);
  }
}

export interface RunnerPorts {
  doc: Document;
  /** Écrit l'avancement du job (statut, étape, champs manquants) : le service worker le transmet à Firestore. */
  report(update: JobUpdate): Promise<void>;
  /** Publie l'avancement détaillé pour le side panel. */
  publish(state: RunState): void;
  askAi: AskAi;
  /** Signale un échec du remplissage ou de la capture du tarif (E10-4) : un code, jamais de donnée client. */
  reportIssue?(step: ExtensionReportStep, issue: ExtensionReportIssue): Promise<void>;
  /** Mémoire partagée des formulaires (E8) : sans elle, tout se fait par synonymes puis IA. */
  memory?: MemoryPort;
  /**
   * Champs sans équivalent d'un formulaire validé : le serveur les ajoute au questionnaire (ou les rattache à une
   * question existante) et renvoie, par champ, le chemin de cette question.
   */
  reportDiscovered?(fingerprint: string, fields: DiscoveredFieldInput[], requiredPaths?: string[]): Promise<Record<string, string> | void>;
  /** Lecture de la mise en page déjà faite par l'IA pour un formulaire (cache local du navigateur). */
  layoutCache?: { load(fingerprint: string): Promise<FormLayout | null>; save(fingerprint: string, layout: FormLayout): Promise<void> };
  /** Origine de l'extranet, clé de la mémoire (par défaut : celle de la page). */
  origin?: string;
  /** Une étape remplie sans manque ni échec : l'extension clique elle-même sur « Suivant » (jamais sur le bouton final). */
  autoAdvance?: boolean;
  /**
   * Formulaire de devis reconnu (au moins FORM_MIN_MAPPED champs reliés au dossier), une fois par remplissage : fin de
   * l'apprentissage automatique du chemin d'accès.
   */
  formReached?(): void;
  quietMs?: number;
  settleTimeoutMs?: number;
}
