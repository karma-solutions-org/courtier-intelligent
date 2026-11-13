import { inject, Signal, WritableSignal } from '@angular/core';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, exhaustMap, Observable, pipe, tap } from 'rxjs';
import { setNotice } from '../../../../../core/store-features/with-notice';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { TrashKindFilter, TrashRow } from '../../models/trash.model';
import { TrashKind, TrashService } from '../../services/trash.service';
import { EMPTY_LIMITS, PAGE_SIZE, TrashPage, TrashSearch, TrashStoreState } from './trash.state';

/** Lectures paginées exposées par `withTrashReads` et pilotées ici (filtres, défilement). */
interface TrashReadsProps {
  _search: Signal<TrashSearch | null>;
  _deletedAssures: Signal<TrashPage<unknown>>;
  _deletedDossiers: Signal<TrashPage<unknown>>;
  _limits: WritableSignal<Record<TrashKind, number>>;
  _loadingMore: WritableSignal<Record<TrashKind, boolean>>;
  _searchLimits: WritableSignal<Record<TrashKind, number>>;
  _searchLoadingMore: WritableSignal<Record<TrashKind, boolean>>;
}

/** Actions de la corbeille : filtres, défilement, restauration et suppression définitive. */
export function withTrashActions() {
  return signalStoreFeature(
    { state: type<TrashStoreState>(), props: type<TrashReadsProps>() },
    withMethods((store, service = inject(TrashService)) => {
      /** Restauration ou suppression définitive : la confirmation se referme, puis un message. */
      const run = rxMethod<{ action: Observable<unknown>; message: string }>(
        pipe(
          exhaustMap(({ action, message }) => {
            patchState(store, { busy: true });
            return action.pipe(
              tap(() => patchState(store, { busy: false, confirming: null }, setNotice(message, 3000))),
              catchError((error) => {
                patchState(store, { busy: false, confirming: null }, setNotice(toBackendErrorMessage(error), 5000));
                return EMPTY;
              }),
            );
          }),
        ),
      );

      return {
        setConfirming: (confirming: string | null) => patchState(store, { confirming }),
        setQuery: (query: string) => {
          patchState(store, { query });
          store._searchLimits.set(EMPTY_LIMITS);
        },
        setKind: (kind: TrashKindFilter) => {
          patchState(store, { kind });
          store._searchLimits.set(EMPTY_LIMITS);
        },
        setPeriod: (period: number) => {
          patchState(store, { period });
          store._searchLimits.set(EMPTY_LIMITS);
        },
        clearFilters: () => {
          store._searchLimits.set(EMPTY_LIMITS);
          patchState(store, { query: '', kind: 'all', period: 0 });
        },
        loadMore: (kind: TrashKind) => {
          const search = store._search();
          if (search) {
            if (!search.hasMore[kind] || store._searchLoadingMore()[kind]) return;
            store._searchLoadingMore.update((state) => ({ ...state, [kind]: true }));
            store._searchLimits.update((limits) => ({ ...limits, [kind]: limits[kind] + PAGE_SIZE }));
            return;
          }
          const page = kind === 'assure' ? store._deletedAssures() : store._deletedDossiers();
          if (!page.hasMore || store._loadingMore()[kind]) return;
          store._loadingMore.update((state) => ({ ...state, [kind]: true }));
          store._limits.update((limits) => ({ ...limits, [kind]: limits[kind] + PAGE_SIZE }));
        },
        restore: (row: TrashRow) =>
          run({ action: service.restore(row.kind, row.id), message: row.kind === 'assure' ? 'Client restauré.' : 'Dossier restauré.' }),
        deleteForever: (row: TrashRow) => run({ action: service.deleteForever(row.kind, row.id), message: 'Supprimé définitivement.' }),
      };
    }),  );
}
