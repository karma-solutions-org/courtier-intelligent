import { signalStore, withState } from '@ngrx/signals';
import { withRequestStatus } from '../../../../core/store-features/with-request-status';
import { AssuresState, initialAssuresState } from './assures/assures.state';
import { withAssureDuplicates } from './assures/with-assure-duplicates.feature';
import { withAssureEdition } from './assures/with-assure-edition.feature';
import { withAssureSelection } from './assures/with-assure-selection.feature';
import { withAssuresList } from './assures/with-assures-list.feature';

export { DEFAULT_ASSURE_FILTERS, PAGE_SIZE } from './assures/assures.state';
export type { AssureFilters } from './assures/assures.state';

/**
 * Store des clients (fourni par la route), composé d'une feature par responsabilité (voir `store/assures/`) :
 *
 * | Feature                | Rôle                                                                     |
 * |------------------------|--------------------------------------------------------------------------|
 * | `withAssuresList`      | liste par tranches, filtres, recherche Elasticsearch avec repli local    |
 * | `withAssureSelection`  | fiche ouverte : client, dossiers, pièces                                 |
 * | `withAssureEdition`    | création, modification, corbeille, rangement des pièces lues            |
 * | `withAssureDuplicates` | alerte de doublon pendant la saisie                                      |
 */
export const AssuresStore = signalStore(
  withState<AssuresState>(initialAssuresState),
  withRequestStatus(),
  withAssuresList(),
  withAssureSelection(),
  withAssureEdition(),
  withAssureDuplicates(),
);
