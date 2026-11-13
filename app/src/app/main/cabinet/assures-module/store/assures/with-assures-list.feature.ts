import { computed, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withComputed, withHooks, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, debounceTime, EMPTY, pipe, switchMap, tap } from 'rxjs';
import { setError } from '../../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { AssuresService } from '../../services/assures.service';
import { matchesSearch } from '../../util/assures.utils';
import { AssureFilters, AssuresStoreState, DEFAULT_ASSURE_FILTERS, PAGE_SIZE } from './assures.state';

/** Liste des clients : tranches Firestore (défilement infini), filtres, recherche Elasticsearch avec repli local. */
export function withAssuresList() {
  return signalStoreFeature(
    { state: type<AssuresStoreState>() },
    withComputed(({ assures, query, filters, searchResults }) => {
      const filtered = computed(() => {
        const text = query();
        const { type } = filters();
        const results = searchResults();
        // Clients déjà chargés qui correspondent : toujours affichés, même si Elasticsearch ne les connaît pas encore
        // (index en retard, client jamais indexé) ou ne répond pas.
        const local = assures().filter((assure) => matchesSearch(assure, text));
        // Recherche : résultats d'Elasticsearch d'abord (ordre de pertinence, tout le portefeuille), puis les correspondances
        // locales qu'il n'a pas renvoyées.
        const ids = new Set(results?.map((assure) => assure.id));
        const source = text.trim() && results ? [...results, ...local.filter((assure) => !ids.has(assure.id))] : local;
        // L'ordre (nom ou plus récents) est appliqué par Firestore hors recherche.
        return source.filter((assure) => type === 'all' || assure.type === type);
      });
      return {
        filtered,
        hasFilters: computed(() => {
          const { type, sort } = filters();
          return !!query() || type !== 'all' || sort !== 'name';
        }),
        total: computed(() => filtered().length),
      };
    }),
    withMethods((store, service = inject(AssuresService)) => ({
      setQuery: (query: string) => patchState(store, { query }),
      setFilters: (changes: Partial<AssureFilters>) => {
        const filters = { ...store.filters(), ...changes };
        // Changer d'ordre relance la lecture depuis la première tranche.
        const resort = filters.sort !== store.filters().sort;
        patchState(store, { filters, ...(resort ? { limit: PAGE_SIZE, loaded: false } : {}) });
      },
      clearFilters: () => {
        const resort = store.filters().sort !== DEFAULT_ASSURE_FILTERS.sort;
        patchState(store, {
          query: '',
          filters: DEFAULT_ASSURE_FILTERS,
          ...(resort ? { limit: PAGE_SIZE, loaded: false } : {}),
        });
      },
      /** Fin du défilement : demande la tranche suivante (pas pendant une recherche : elle couvre déjà tout). */
      loadMore: () => {
        if (store.hasMore() && !store.loadingMore() && !store.searchResults()) {
          patchState(store, { limit: store.limit() + PAGE_SIZE, loadingMore: true });
        }
      },
      _listen: rxMethod<{ cabinetId: string | null; limit: number; sort: AssureFilters['sort'] }>(
        pipe(
          switchMap(({ cabinetId, limit, sort }) =>
            cabinetId
              ? service.watchAssuresPage(cabinetId, limit, sort).pipe(
                  tap(({ assures, hasMore }) => patchState(store, { assures, hasMore, loaded: true, loadingMore: false })),
                  // Une écoute refusée affiche l'erreur sans arrêter l'écoute (changement de cabinet).
                  catchError((error) => {
                    patchState(store, setError(toBackendErrorMessage(error)), { loaded: true, loadingMore: false });
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),
      /** Recherche Elasticsearch, 300 ms après la dernière frappe ; en cas d'échec, recherche sur la tranche chargée. */
      _search: rxMethod<{ cabinetId: string | null; query: string }>(
        pipe(
          debounceTime(300),
          switchMap(({ cabinetId, query }) => {
            const text = query.trim();
            if (!cabinetId || text.length < 2) {
              patchState(store, { searchResults: null, searching: false });
              return EMPTY;
            }
            patchState(store, { searching: true });
            return service.search(text).pipe(
              switchMap((ids) => service.watchAssuresByIds(cabinetId, ids)),
              tap((searchResults) => patchState(store, { searchResults, searching: false })),
              catchError(() => {
                patchState(store, { searchResults: null, searching: false });
                return EMPTY;
              }),
            );
          }),
        ),
      ),
    })),
    withHooks((store) => {
      const authStore = inject(AuthStore);
      return {
        onInit: () => {
          store._listen(
            computed(() => ({ cabinetId: authStore.cabinetId(), limit: store.limit(), sort: store.filters().sort }), {
              equal: (a, b) => a.cabinetId === b.cabinetId && a.limit === b.limit && a.sort === b.sort,
            }),
          );
          store._search(
            computed(() => ({ cabinetId: authStore.cabinetId(), query: store.query() }), {
              equal: (a, b) => a.cabinetId === b.cabinetId && a.query.trim() === b.query.trim(),
            }),
          );
        },
      };
    }),
  );
}
