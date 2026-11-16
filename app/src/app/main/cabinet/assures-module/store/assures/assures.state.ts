import { Assure, AssureDocument, Dossier } from '@shared';
import { RequestStatus } from '../../../../../core/store-features/with-request-status';
import { DuplicateMatch } from '../../util/assures.utils';

/** Taille d'une tranche du défilement infini. */
export const PAGE_SIZE = 20;

/** Filtres de la liste : type de client et ordre d'affichage. */
export interface AssureFilters {
  type: Assure['type'] | 'all';
  sort: 'name' | 'recent';
}

export const DEFAULT_ASSURE_FILTERS: AssureFilters = { type: 'all', sort: 'name' };

export interface AssuresState {
  assures: Assure[];
  /** Vrai dès la première réponse de Firestore (distingue « chargement » de « aucun assuré »). */
  loaded: boolean;
  query: string;
  filters: AssureFilters;
  /** Nombre d'assurés demandés à Firestore : grandit d'une tranche à chaque fin de défilement. */
  limit: number;
  /** Firestore a peut-être d'autres assurés au-delà de la tranche chargée. */
  hasMore: boolean;
  /** Une tranche supplémentaire est demandée et pas encore arrivée. */
  loadingMore: boolean;
  /**
   * Résultats de la recherche Elasticsearch (tout le portefeuille) ; null quand il n'y a pas de recherche ou que
   * le service est indisponible : la recherche se fait alors sur la tranche chargée.
   */
  searchResults: Assure[] | null;
  /** Recherche Elasticsearch en cours. */
  searching: boolean;
  /** Fiche ouverte (lue à part : elle peut être hors de la tranche chargée) et ses dossiers. */
  selectedId: string | null;
  selected: Assure | null;
  dossiers: Dossier[];
  /** Identifiant de l'assuré qui vient d'être créé : la page de création navigue vers sa fiche. */
  createdId: string | null;
  /** Vrai après la suppression du client ouvert : la fiche revient à la liste. */
  deleted: boolean;
  successMessage: string | null;
  /** Doublons possibles de la saisie en cours (création ou modification). */
  duplicates: DuplicateMatch[];
  /** Pièces rangées avec le client ouvert (CIN, Kbis importés à sa création). */
  documents: AssureDocument[];
  /** Pièces lues à la création, rangées avec le nouveau client : toutes (`ok`) ou certaines en échec (`partial`). */
  piecesAttachResult: 'ok' | 'partial' | null;
}

/** État complet vu par les features (le statut de requête vient de `withRequestStatus`). */
export type AssuresStoreState = AssuresState & { requestStatus: RequestStatus };

export const initialAssuresState: AssuresState = {
  assures: [],
  loaded: false,
  query: '',
  filters: DEFAULT_ASSURE_FILTERS,
  limit: PAGE_SIZE,
  hasMore: false,
  loadingMore: false,
  searchResults: null,
  searching: false,
  selectedId: null,
  selected: null,
  dossiers: [],
  createdId: null,
  deleted: false,
  successMessage: null,
  duplicates: [],
  documents: [],
  piecesAttachResult: null,
};
