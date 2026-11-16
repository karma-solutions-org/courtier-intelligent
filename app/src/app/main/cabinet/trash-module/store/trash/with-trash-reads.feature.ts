import { computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { patchState, signalStoreFeature, type, withComputed, withProps } from '@ngrx/signals';
import { Assure, Dossier } from '@shared';
import { catchError, combineLatest, debounceTime, distinctUntilChanged, map, Observable, of, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { TrashPage, TrashSearch } from '../../models/trash.model';
import { TrashKind, TrashService } from '../../services/trash.service';
import { daysAgo, dossierAssureIds, EMPTY_LIMITS, hasTrashFilters, NOT_LOADING, trashGroups, visibleTrashGroups } from '../../util/trash.utils';
import { TrashStoreState } from './trash.state';

/**
 * Lectures de la corbeille en temps réel : tranches Firestore (clients, dossiers), recherche Elasticsearch, clients des
 * dossiers ; puis les groupes affichés, filtrés par le texte, le type et la période.
 */
export function withTrashReads() {
  return signalStoreFeature(
    { state: type<TrashStoreState>() },
    withComputed(({ query, kind, period }) => ({
      hasFilters: computed(() => hasTrashFilters({ query: query(), kind: kind(), period: period() })),
    })),
    // Lectures en temps réel (tranches Firestore, recherche Elasticsearch, clients des dossiers) : reprises telles quelles.
    withProps((store, service = inject(TrashService), auth = inject(AuthStore)) => {
      /** Recherche en cours (frappe en attente ou réponse attendue). */
      const _searching = signal(false);
      /** Nombre d'éléments demandés à Firestore par groupe : grandit d'une tranche à chaque fin de défilement. */
      const _limits = signal<Record<TrashKind, number>>(EMPTY_LIMITS);
      const _loadingMore = signal<Record<TrashKind, boolean>>(NOT_LOADING);
      /** Nombre de résultats demandés à Elasticsearch par type : grandit d'une tranche à chaque fin de défilement. */
      const _searchLimits = signal<Record<TrashKind, number>>(EMPTY_LIMITS);
      const _searchLoadingMore = signal<Record<TrashKind, boolean>>(NOT_LOADING);

      const cabinetId$ = toObservable(auth.cabinetId);

      /** Lecture Firestore en échec : bandeau d'erreur et groupe vide (au lieu d'un écran figé). */
      const orEmpty = <T>() =>
        catchError<{ items: T[]; hasMore: boolean }, Observable<{ items: T[]; hasMore: boolean }>>((error) => {
          patchState(store, { loadError: `Impossible de charger la corbeille : ${toBackendErrorMessage(error)}` });
          return of({ items: [] as T[], hasMore: false });
        });

      const _deletedAssures = toSignal(
        combineLatest([cabinetId$, toObservable(computed(() => _limits().assure))]).pipe(
          switchMap(([cabinetId, limit]) =>
            cabinetId ? service.watchDeletedAssures(cabinetId, limit).pipe(orEmpty<Assure>()) : of({ items: [] as Assure[], hasMore: false }),
          ),
          map((page): TrashPage<Assure> => (_loadingMore.update((state) => ({ ...state, assure: false })), { ...page, loaded: true })),
        ),
        { initialValue: { items: [], hasMore: false, loaded: false } as TrashPage<Assure> },
      );
      const _deletedDossiers = toSignal(
        combineLatest([cabinetId$, toObservable(computed(() => _limits().dossier))]).pipe(
          switchMap(([cabinetId, limit]) =>
            cabinetId ? service.watchDeletedDossiers(cabinetId, limit).pipe(orEmpty<Dossier>()) : of({ items: [] as Dossier[], hasMore: false }),
          ),
          map((page): TrashPage<Dossier> => (_loadingMore.update((state) => ({ ...state, dossier: false })), { ...page, loaded: true })),
        ),
        { initialValue: { items: [], hasMore: false, loaded: false } as TrashPage<Dossier> },
      );

      /** Recherche d'un type ; null si Elasticsearch ou la lecture des fiches échoue. */
      const searchKind = (cabinetId: string, kind: TrashKind, q: string, from: number | undefined, size: number) =>
        service.search({ q, kind: kind === 'assure' ? 'client' : 'dossier', from, size }).pipe(
          switchMap((items) => {
            const ids = items.map((item) => item.id);
            const hasMore = items.length >= size;
            return kind === 'assure'
              ? service
                  .watchAssuresByIds(cabinetId, ids)
                  .pipe(map((assures) => ({ kind, assures: assures.filter((assure) => !!assure.deletedAt), dossiers: [] as Dossier[], hasMore })))
              : service.watchDeletedDossiersByIds(cabinetId, ids).pipe(map((dossiers) => ({ kind, assures: [] as Assure[], dossiers, hasMore })));
          }),
          tap(() => patchState(store, { searchUnavailable: false })),
          catchError(() => {
            patchState(store, { searchUnavailable: true });
            return of(null);
          }),
        );

      const filters = computed(() => ({ q: store.query().trim(), kind: store.kind(), period: store.period() }), {
        equal: (a, b) => a.q === b.q && a.kind === b.kind && a.period === b.period,
      });
      /**
       * Recherche Elasticsearch dès qu'un filtre est actif (300 ms après la dernière frappe) : couvre toute la corbeille,
       * pas seulement les tranches chargées. Une requête par type pour savoir s'il reste des clients et des dossiers.
       * switchMap ignore les réponses d'une recherche dépassée. Échec : filtre local et message.
       */
      const _search = toSignal(
        combineLatest([cabinetId$, toObservable(filters), toObservable(_searchLimits)]).pipe(
          tap(([cabinetId, { q, kind, period }]) => _searching.set(!!cabinetId && (!!q || kind !== 'all' || !!period))),
          debounceTime(300),
          switchMap(([cabinetId, { q, kind, period }, limits]) => {
            if (!cabinetId || (!q && kind === 'all' && !period)) return of(null);
            const from = period ? daysAgo(period - 1) : undefined;
            const kinds: TrashKind[] = kind === 'all' ? ['assure', 'dossier'] : [kind];
            return combineLatest(kinds.map((k) => searchKind(cabinetId, k, q, from, limits[k]))).pipe(
              map((parts): TrashSearch | null => {
                const ok = parts.filter((part) => part !== null);
                if (ok.length < parts.length) return null;
                return {
                  assures: ok.flatMap((part) => part.assures),
                  dossiers: ok.flatMap((part) => part.dossiers),
                  hasMore: {
                    assure: ok.some((part) => part.kind === 'assure' && part.hasMore),
                    dossier: ok.some((part) => part.kind === 'dossier' && part.hasMore),
                  },
                };
              }),
            );
          }),
          tap(() => {
            _searching.set(false);
            _searchLoadingMore.set(NOT_LOADING);
          }),
        ),
        { initialValue: null as TrashSearch | null },
      );

      /** Clients des dossiers chargés (ils peuvent être actifs, donc hors de la liste des clients supprimés). */
      const _dossierAssures = toSignal(
        combineLatest([
          cabinetId$,
          toObservable(
            computed(() => dossierAssureIds([..._deletedDossiers().items, ...(_search()?.dossiers ?? [])])),
          ),
        ]).pipe(
          distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
          switchMap(([cabinetId, ids]) =>
            cabinetId
              ? service.watchAssuresByIds(cabinetId, ids ? ids.split(',') : []).pipe(catchError(() => of([] as Assure[])))
              : of([] as Assure[]),
          ),
        ),
        { initialValue: [] as Assure[] },
      );

      return { _searching, _limits, _loadingMore, _searchLimits, _searchLoadingMore, _deletedAssures, _deletedDossiers, _search, _dossierAssures };
    }),
    withComputed((store) => {
      const groups = computed(() =>
        trashGroups({
          deletedAssures: store._deletedAssures(),
          deletedDossiers: store._deletedDossiers(),
          search: store._search(),
          dossierAssures: store._dossierAssures(),
          loadingMore: store._loadingMore(),
          searchLoadingMore: store._searchLoadingMore(),
          searching: store._searching(),
        }),
      );
      return {
        visibleGroups: computed(() =>
          visibleTrashGroups(groups(), { query: store.query(), kind: store.kind(), period: store.period() }, !!store._search()),
        ),
      };
    }),
  );
}
