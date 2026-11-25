/** Niveau d'un extranet d'après son taux de réussite : fragile (< 50 %, au moins 3 tarifications terminées) ou fiable (≥ 80 %). */
export type ReliabilityLevel = 'weak' | 'strong' | null;

/** Ligne du tableau « Fiabilité des extranets », déjà formatée pour l'affichage. */
export interface ReliabilityRowModel {
  insurerId: string;
  name: string;
  logo: string | null;
  initial: string;
  launched: number;
  captured: number;
  /** « 86 % », ou null sans tarification terminée. */
  rate: string | null;
  level: ReliabilityLevel;
  /** « dont 2 saisies à la main », ou null. */
  manual: string | null;
  failed: number;
  needsInfo: number;
  inProgress: number;
  /** « 3,5 min » ou « — ». */
  median: string;
  /** « 1,2 » ou « — ». */
  attempts: string;
  missing: { label: string; count: number }[];
  issues: { label: string; count: number }[];
  issuesTotal: number;
  hasDetail: boolean;
}
