import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Cabinet } from '@shared';
import { catchError, EMPTY, pipe, switchMap, tap } from 'rxjs';
import { AuthStore } from '../../authentication-module/store/auth.store';
import { CabinetStatusService } from '../services/cabinet-status.service';

interface CabinetStatusState {
  cabinet: Cabinet | null;
}

/**
 * Store global : état du cabinet de l'utilisateur connecté, pour le bandeau « limite d'utilisateurs dépassée »
 * (baisse d'offre). `graceEndsAt` est posé par le serveur tant que les membres actifs dépassent la limite.
 */
export const CabinetStatusStore = signalStore(
  { providedIn: 'root' },
  withState<CabinetStatusState>({ cabinet: null }),
  withComputed(({ cabinet }) => ({
    /** Fin du délai de grâce (ms) si le cabinet dépasse la limite de son offre, sinon null. */
    graceEndsAt: computed(() => cabinet()?.graceEndsAt?.toMillis() ?? null),
    maxUtilisateurs: computed(() => cabinet()?.limits?.maxUtilisateurs ?? null),
  })),
  withMethods((store, service = inject(CabinetStatusService)) => ({
    _listen: rxMethod<string | null>(
      pipe(
        tap(() => patchState(store, { cabinet: null })),
        switchMap(id =>
          id
            ? service.watchCabinet(id).pipe(
                tap(cabinet => patchState(store, { cabinet })),
                // Un refus de lecture (session fermée) est géré par la déconnexion automatique, pas ici.
                catchError(() => EMPTY),
              )
            : EMPTY,
        ),
      ),
    ),
  })),
  withHooks({
    onInit: store => store._listen(inject(AuthStore).cabinetId),
  }),
);
