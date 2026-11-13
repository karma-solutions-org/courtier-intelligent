import { Dossier } from '@shared';
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
