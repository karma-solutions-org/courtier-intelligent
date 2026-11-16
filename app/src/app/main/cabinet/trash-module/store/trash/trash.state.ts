import { NoticeState } from '../../../../../core/store-features/with-notice';
import { TrashFilters } from '../../models/trash.model';

export interface TrashState extends TrashFilters {
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
