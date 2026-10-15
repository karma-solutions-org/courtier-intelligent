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

/** Remplacé par esbuild : `npm run build:emulators` ou `npm run build:demo`. Absent (tests) : build de production. */
declare const __ALLOW_LOCALHOST__: boolean;

/** `http://localhost` (extranet de démonstration) n'est accepté que dans un build de développement (emulators ou démo). */
export const DEV_BUILD: boolean = typeof __ALLOW_LOCALHOST__ !== 'undefined' && __ALLOW_LOCALHOST__;

export interface MatchOptions {
  /** Accepte `localhost` (http) : réservé aux builds de développement. */
  allowLocalhost?: boolean;
}

/** Domaine du catalogue normalisé (`*.x.fr` → `x.fr`), ou null s'il est inacceptable (vide, sans point). */
export function normalizeDomain(domain: string, { allowLocalhost = DEV_BUILD }: MatchOptions = {}): string | null {
  const wanted = domain.trim().toLowerCase().replace(/^\*?\./, '').replace(/\.$/, '');
  if (wanted === 'localhost') return allowLocalhost ? wanted : null;
  // Un domaine sans point (« com », « fr », un nom d'hôte interne) couvrirait trop de sites : refusé.
  if (!wanted.includes('.') || wanted.startsWith('.') || /[\s/:*]/.test(wanted)) return null;
  return wanted;
}

/** Le domaine de la page est-il celui de l'extranet ? Le domaine exact ou l'un de ses sous-domaines (jamais un domaine voisin). */
export function hostMatchesDomain(hostname: string, domain: string, options: MatchOptions = {}): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const wanted = normalizeDomain(domain, options);
  return wanted !== null && (host === wanted || host.endsWith(`.${wanted}`));
}

/**
 * Motifs d'URL (match patterns Chrome) des extranets du catalogue : ceux où le content script est injecté et pour
 * lesquels l'accès est demandé au courtier. https uniquement ; `http://localhost/*` en développement seulement.
 */
export function extranetPatterns(domains: string[], options: MatchOptions = {}): string[] {
  const patterns = new Set<string>();
  for (const domain of domains) {
    const wanted = normalizeDomain(domain, options);
    if (!wanted) continue;
    if (wanted === 'localhost') {
      patterns.add('http://localhost/*');
      continue;
    }
    patterns.add(`https://${wanted}/*`);
    patterns.add(`https://*.${wanted}/*`);
  }
  return [...patterns];
}

/** L'assureur dont l'extranet est à cette adresse, s'il y en a un (le premier, si plusieurs partagent le domaine). */
export function insurerForOrigin(origin: string, insurers: InsurerInfo[], options: MatchOptions = {}): InsurerInfo | null {
  return insurersForOrigin(origin, insurers, options)[0] ?? null;
}

/**
 * Adresses de l'application Courtier Intelligent (mêmes que `externally_connectable` du manifest) : jamais un extranet.
 * Sinon, avec un extranet de démo sur « localhost », l'app (localhost:4200) était prise pour un extranet et ses propres
 * formulaires (paramètres, questionnaire…) étaient remplis et signalés comme de nouveaux champs.
 */
export const APP_ORIGINS: readonly string[] = [
  'http://localhost:4200',
  'https://courtier-intelligent-test.web.app',
  'https://courtier-intelligent-test.firebaseapp.com',
];

/** Tous les assureurs dont l'extranet est à cette adresse. */
export function insurersForOrigin(origin: string, insurers: InsurerInfo[], options: MatchOptions = {}): InsurerInfo[] {
  const allowLocalhost = options.allowLocalhost ?? DEV_BUILD;
  let hostname: string;
  try {
    const url = new URL(origin);
    if (APP_ORIGINS.includes(url.origin)) return [];
    // L'extension ne remplit jamais une page non sécurisée (sauf localhost dans un build de développement).
    const devLocalhost = allowLocalhost && url.protocol === 'http:' && url.hostname === 'localhost';
    if (url.protocol !== 'https:' && !devLocalhost) return [];
    hostname = url.hostname;
  } catch {
    return [];
  }
  return insurers.filter(insurer => insurer.extranetDomains.some(domain => hostMatchesDomain(hostname, domain, { allowLocalhost })));
}

/**
 * Le job à exécuter sur cette page : le plus récent (la liste arrive du plus récent au plus ancien) qui est
 * encore à faire ET qui vise l'assureur de cet extranet. `null` si la page n'est pas un extranet connu ou s'il n'y a pas de job.
 */
export function pickJobForOrigin(jobs: JobRecord[], insurers: InsurerInfo[], origin: string, options: MatchOptions = {}): JobContext | null {
  // Plusieurs assureurs peuvent partager un domaine (ex. deux extranets de démonstration sur localhost) :
  // la tâche est cherchée parmi tous les assureurs de cette adresse, pas seulement le premier.
  const candidates = insurersForOrigin(origin, insurers, options);
  if (!candidates.length) return null;
  const job = jobs.find(
    j => candidates.some(c => c.id === j.insurerId) && j.data.status !== undefined && RUNNABLE_STATUSES.includes(j.data.status),
  );
  if (!job) return null;
  const insurer = candidates.find(c => c.id === job.insurerId)!;
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
