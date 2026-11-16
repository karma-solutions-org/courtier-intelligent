import { Assure, Dossier } from '@shared';
import { TrashKind } from '../services/trash.service';

/** Ligne de la corbeille : un client ou un dossier supprimé. */
export interface TrashRow {
  kind: TrashKind;
  id: string;
  title: string;
  detail: string;
  deletedAt: Dossier['deletedAt'];
  /** Raison pour laquelle l'élément ne peut pas être restauré seul (son client est dans la corbeille). */
  blocked: string | null;
  /** Proposition envoyée à l'assuré : jamais supprimé définitivement (seule la restauration reste possible). */
  protected: boolean;
}

/** Groupe affiché (clients ou dossiers) avec l'état de son défilement infini. */
export interface TrashGroup {
  kind: TrashKind;
  title: string;
  rows: TrashRow[];
  empty: string;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadedCount: number;
}

/** Filtre « Afficher » : un type d'élément ou tout. */
export type TrashKindFilter = TrashKind | 'all';

/** Filtres de la corbeille : texte, type d'élément, période de suppression en jours (0 = toutes). */
export interface TrashFilters {
  query: string;
  kind: TrashKindFilter;
  period: number;
}

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

/** Ce qu'il faut pour construire les groupes : tranches Firestore, recherche éventuelle et état des chargements. */
export interface TrashSources {
  deletedAssures: TrashPage<Assure>;
  deletedDossiers: TrashPage<Dossier>;
  search: TrashSearch | null;
  dossierAssures: Assure[];
  loadingMore: Record<TrashKind, boolean>;
  searchLoadingMore: Record<TrashKind, boolean>;
  searching: boolean;
}
