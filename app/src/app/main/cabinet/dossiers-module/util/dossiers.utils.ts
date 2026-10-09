import { CanonicalPath, Dossier, DOSSIER_TRANSITIONS, DossierStatus, QuestionnaireSection } from '@shared';

export interface DossierFilter {
  status: DossierStatus | '';
  productId: string;
  /** uid du courtier en charge ('' : tous). */
  assignedTo: string;
  /** « Mes dossiers » : uniquement ceux qui me sont assignés (prioritaire sur `assignedTo`). */
  mine: boolean;
}

/** Aucun filtre : tous les dossiers du cabinet (ex. accès depuis un compteur du tableau de bord). */
export const EMPTY_FILTER: DossierFilter = { status: '', productId: '', assignedTo: '', mine: false };

/** Filtre initial de la liste : « Mes dossiers » activé. « Réinitialiser » y revient. */
export const DEFAULT_FILTER: DossierFilter = { ...EMPTY_FILTER, mine: true };

/** Le filtre est-il celui par défaut (le bouton « Réinitialiser » est alors inutile) ? */
export function isDefaultFilter(filter: DossierFilter): boolean {
  return (Object.keys(DEFAULT_FILTER) as (keyof DossierFilter)[]).every(key => filter[key] === DEFAULT_FILTER[key]);
}

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
  // Une fois la proposition envoyée, la réponse de l'assuré s'enregistre dans l'onglet Proposition.
  if (status === 'proposition_envoyee') return [];
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
