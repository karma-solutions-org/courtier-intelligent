import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Assure, Dossier, Member, Product } from '@shared';
import { catchError, EMPTY, merge, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { AssuresService } from '../../assures-module/services/assures.service';
import { DossiersService } from '../../dossiers-module/services/dossiers.service';
import {
  conversionRates,
  countByStatus,
  dossiersToProcess,
  proposalsToFollowUp,
} from '../util/dashboard.utils';

interface DashboardState {
  dossiers: Dossier[];
  assures: Assure[];
  members: Member[];
  products: Product[];
  loaded: boolean;
  error: string | null;
}

/** Store du tableau de bord : dossiers du cabinet en direct, agrégés côté app. */
export const DashboardStore = signalStore(
  withState<DashboardState>({
    dossiers: [],
    assures: [],
    members: [],
    products: [],
    loaded: false,
    error: null,
  }),
  withComputed((store) => {
    const authStore = inject(AuthStore);
    return {
      isAdmin: computed(() => authStore.role() === 'admin'),
      counts: computed(() => countByStatus(store.dossiers())),
      toProcess: computed(() => dossiersToProcess(store.dossiers(), authStore.user()?.uid ?? null)),
      toFollowUp: computed(() => proposalsToFollowUp(store.dossiers(), Date.now())),
      conversionByCourtier: computed(() => conversionRates(store.dossiers(), (d) => d.assignedTo)),
      conversionByProduct: computed(() => conversionRates(store.dossiers(), (d) => d.productId)),
      memberNames: computed(
        () => new Map(store.members().map((m) => [m.id, m.displayName || m.email || m.id])),
      ),
      productNames: computed(() => new Map(store.products().map((p) => [p.id, p.name]))),
      assureById: computed(() => new Map(store.assures().map((a) => [a.id, a]))),
    };
  }),
  withMethods(
    (store, service = inject(DossiersService), assuresService = inject(AssuresService)) => ({
      _listen: rxMethod<string | null>(
        pipe(
          switchMap((cabinetId) =>
            cabinetId
              ? merge(
                  service
                    .watchDossiers(cabinetId)
                    .pipe(tap((dossiers) => patchState(store, { dossiers, loaded: true }))),
                  assuresService
                    .watchAssures(cabinetId)
                    .pipe(tap((assures) => patchState(store, { assures }))),
                  service
                    .watchMembers(cabinetId)
                    .pipe(tap((members) => patchState(store, { members }))),
                  service.watchProducts(cabinetId).pipe(tap((products) => patchState(store, { products }))),
                ).pipe(
                  // Une écoute refusée affiche l'erreur sans arrêter l'écoute (changement de cabinet).
                  catchError((error) => {
                    patchState(store, { error: toBackendErrorMessage(error), loaded: true });
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),
    }),
  ),
  withHooks({
    onInit: (store) => store._listen(inject(AuthStore).cabinetId),
  }),
);
