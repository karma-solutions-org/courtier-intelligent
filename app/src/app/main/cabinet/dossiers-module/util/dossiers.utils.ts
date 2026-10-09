import { CanonicalPath, Dossier, DOSSIER_TRANSITIONS, DossierStatus, QuestionnaireSection } from '@shared';

export interface DossierFilter {
  status: DossierStatus | '';
  productId: string;
  /** uid du courtier en charge ('' : tous). */
  assignedTo: string;
  /** « Mes dossiers » : uniquement ceux qui me sont assignés (prioritaire sur `assignedTo`). */
  mine: boolean;
}

export const EMPTY_FILTER: DossierFilter = { status: '', productId: '', assignedTo: '', mine: false };

/** Applique les filtres de la liste. `myUid` sert à « Mes dossiers ». */
export function filterDossiers(dossiers: Dossier[], filter: DossierFilter, myUid: string | null): Dossier[] {
  return dossiers.filter(
    dossier =>
      (!filter.status || dossier.status === filter.status) &&
      (!filter.productId || dossier.productId === filter.productId) &&
      (filter.mine ? dossier.assignedTo === myUid : !filter.assignedTo || dossier.assignedTo === filter.assignedTo),
  );
}

/**
 * Statuts que le courtier déclenche à la main. Les suivants (besoin validé, tarification…) sont poussés
 * par leurs propres étapes ; la machine à états du serveur reste la seule référence des transitions permises.
 */
const MANUAL_STATUSES: DossierStatus[] = ['brouillon', 'complet', 'sans_suite'];

export function manualTransitionsFrom(status: DossierStatus): DossierStatus[] {
  return DOSSIER_TRANSITIONS[status].filter(target => MANUAL_STATUSES.includes(target));
}

/** Libellé de chaque champ du questionnaire, pour la liste des champs manquants. */
export function labelsByPath(schema: QuestionnaireSection[]): Map<CanonicalPath, string> {
  return new Map(schema.flatMap(section => section.questions.map(q => [q.canonicalPath, q.label] as const)));
}

/** Index de la section qui contient le champ (pour y retourner depuis le récapitulatif). */
export function sectionIndexOf(schema: QuestionnaireSection[], path: CanonicalPath): number {
  return Math.max(
    0,
    schema.findIndex(section => section.questions.some(q => q.canonicalPath === path)),
  );
}

/** Même ordre que la machine à états : sert à la liste déroulante des filtres. */
export const STATUS_ORDER: DossierStatus[] = [
  'brouillon',
  'complet',
  'besoin_valide',
  'tarification',
  'comparaison',
  'decision',
  'proposition_envoyee',
  'souscrit',
  'refuse',
  'sans_suite',
];
