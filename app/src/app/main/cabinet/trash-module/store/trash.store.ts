import { computed, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Assure, Dossier } from '@shared';
import { catchError, combineLatest, debounceTime, exhaustMap, map, Observable, of, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { TrashKind, TrashService } from '../services/trash.service';
import {
  daysAgo,
  dossierAssureIds,
  EMPTY_LIMITS,
  hasTrashFilters,
  NOT_LOADING,
  TRASH_PAGE_SIZE,
  TrashFilters,
  TrashPage,
  TrashRow,
  TrashSearch,
  trashGroups,
  visibleTrashGroups,
} from '../util/trash.utils';

interface TrashState extends TrashFilters {
  /** Erreur de lecture Firestore (droits, réseau) : affichée en bandeau au lieu d'une liste vide trompeuse. */
  loadError: string | null;
  /** Elasticsearch en échec : filtrage local des tranches chargées. */
  searchUnavailable: boolean;
  /** Recherche en cours (frappe en attente ou réponse attendue). */
  searching: boolean;
  /** Nombre d'éléments demandés à Firestore par groupe : grandit d'une tranche à chaque fin de défilement. */
  limits: Record<TrashKind, number>;
  loadingMore: Record<TrashKind, boolean>;
  /** Nombre de résultats demandés à Elasticsearch par type : grandit d'une tranche à chaque fin de défilement. */
  searchLimits: Record<TrashKind, number>;
  searchLoadingMore: Record<TrashKind, boolean>;
  deletedAssures: TrashPage<Assure>;
  deletedDossiers: TrashPage<Dossier>;
  search: TrashSearch | null;
  /** Clients des dossiers chargés (ils peuvent être actifs, donc hors de la liste des clients supprimés). */
  dossierAssures: Assure[];
  /** Restauration ou suppression définitive en cours. */
  busy: boolean;
  /** Ligne dont la suppression définitive attend confirmation. */
  confirming: string | null;
}

type Page<T> = { items: T[]; hasMore: boolean };
type SearchInput = TrashFilters & { cabinetId: string | null; limits: Record<TrashKind, number> };

/** Corbeille (fournie par sa page) : éléments supprimés, recherche, restauration et suppression définitive. */
export const TrashStore = signalStore(
  withState<TrashState>({
    query: '',
    kind: 'all',
    period: 0,
    loadError: null,
    searchUnavailable: false,
    searching: false,
    limits: EMPTY_LIMITS,
    loadingMore: NOT_LOADING,
    searchLimits: EMPTY_LIMITS,
    searchLoadingMore: NOT_LOADING,
    deletedAssures: { items: [], hasMore: false, loaded: false },
    deletedDossiers: { items: [], hasMore: false, loaded: false },
    search: null,
    dossierAssures: [],
    busy: false,
    confirming: null,
  }),
  withComputed((store) => {
    const filters = computed(() => ({ query: store.query(), kind: store.kind(), period: store.period() }));
    const groups = computed(() =>
      trashGroups({
        deletedAssures: store.deletedAssures(),
        deletedDossiers: store.deletedDossiers(),
        search: store.search(),
        dossierAssures: store.dossierAssures(),
        loadingMore: store.loadingMore(),
        searchLoadingMore: store.searchLoadingMore(),
        searching: store.searching(),
      }),
    );
    return {
      hasFilters: computed(() => hasTrashFilters(filters())),
      visibleGroups: computed(() => visibleTrashGroups(groups(), filters(), !!store.search())),
    };
  }),
  withMethods((store, service = inject(TrashService), snackBar = inject(MatSnackBar)) => {
    /** Lecture Firestore en échec : bandeau d'erreur et groupe vide (au lieu d'un écran figé). */
    const orEmpty = <T>() =>
      catchError<Page<T>, Observable<Page<T>>>((error) => {
        patchState(store, { loadError: `Impossible de charger la corbeille : ${toBackendErrorMessage(error)}` });
        return of({ items: [] as T[], hasMore: false });
      });

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

    /** Une recherche par type, pour savoir s'il reste des clients et des dossiers. Un échec : null (filtre local). */
    const runSearch = ({ cabinetId, query, kind, period, limits }: SearchInput): Observable<TrashSearch | null> => {
      const q = query.trim();
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
    };

    /** Restaure ou supprime définitivement une ligne, puis l'annonce. */
    const act = rxMethod<{ action: Observable<unknown>; message: string }>(
      pipe(
        exhaustMap(({ action, message }) => {
          patchState(store, { busy: true });
          return action.pipe(
            tapResponse({
              next: () => {
                patchState(store, { busy: false, confirming: null });
                snackBar.open(message, undefined, { duration: 3000 });
              },
              error: (error) => {
                patchState(store, { busy: false, confirming: null });
                snackBar.open(toBackendErrorMessage(error), undefined, { duration: 5000 });
              },
            }),
          );
        }),
      ),
    );

    return {
      setQuery: (query: string) => patchState(store, { query, searchLimits: EMPTY_LIMITS }),
      setKind: (kind: TrashKind | 'all') => patchState(store, { kind, searchLimits: EMPTY_LIMITS }),
      setPeriod: (period: number) => patchState(store, { period, searchLimits: EMPTY_LIMITS }),
      clearFilters: () => patchState(store, { query: '', kind: 'all', period: 0, searchLimits: EMPTY_LIMITS }),
      confirm: (confirming: string | null) => patchState(store, { confirming }),

      /** Fin du défilement d'un groupe : tranche suivante des résultats de recherche, sinon de Firestore. */
      loadMore: (kind: TrashKind) => {
        const search = store.search();
        if (search) {
          if (!search.hasMore[kind] || store.searchLoadingMore()[kind]) return;
          patchState(store, {
            searchLoadingMore: { ...store.searchLoadingMore(), [kind]: true },
            searchLimits: { ...store.searchLimits(), [kind]: store.searchLimits()[kind] + TRASH_PAGE_SIZE },
          });
          return;
        }
        const page = kind === 'assure' ? store.deletedAssures() : store.deletedDossiers();
        if (!page.hasMore || store.loadingMore()[kind]) return;
        patchState(store, {
          loadingMore: { ...store.loadingMore(), [kind]: true },
          limits: { ...store.limits(), [kind]: store.limits()[kind] + TRASH_PAGE_SIZE },
        });
      },

      restore: (row: TrashRow) => act({ action: service.restore(row.kind, row.id), message: row.kind === 'assure' ? 'Client restauré.' : 'Dossier restauré.' }),
      deleteForever: (row: TrashRow) => act({ action: service.deleteForever(row.kind, row.id), message: 'Supprimé définitivement.' }),

      _listenAssures: rxMethod<{ cabinetId: string | null; limit: number }>(
        pipe(
          switchMap(({ cabinetId, limit }) => (cabinetId ? service.watchDeletedAssures(cabinetId, limit).pipe(orEmpty<Assure>()) : of({ items: [] as Assure[], hasMore: false }))),
          tap((page) => patchState(store, { deletedAssures: { ...page, loaded: true }, loadingMore: { ...store.loadingMore(), assure: false } })),
        ),
      ),
      _listenDossiers: rxMethod<{ cabinetId: string | null; limit: number }>(
        pipe(
          switchMap(({ cabinetId, limit }) => (cabinetId ? service.watchDeletedDossiers(cabinetId, limit).pipe(orEmpty<Dossier>()) : of({ items: [] as Dossier[], hasMore: false }))),
          tap((page) => patchState(store, { deletedDossiers: { ...page, loaded: true }, loadingMore: { ...store.loadingMore(), dossier: false } })),
        ),
      ),
      /**
       * Recherche Elasticsearch dès qu'un filtre est actif (300 ms après la dernière frappe) : couvre toute la corbeille,
       * pas seulement les tranches chargées. switchMap ignore les réponses d'une recherche dépassée.
       */
      _search: rxMethod<SearchInput>(
        pipe(
          tap((input) => patchState(store, { searching: !!input.cabinetId && hasTrashFilters(input) })),
          debounceTime(300),
          switchMap(runSearch),
          tap((search) => patchState(store, { search, searching: false, searchLoadingMore: NOT_LOADING })),
        ),
      ),
      _listenDossierAssures: rxMethod<{ cabinetId: string | null; ids: string }>(
        pipe(
          switchMap(({ cabinetId, ids }) =>
            cabinetId ? service.watchAssuresByIds(cabinetId, ids ? ids.split(',') : []).pipe(catchError(() => of([] as Assure[]))) : of([] as Assure[]),
          ),
          tap((dossierAssures) => patchState(store, { dossierAssures })),
        ),
      ),
    };
  }),
  withHooks((store, auth = inject(AuthStore)) => ({
    onInit: () => {
      store._listenAssures(
        computed(() => ({ cabinetId: auth.cabinetId(), limit: store.limits().assure }), { equal: (a, b) => a.cabinetId === b.cabinetId && a.limit === b.limit }),
      );
      store._listenDossiers(
        computed(() => ({ cabinetId: auth.cabinetId(), limit: store.limits().dossier }), { equal: (a, b) => a.cabinetId === b.cabinetId && a.limit === b.limit }),
      );
      store._search(
        computed(
          () => ({ cabinetId: auth.cabinetId(), query: store.query().trim(), kind: store.kind(), period: store.period(), limits: store.searchLimits() }),
          { equal: (a, b) => a.cabinetId === b.cabinetId && a.query === b.query && a.kind === b.kind && a.period === b.period && a.limits === b.limits },
        ),
      );
      store._listenDossierAssures(
        computed(
          () => ({ cabinetId: auth.cabinetId(), ids: dossierAssureIds([...store.deletedDossiers().items, ...(store.search()?.dossiers ?? [])]) }),
          { equal: (a, b) => a.cabinetId === b.cabinetId && a.ids === b.ids },
        ),
      );
    },
  })),
);
