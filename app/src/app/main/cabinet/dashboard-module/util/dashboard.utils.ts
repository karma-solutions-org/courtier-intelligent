import { Dossier, DOSSIER_STATUSES, DossierStatus } from '@shared';

/** Statuts où le dossier attend une action du courtier en charge. */
export const TO_PROCESS_STATUSES: DossierStatus[] = [
  'brouillon',
  'complet',
  'besoin_valide',
  'tarification',
  'comparaison',
  'decision',
];

/** Une proposition envoyée depuis plus longtemps est à relancer. */
export const FOLLOW_UP_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

/** Issues finales prises en compte dans le taux de conversion. */
const CLOSED_STATUSES: DossierStatus[] = ['souscrit', 'refuse', 'sans_suite'];

/** Nombre de dossiers par statut (tous les statuts présents, même à zéro). */
export function countByStatus(dossiers: Dossier[]): Record<DossierStatus, number> {
  const counts = Object.fromEntries(DOSSIER_STATUSES.map(status => [status, 0])) as Record<DossierStatus, number>;
  for (const dossier of dossiers) {
    if (dossier.status in counts) counts[dossier.status]++;
  }
  return counts;
}

/** « Mes dossiers à traiter » : assignés à moi et en attente d'une action, les plus anciens d'abord. */
export function dossiersToProcess(dossiers: Dossier[], myUid: string | null): Dossier[] {
  if (!myUid) return [];
  return dossiers
    .filter(d => d.assignedTo === myUid && TO_PROCESS_STATUSES.includes(d.status))
    .sort((a, b) => millis(a.updatedAt ?? a.createdAt) - millis(b.updatedAt ?? b.createdAt));
}

/**
 * « Propositions à relancer » : envoyées depuis plus de 7 jours, sans réponse.
 * Sans date d'envoi connue (anciens dossiers), on ne peut pas juger : le dossier n'est pas listé.
 */
export function proposalsToFollowUp(dossiers: Dossier[], now: number): Dossier[] {
  return dossiers
    .filter(d => {
      if (d.status !== 'proposition_envoyee') return false;
      const sentAt = millis(d.proposal?.sentAt);
      return sentAt > 0 && now - sentAt > FOLLOW_UP_DELAY_MS;
    })
    .sort((a, b) => millis(a.proposal?.sentAt) - millis(b.proposal?.sentAt));
}

export interface ConversionRate {
  key: string;
  souscrit: number;
  closed: number;
  /** souscrit / (souscrit + refusé + sans suite), entre 0 et 1 ; null sans dossier clos. */
  rate: number | null;
}

/** Taux de conversion groupé par une clé (courtier en charge ou produit), du meilleur au moins bon. */
export function conversionRates(dossiers: Dossier[], keyOf: (dossier: Dossier) => string): ConversionRate[] {
  const groups = new Map<string, ConversionRate>();
  for (const dossier of dossiers) {
    if (!CLOSED_STATUSES.includes(dossier.status)) continue;
    const key = keyOf(dossier);
    const group = groups.get(key) ?? { key, souscrit: 0, closed: 0, rate: null };
    group.closed++;
    if (dossier.status === 'souscrit') group.souscrit++;
    group.rate = group.souscrit / group.closed;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || b.closed - a.closed);
}

/** Date Firestore en millisecondes (0 si absente ou mal formée). */
export function millis(value: { toMillis(): number } | null | undefined): number {
  return typeof value?.toMillis === 'function' ? value.toMillis() : 0;
}
