import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Assure, Dossier, Member, Product } from '@shared';
import { EMPTY, exhaustMap, merge, pipe, switchMap, tap } from 'rxjs';
import {
  resetRequestStatus,
  setError,
  setFulfilled,
  setPending,
  withRequestStatus,
} from '../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { CabinetStatusStore } from '../../../commons/main-module/store/cabinet-status.store';
import { AssuresService } from '../../assures-module/services/assures.service';
import { displayName, matchesSearch } from '../../assures-module/util/assures.utils';
import { DossiersService } from '../services/dossiers.service';
import { DossierFilter, EMPTY_FILTER, filterDossiers } from '../util/dossiers.utils';

export const PAGE_SIZE_OPTIONS = [10, 25, 50];
const MAX_ASSURE_RESULTS = 8;

interface DossiersState {
  dossiers: Dossier[];
  assures: Assure[];
  members: Member[];
  products: Product[];
  loaded: boolean;
  filter: DossierFilter;
  pageIndex: number;
  pageSize: number;
  /** Recherche d'assuré de l'étape 1 du stepper « Nouveau dossier ». */
  assureQuery: string;
  /** Dossier qui vient d'être créé : le stepper navigue vers son questionnaire. */
  createdId: string | null;
}

/** Store de la liste des dossiers et du début du stepper « Nouveau dossier » (assuré, produit). */
export const DossiersStore = signalStore(
  withState<DossiersState>({
    dossiers: [],
    assures: [],
    members: [],
    products: [],
    loaded: false,
    filter: EMPTY_FILTER,
    pageIndex: 0,
    pageSize: PAGE_SIZE_OPTIONS[0],
    assureQuery: '',
    createdId: null,
  }),
  withRequestStatus(),
  withComputed(store => {
    const authStore = inject(AuthStore);
    const cabinetStatus = inject(CabinetStatusStore);
    const filtered = computed(() => filterDossiers(store.dossiers(), store.filter(), authStore.user()?.uid ?? null));
    return {
      filtered,
      total: computed(() => filtered().length),
      pageItems: computed(() => {
        const start = store.pageIndex() * store.pageSize();
        return filtered().slice(start, start + store.pageSize());
      }),
      assureById: computed(() => new Map(store.assures().map(a => [a.id, a]))),
      /** Nom affiché d'un membre, par uid. */
      memberNames: computed(() => new Map(store.members().map(m => [m.id, m.displayName || m.email || m.id]))),
      activeMembers: computed(() => store.members().filter(m => m.status === 'active')),
      /** Produits que le cabinet peut utiliser : actifs au catalogue et activés par l'admin (tous, tant qu'il n'a rien choisi). */
      availableProducts: computed(() => {
        const enabled = cabinetStatus.cabinet()?.enabledProducts ?? [];
        return store.products().filter(p => p.active && (enabled.length === 0 || enabled.includes(p.id)));
      }),
      /** Assurés proposés à l'étape 1 : les plus proches de la recherche. */
      assureResults: computed(() =>
        store
          .assures()
          .filter(a => matchesSearch(a, store.assureQuery()))
          .slice(0, MAX_ASSURE_RESULTS),
      ),
    };
  }),
  withMethods((store, service = inject(DossiersService), assuresService = inject(AssuresService)) => ({
    setFilter: (changes: Partial<DossierFilter>) => patchState(store, { filter: { ...store.filter(), ...changes }, pageIndex: 0 }),
    resetFilter: () => patchState(store, { filter: EMPTY_FILTER, pageIndex: 0 }),
    setPage: (pageIndex: number, pageSize: number) => patchState(store, { pageIndex, pageSize }),
    setAssureQuery: (assureQuery: string) => patchState(store, { assureQuery }),
    assureName: (assureId: string): string => {
      const assure = store.assureById().get(assureId);
      return assure ? displayName(assure) : '—';
    },
    resetStatus: () => patchState(store, resetRequestStatus(), { createdId: null }),

    create: rxMethod<{ assureId: string; productId: string }>(
      pipe(
        tap(() => patchState(store, setPending(), { createdId: null })),
        exhaustMap(({ assureId, productId }) =>
          service.create(assureId, productId).pipe(
            tapResponse({
              next: ({ dossierId }) => patchState(store, setFulfilled(), { createdId: dossierId }),
              error: error => patchState(store, setError(toBackendErrorMessage(error))),
            }),
          ),
        ),
      ),
    ),

    _listen: rxMethod<string | null>(
      pipe(
        switchMap(cabinetId =>
          cabinetId
            ? merge(
                service.watchDossiers(cabinetId).pipe(tap(dossiers => patchState(store, { dossiers, loaded: true }))),
                assuresService.watchAssures(cabinetId).pipe(tap(assures => patchState(store, { assures }))),
                service.watchMembers(cabinetId).pipe(tap(members => patchState(store, { members }))),
                service.watchProducts().pipe(tap(products => patchState(store, { products }))),
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
