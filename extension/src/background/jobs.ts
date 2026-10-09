import { QUOTE_JOB_STATUS_LABELS, QuoteJobStatus } from '@shared';
import type { CurrentJob } from '../shared/messages';

/** Statuts d'un job « en cours » : ni terminé (tarif obtenu), ni en échec. */
const ACTIVE_STATUSES: QuoteJobStatus[] = ['requested', 'analyzing', 'needs_info', 'filling', 'awaiting_submit'];

/** Un job tel que lu dans Firestore (chemin cabinets/{t}/dossiers/{d}/quoteJobs/{insurerId}). */
export interface JobSnapshot {
  dossierId: string;
  insurerId: string;
  data: {
    status?: QuoteJobStatus;
    currentStep?: number | null;
    totalSteps?: number | null;
    error?: string | null;
    dossierReference?: string | null;
  };
}

/**
 * Le job à afficher : le plus récent encore en cours (la liste arrive triée du plus récent au plus ancien).
 * Sans job en cours, aucun : un tarif obtenu ou un échec ne reste pas affiché comme « en cours ».
 */
export function pickCurrentJob(jobs: JobSnapshot[], insurerNames: ReadonlyMap<string, string> = new Map()): CurrentJob | null {
  const job = jobs.find(j => j.data.status !== undefined && ACTIVE_STATUSES.includes(j.data.status));
  if (!job) return null;
  return {
    dossierId: job.dossierId,
    insurerId: job.insurerId,
    insurerName: insurerNames.get(job.insurerId) ?? null,
    dossierReference: job.data.dossierReference ?? null,
    status: job.data.status!,
    currentStep: job.data.currentStep ?? null,
    totalSteps: job.data.totalSteps ?? null,
    error: job.data.error ?? null,
  };
}

/** Libellé et avancement d'un job pour le side panel. */
export function describeJob(job: CurrentJob): { title: string; status: string; progress: string | null } {
  const reference = job.dossierReference ?? job.dossierId;
  const insurer = job.insurerName ?? job.insurerId;
  const hasProgress = job.currentStep !== null && job.totalSteps !== null && job.totalSteps > 0;
  return {
    title: `Dossier ${reference} · ${insurer}`,
    status: QUOTE_JOB_STATUS_LABELS[job.status],
    progress: hasProgress ? `Étape ${job.currentStep} sur ${job.totalSteps}` : null,
  };
}
