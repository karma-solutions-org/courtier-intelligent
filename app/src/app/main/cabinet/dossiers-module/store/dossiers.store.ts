import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
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
import { catchError, debounceTime, EMPTY, exhaustMap, map, merge, pipe, switchMap, tap } from 'rxjs';
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
import { DEFAULT_FILTER, DossierFilter, filterDossiers, needsSearch } from '../util/dossiers.utils';

/** Taille d'une tranche du défilement infini. */
export const PAGE_SIZE = 20;
const MAX_ASSURE_RESULTS = 8;

interface DossiersState {
  dossiers: Dossier[];
  assures: Assure[];
  members: Member[];
  products: Product[];
  loaded: boolean;
  filter: DossierFilter;
  /** Nombre de dossiers demandés à Firestore : grandit d'une tranche à chaque fin de défilement. */
  limit: number;
  /** Firestore a peut-être d'autres dossiers au-delà de la tranche chargée. */
  hasMore: boolean;
  /** Une tranche supplémentaire est demandée et pas encore arrivée. */
  loadingMore: boolean;
  /**
   * Résultats Elasticsearch (texte et filtres, tout le cabinet) ; null hors recherche ou si le service est
   * indisponible : la liste filtre alors la tranche Firestore chargée.
   */
  searchResults: Dossier[] | null;
  /** Nombre de résultats demandés à Elasticsearch (distinct de `limit` : la tranche Firestore reste chargée). */
  searchLimit: number;
  /** Elasticsearch a peut-être d'autres résultats au-delà de `searchLimit`. */
  searchHasMore: boolean;
  searching: boolean;
  /** Elasticsearch en échec : la liste filtre seulement les dossiers chargés. */
  searchUnavailable: boolean;
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
    filter: DEFAULT_FILTER,
    limit: PAGE_SIZE,
    hasMore: false,
    loadingMore: false,
    searchResults: null,
    searchLimit: PAGE_SIZE,
    searchHasMore: false,
    searching: false,
    searchUnavailable: false,
    assureQuery: '',
    createdId: null,
  }),
  withRequestStatus(),
  withComputed((store) => {
    const authStore = inject(AuthStore);
    const cabinetStatus = inject(CabinetStatusStore);
    const assureById = computed(() => new Map(store.assures().map((a) => [a.id, a])));
    const nameOf = (assureId: string) => {
      const assure = assureById().get(assureId);
      return assure ? displayName(assure) : '';
    };
    const filtered = computed(() => {
      const uid = authStore.user()?.uid ?? null;
      const local = filterDossiers(store.dossiers(), store.filter(), uid, nameOf);
      const results = store.searchResults();
      if (!results) return local;
      // Résultats d'Elasticsearch (en direct : un dossier qui ne correspond plus aux filtres disparaît), puis les
      // dossiers chargés qui correspondent mais qu'il n'a pas encore indexés.
      const live = filterDossiers(results, { ...store.filter(), query: '' }, uid);
      const ids = new Set(live.map((d) => d.id));
      return [...live, ...local.filter((d) => !ids.has(d.id))];
    });
    return {
      filtered,
      /** Pagination : celle d'Elasticsearch pendant une recherche, sinon celle de Firestore. */
      canLoadMore: computed(() => (store.searchResults() ? store.searchHasMore() : store.hasMore())),
      total: computed(() => filtered().length),
      assureById,
      /** Nom affiché d'un membre, par uid. */
      memberNames: computed(
        () => new Map(store.members().map((m) => [m.id, m.displayName || m.email || m.id])),
      ),
      activeMembers: computed(() => store.members().filter((m) => m.status === 'active')),
      /** Produits que le cabinet peut utiliser : actifs au catalogue et activés par l'admin (tous, tant qu'il n'a rien choisi). */
      availableProducts: computed(() => {
        const enabled = cabinetStatus.cabinet()?.enabledProducts ?? [];
        return store
          .products()
          .filter((p) => p.active && !p.archived && (enabled.length === 0 || enabled.includes(p.id)));
      }),
      /** Assurés proposés à l'étape 1 : les plus proches de la recherche. */
      assureResults: computed(() =>
        store
          .assures()
          .filter((a) => matchesSearch(a, store.assureQuery()))
          .slice(0, MAX_ASSURE_RESULTS),
      ),
    };
  }),
  withMethods(
    (store, service = inject(DossiersService), assuresService = inject(AssuresService)) => ({
      // Nouveau filtre : la recherche repart de la première tranche (la tranche Firestore déjà chargée est gardée).
      setFilter: (changes: Partial<DossierFilter>) =>
        patchState(store, { filter: { ...store.filter(), ...changes }, searchLimit: PAGE_SIZE, loadingMore: false }),
      resetFilter: () => patchState(store, { filter: DEFAULT_FILTER, searchLimit: PAGE_SIZE, loadingMore: false }),
      /** Fin du défilement : demande la tranche suivante (Elasticsearch en recherche, Firestore sinon). */
      loadMore: () => {
        if (store.loadingMore()) return;
        if (store.searchResults()) {
          if (store.searchHasMore() && !store.searching()) {
            patchState(store, { searchLimit: store.searchLimit() + PAGE_SIZE, loadingMore: true });
          }
        } else if (store.hasMore()) {
          patchState(store, { limit: store.limit() + PAGE_SIZE, loadingMore: true });
        }
      },
      setAssureQuery: (assureQuery: string) => patchState(store, { assureQuery }),
      assureName: (assureId: string): string => {
        const assure = store.assureById().get(assureId);
        return assure ? displayName(assure) : '—';
      },
      resetStatus: () => patchState(store, resetRequestStatus(), { createdId: null }),

      create: rxMethod<{ assureId: string; productId: string }>(
        pipe(
          // L'état passe en attente dans exhaustMap : un double clic ignoré ne remet pas createdId à null.
          exhaustMap(({ assureId, productId }) => {
            patchState(store, setPending(), { createdId: null });
            return service.create(assureId, productId).pipe(
              tapResponse({
                next: ({ dossierId }) =>
                  patchState(store, setFulfilled(), { createdId: dossierId }),
                error: (error) => patchState(store, setError(toBackendErrorMessage(error))),
              }),
            );
          }),
        ),
      ),

      /** Tranche de dossiers : écoute à part, relancée à chaque nouvelle tranche sans toucher aux autres écoutes. */
      _listenDossiers: rxMethod<{ cabinetId: string | null; limit: number }>(
        pipe(
          switchMap(({ cabinetId, limit }) =>
            cabinetId
              ? service.watchDossiersPage(cabinetId, limit).pipe(
                  tap(({ dossiers, hasMore }) =>
                    patchState(store, { dossiers, hasMore, loaded: true, loadingMore: false }),
                  ),
                  catchError((error) => {
                    patchState(store, setError(toBackendErrorMessage(error)), { loaded: true, loadingMore: false });
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),

      /**
       * Recherche Elasticsearch (texte et filtres) 300 ms après le dernier changement. switchMap abandonne la requête
       * précédente : une réponse arrivée en retard n'écrase jamais une recherche plus récente. Échec : repli local.
       */
      _search: rxMethod<{ cabinetId: string | null; filter: DossierFilter; uid: string | null; limit: number }>(
        pipe(
          debounceTime(300),
          switchMap(({ cabinetId, filter, uid, limit }) => {
            if (!cabinetId || !needsSearch(filter)) {
              patchState(store, { searchResults: null, searchHasMore: false, searching: false, searchUnavailable: false });
              return EMPTY;
            }
            patchState(store, { searching: true });
            return service
              .search({
                q: filter.query.trim(),
                size: limit,
                status: filter.status,
                productId: filter.productId,
                assignedTo: filter.mine ? (uid ?? '') : filter.assignedTo,
              })
              .pipe(
                switchMap((ids) =>
                  service.watchDossiersByIds(cabinetId, ids).pipe(map((dossiers) => ({ dossiers, more: ids.length >= limit }))),
                ),
                tap(({ dossiers, more }) =>
                  patchState(store, {
                    searchResults: dossiers,
                    searchHasMore: more,
                    searching: false,
                    searchUnavailable: false,
                    loadingMore: false,
                  }),
                ),
                catchError(() => {
                  patchState(store, { searchResults: null, searchHasMore: false, searching: false, searchUnavailable: true, loadingMore: false });
                  return EMPTY;
                }),
              );
          }),
        ),
      ),

      _listen: rxMethod<string | null>(
        pipe(
          switchMap((cabinetId) =>
            cabinetId
              ? merge(
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
                    patchState(store, setError(toBackendErrorMessage(error)), { loaded: true });
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
    onInit: (store) => {
      const authStore = inject(AuthStore);
      store._listen(authStore.cabinetId);
      store._search(
        computed(
          () => ({ cabinetId: authStore.cabinetId(), filter: store.filter(), uid: authStore.user()?.uid ?? null, limit: store.searchLimit() }),
          {
            equal: (a, b) =>
              a.cabinetId === b.cabinetId && a.uid === b.uid && a.limit === b.limit &&
              JSON.stringify({ ...a.filter, query: a.filter.query.trim() }) === JSON.stringify({ ...b.filter, query: b.filter.query.trim() }),
          },
        ),
      );
      store._listenDossiers(
        computed(
          () => ({ cabinetId: authStore.cabinetId(), limit: store.limit() }),
          { equal: (a, b) => a.cabinetId === b.cabinetId && a.limit === b.limit },
        ),
      );
    },
  }),
);
