import { computed, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withHooks, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { DossiersService } from '../../services/dossiers.service';
import { DossierStoreState, EVENTS_PAGE_SIZE } from './dossier.state';

/** Historique du dossier en temps réel, par tranches (défilement infini). */
export function withDossierEvents() {
  return signalStoreFeature(
    { state: type<DossierStoreState>() },
    withMethods((store, service = inject(DossiersService)) => ({
      /** Fin du défilement de l'historique : demande la tranche suivante. */
      loadMoreEvents: () => {
        if (store.eventsHasMore() && !store.eventsLoadingMore()) {
          patchState(store, { eventsLimit: store.eventsLimit() + EVENTS_PAGE_SIZE, eventsLoadingMore: true });
        }
      },
      _listenEvents: rxMethod<{ cabinet: string | null; id: string | null; limit: number }>(
        pipe(
          switchMap(({ cabinet, id, limit }) =>
            cabinet && id
              ? service.watchEvents(cabinet, id, limit).pipe(
                  tap(({ events, hasMore }) => patchState(store, { events, eventsHasMore: hasMore, eventsLoadingMore: false })),
                  catchError((error) => {
                    patchState(store, { error: toBackendErrorMessage(error), eventsLoadingMore: false });
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),
    })),
    withHooks((store) => {
      const authStore = inject(AuthStore);
      return {
        onInit: () =>
          store._listenEvents(
            computed(() => ({ cabinet: authStore.cabinetId(), id: store.selectedId(), limit: store.eventsLimit() }), {
              equal: (a, b) => a.cabinet === b.cabinet && a.id === b.id && a.limit === b.limit,
            }),
          ),
      };
    }),
  );
}
