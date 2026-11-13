import { Assure, Dossier } from '@shared';
import { NoticeState } from '../../../../../core/store-features/with-notice';
import { TrashKindFilter } from '../../models/trash.model';
import { TrashKind } from '../../services/trash.service';

/** Taille d'une tranche du défilement infini. */
export const PAGE_SIZE = 20;

/** Tranche Firestore d'un groupe (`loaded` : première réponse reçue). */
export interface TrashPage<T> {
  items: T[];
  hasMore: boolean;
  loaded: boolean;
}

/** Résultats Elasticsearch de la corbeille (null : pas de filtre, ou service indisponible → filtrage local). */
export interface TrashSearch {
  assures: Assure[];
  dossiers: Dossier[];
  hasMore: Record<TrashKind, boolean>;
}

export const EMPTY_LIMITS: Record<TrashKind, number> = { assure: PAGE_SIZE, dossier: PAGE_SIZE };
export const NOT_LOADING: Record<TrashKind, boolean> = { assure: false, dossier: false };

export interface TrashState {
  /** Filtres : texte (nom, référence, client), type d'élément, période de suppression en jours (0 = toutes). */
  query: string;
  kind: TrashKindFilter;
  period: number;
  busy: boolean;
  /** Ligne dont la suppression définitive attend une confirmation. */
  confirming: string | null;
  /** Erreur de lecture Firestore (droits, réseau) : affichée en bandeau au lieu d'une liste vide trompeuse. */
  loadError: string | null;
  /** Elasticsearch en échec : filtrage local des tranches chargées. */
  searchUnavailable: boolean;
}

/** État complet vu par les features (le message ponctuel vient de `withNotice`). */
export type TrashStoreState = TrashState & NoticeState;

export const initialTrashState: TrashState = {
  query: '',
  kind: 'all',
  period: 0,
  busy: false,
  confirming: null,
  loadError: null,
  searchUnavailable: false,
};
