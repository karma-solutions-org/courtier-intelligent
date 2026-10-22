import { CatalogEntryPath, QuoteJobStatus, sanitizeCatalogEntryPath } from '@shared';
import type { JobContext } from '../shared/messages';

/** Un assureur du catalogue (`insurers/{id}`) : ce dont l'extension a besoin pour reconnaître son extranet. */
export interface InsurerInfo {
  id: string;
  name: string;
  extranetDomains: string[];
  /** Chemins d'accès communs au formulaire de devis, par produit (catalogue). */
  entryPaths?: Record<string, CatalogEntryPath>;
}

/** Chemins communs lus dans le catalogue : seuls les chemins valides sont gardés. */
export function catalogEntryPaths(input: unknown): Record<string, CatalogEntryPath> {
  if (!input || typeof input !== 'object') return {};
  const paths: Record<string, CatalogEntryPath> = {};
  for (const [productId, raw] of Object.entries(input as Record<string, unknown>)) {
    const path = sanitizeCatalogEntryPath(raw);
    if (path) paths[productId] = path;
  }
  return paths;
}

/** Un job tel que lu dans Firestore (chemin cabinets/{cabinetId}/dossiers/{dossierId}/quoteJobs/{insurerId}). */
export interface JobRecord {
  dossierId: string;
  insurerId: string;
  data: {
    status?: QuoteJobStatus;
    quoteData?: JobContext['quoteData'];
    missingFields?: JobContext['missingFields'];
    productPaths?: string[];
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

/** `localhost` ou `localhost:port` (extranet de démonstration). */
const LOCALHOST_DOMAIN = /^localhost(:\d{1,5})?$/;

/**
 * Domaine du catalogue normalisé (`*.x.fr` → `x.fr`), ou null s'il est inacceptable (vide, sans point).
 * En développement, `localhost:8090` est accepté : le port fait partie du domaine (deux démos sur deux ports).
 */
export function normalizeDomain(domain: string, { allowLocalhost = DEV_BUILD }: MatchOptions = {}): string | null {
  const wanted = domain.trim().toLowerCase().replace(/^\*?\./, '').replace(/\.$/, '');
  if (LOCALHOST_DOMAIN.test(wanted)) return allowLocalhost ? wanted : null;
  // Un domaine sans point (« com », « fr », un nom d'hôte interne) couvrirait trop de sites : refusé.
  if (!wanted.includes('.') || wanted.startsWith('.') || /[\s/:*]/.test(wanted)) return null;
  return wanted;
}

/**
 * Le domaine de la page est-il celui de l'extranet ? Le domaine exact ou l'un de ses sous-domaines (jamais un domaine voisin).
 * `hostname` peut porter le port (`url.host`) : pour localhost, hôte ET port doivent être ceux du catalogue
 * (`localhost` seul = port par défaut uniquement ; jamais l'app ou une autre démo sur un autre port).
 */
export function hostMatchesDomain(hostname: string, domain: string, options: MatchOptions = {}): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const wanted = normalizeDomain(domain, options);
  if (wanted === null) return false;
  if (LOCALHOST_DOMAIN.test(wanted)) return host === wanted;
  const bareHost = host.replace(/:\d+$/, '');
  return bareHost === wanted || bareHost.endsWith(`.${wanted}`);
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
    if (LOCALHOST_DOMAIN.test(wanted)) {
      // Les motifs Chrome ne filtrent pas le port de façon fiable : le port est vérifié par hostMatchesDomain.
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
    // Localhost : le port compte (host = hôte:port) ; ailleurs, le nom d'hôte seul.
    hostname = devLocalhost ? url.host : url.hostname;
  } catch {
    return [];
  }
  return insurers.filter(insurer => insurer.extranetDomains.some(domain => hostMatchesDomain(hostname, domain, { allowLocalhost })));
}

/** Job identifié (dossier, assureur) : celui épinglé à un onglet. */
export interface JobRef {
  dossierId: string;
  insurerId: string;
}

export interface PickOptions extends MatchOptions {
  /** Job déjà épinglé à cet onglet : repris tel quel au rechargement s'il est toujours à faire sur cet extranet. */
  pinned?: JobRef | null;
  /** Jobs épinglés à d'autres onglets : jamais deux onglets sur le même job. */
  exclude?: readonly JobRef[];
}

const sameJob = (a: JobRef, b: JobRef) => a.dossierId === b.dossierId && a.insurerId === b.insurerId;

/**
 * Le job à exécuter sur cette page. Si l'onglet a déjà un job épinglé (rechargement, étape suivante) et qu'il est
 * toujours à faire sur cet extranet, c'est lui : jamais le dossier d'un autre client parce qu'il est plus récent.
 * Sinon, le plus récent (la liste arrive du plus récent au plus ancien) qui est encore à faire, vise l'assureur de
 * cet extranet et n'est pas déjà suivi par un autre onglet. `null` si la page n'est pas un extranet connu ou s'il n'y a pas de job.
 */
export function pickJobForOrigin(jobs: JobRecord[], insurers: InsurerInfo[], origin: string, options: PickOptions = {}): JobContext | null {
  // Plusieurs assureurs peuvent partager un domaine (ex. deux extranets de démonstration sur localhost) :
  // la tâche est cherchée parmi tous les assureurs de cette adresse, pas seulement le premier.
  const candidates = insurersForOrigin(origin, insurers, options);
  if (!candidates.length) return null;
  const runnable = (j: JobRecord) =>
    candidates.some(c => c.id === j.insurerId) && j.data.status !== undefined && RUNNABLE_STATUSES.includes(j.data.status);
  const pinned = options.pinned;
  const job =
    (pinned ? jobs.find(j => sameJob(j, pinned) && runnable(j)) : undefined) ??
    jobs.find(j => runnable(j) && !(options.exclude ?? []).some(other => sameJob(j, other)));
  if (!job) return null;
  const insurer = candidates.find(c => c.id === job.insurerId)!;
  return {
    dossierId: job.dossierId,
    insurerId: job.insurerId,
    insurerName: insurer.name,
    status: job.data.status!,
    quoteData: job.data.quoteData ?? {},
    missingFields: job.data.missingFields ?? [],
    ...(job.data.productPaths?.length ? { productPaths: job.data.productPaths } : {}),
  };
}

/** Nombre de jobs « requested » en attente : affiché sur l'icône de l'extension. */
export function countRequested(jobs: JobRecord[]): number {
  return jobs.filter(job => job.data.status === 'requested').length;
}
