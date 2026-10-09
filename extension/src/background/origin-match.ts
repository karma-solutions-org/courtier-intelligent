import { QuoteJobStatus } from '@shared';
import type { JobContext } from '../shared/messages';

/** Un assureur du catalogue (`insurers/{id}`) : ce dont l'extension a besoin pour reconnaître son extranet. */
export interface InsurerInfo {
  id: string;
  name: string;
  extranetDomains: string[];
}

/** Un job tel que lu dans Firestore (chemin cabinets/{cabinetId}/dossiers/{dossierId}/quoteJobs/{insurerId}). */
export interface JobRecord {
  dossierId: string;
  insurerId: string;
  data: {
    status?: QuoteJobStatus;
    quoteData?: JobContext['quoteData'];
    missingFields?: JobContext['missingFields'];
  };
}

/**
 * Jobs que l'extension peut exécuter ou reprendre sur une page (rechargée en cours de route comprise). `awaiting_submit` :
 * le courtier vient de soumettre le formulaire, la page qui s'ouvre est celle du résultat dont on lit le tarif (E10).
 */
export const RUNNABLE_STATUSES: QuoteJobStatus[] = ['requested', 'analyzing', 'needs_info', 'filling', 'awaiting_submit'];

/** Le domaine de la page est-il celui de l'extranet ? Le domaine exact ou l'un de ses sous-domaines (jamais un domaine voisin). */
export function hostMatchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const wanted = domain.toLowerCase().replace(/^\*?\./, '');
  return wanted !== '' && (host === wanted || host.endsWith(`.${wanted}`));
}

/** L'assureur dont l'extranet est à cette adresse, s'il y en a un. */
export function insurerForOrigin(origin: string, insurers: InsurerInfo[]): InsurerInfo | null {
  let hostname: string;
  try {
    const url = new URL(origin);
    // L'extension ne remplit jamais une page non sécurisée.
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    hostname = url.hostname;
  } catch {
    return null;
  }
  return insurers.find(insurer => insurer.extranetDomains.some(domain => hostMatchesDomain(hostname, domain))) ?? null;
}

/**
 * Le job à exécuter sur cette page : le plus récent (la liste arrive du plus récent au plus ancien) qui est
 * encore à faire ET qui vise l'assureur de cet extranet. `null` si la page n'est pas un extranet connu ou s'il n'y a pas de job.
 */
export function pickJobForOrigin(jobs: JobRecord[], insurers: InsurerInfo[], origin: string): JobContext | null {
  const insurer = insurerForOrigin(origin, insurers);
  if (!insurer) return null;
  const job = jobs.find(j => j.insurerId === insurer.id && j.data.status !== undefined && RUNNABLE_STATUSES.includes(j.data.status));
  if (!job) return null;
  return {
    dossierId: job.dossierId,
    insurerId: job.insurerId,
    insurerName: insurer.name,
    status: job.data.status!,
    quoteData: job.data.quoteData ?? {},
    missingFields: job.data.missingFields ?? [],
  };
}

/** Nombre de jobs « requested » en attente : affiché sur l'icône de l'extension. */
export function countRequested(jobs: JobRecord[]): number {
  return jobs.filter(job => job.data.status === 'requested').length;
}
