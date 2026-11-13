import { signalStore, withState } from '@ngrx/signals';
import { withNotice } from '../../../../core/store-features/with-notice';
import { initialTrashState, TrashState } from './trash/trash.state';
import { withTrashActions } from './trash/with-trash-actions.feature';
import { withTrashReads } from './trash/with-trash-reads.feature';

/**
 * Corbeille (admin, fournie par le composant) : clients et dossiers supprimés, à restaurer ou à supprimer définitivement.
 *
 * | Feature            | Rôle                                                                              |
 * |--------------------|-----------------------------------------------------------------------------------|
 * | `withTrashReads`   | tranches Firestore, recherche Elasticsearch, groupes affichés et filtrés          |
 * | `withTrashActions` | filtres, défilement, restauration, suppression définitive                         |
 */
export const TrashStore = signalStore(
  withState<TrashState>(initialTrashState),
  withNotice(),
  withTrashReads(),
  withTrashActions(),
);
