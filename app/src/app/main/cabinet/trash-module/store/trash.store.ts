import { computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Assure, Dossier, PROTECTED_DOSSIER_STATUSES } from '@shared';
import { catchError, combineLatest, debounceTime, distinctUntilChanged, EMPTY, exhaustMap, map, Observable, of, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { displayName } from '../../assures-module/util/assures.utils';
import { TrashGroup, TrashKindFilter, TrashRow } from '../models/trash.model';
import { TrashKind, TrashService } from '../services/trash.service';

/** Taille d'une tranche du défilement infini. */
const PAGE_SIZE = 20;

/** Tranche Firestore d'un groupe (`loaded` : première réponse reçue). */
interface TrashPage<T> {
  items: T[];
  hasMore: boolean;
  loaded: boolean;
}

/** Résultats Elasticsearch de la corbeille (null : pas de filtre, ou service indisponible → filtrage local). */
interface TrashSearch {
  assures: Assure[];
  dossiers: Dossier[];
  hasMore: Record<TrashKind, boolean>;
}

const EMPTY_LIMITS: Record<TrashKind, number> = { assure: PAGE_SIZE, dossier: PAGE_SIZE };
const NOT_LOADING: Record<TrashKind, boolean> = { assure: false, dossier: false };

interface TrashState {
  /** Filtres : texte (nom, référence, client), type d'élément, période de suppression en jours (0 = toutes). */
  query: string;
  kind: TrashKindFilter;
  period: number;
  busy: boolean;
  /** Ligne dont la suppression définitive attend une confirmation. */
  confirming: string | null;
  /** Erreur de lecture Firestore (droits, réseau) : affichée en bandeau au lieu d'une liste vide trompeuse. */
  loadError: string | null;
  /** Elasticsearch en échec : filtrage local des tranches chargées. */
  searchUnavailable: boolean;
  /** Message ponctuel à afficher (snackbar) avec sa durée. */
  notice: { text: string; duration: number } | null;
}

/** Corbeille (admin, fournie par le composant) : clients et dossiers supprimés, à restaurer ou à supprimer définitivement. */
export const TrashStore = signalStore(
  withState<TrashState>({
    query: '',
    kind: 'all',
    period: 0,
    busy: false,
    confirming: null,
    loadError: null,
    searchUnavailable: false,
    notice: null,
  }),
  withComputed(({ query, kind, period }) => ({
    hasFilters: computed(() => !!query().trim() || kind() !== 'all' || period() > 0),
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
          computed(() =>
            [...new Set([..._deletedDossiers().items, ...(_search()?.dossiers ?? [])].map((dossier) => dossier.assureId))].sort().join(','),
          ),
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
    const groups = computed((): TrashGroup[] => {
      const search = store._search();
      const deletedAssures = search ? search.assures : store._deletedAssures().items;
      const byId = new Map([...store._dossierAssures(), ...deletedAssures].map((assure) => [assure.id, assure]));
      const dossiers = search ? search.dossiers : store._deletedDossiers().items;
      // Dossiers connus (tranche chargée et résultats) : compte et protection des clients.
      const known = new Map([...store._deletedDossiers().items, ...(search?.dossiers ?? [])].map((dossier) => [dossier.id, dossier]));
      const isProtected = (dossier: Dossier) => PROTECTED_DOSSIER_STATUSES.includes(dossier.status);

      const clientRows: TrashRow[] = deletedAssures.map((assure) => {
        // Seuls les dossiers chargés sont connus : pas de compte (il serait faux au-delà de la tranche affichée).
        const own = [...known.values()].filter((dossier) => dossier.deletedWith === assure.id);
        return {
          kind: 'assure',
          id: assure.id,
          title: displayName(assure),
          detail: 'Client (revient avec ses dossiers supprimés en même temps)',
          deletedAt: assure.deletedAt,
          blocked: null,
          protected: own.some(isProtected),
        };
      });

      // Les dossiers partis avec leur client sont comptés sur la ligne du client et reviennent avec lui.
      const dossierRows: TrashRow[] = dossiers
        .filter((dossier) => !dossier.deletedWith)
        .map((dossier) => {
          const assure = byId.get(dossier.assureId);
          return {
            kind: 'dossier',
            id: dossier.id,
            title: dossier.reference || 'Brouillon',
            detail: assure ? displayName(assure) : 'Client inconnu',
            deletedAt: dossier.deletedAt,
            blocked: assure?.deletedAt ? 'Son client est dans la corbeille : restaurez le client.' : null,
            protected: isProtected(dossier),
          };
        });

      const loadingMore = search ? store._searchLoadingMore() : store._loadingMore();
      // Chargement initial ou recherche en attente : indicateur au lieu d'un « aucun élément » prématuré.
      const searching = store._searching();
      const loading = (kind: TrashKind) =>
        searching || (!search && !(kind === 'assure' ? store._deletedAssures() : store._deletedDossiers()).loaded);
      return [
        {
          kind: 'assure' as const,
          title: 'Clients',
          rows: clientRows,
          empty: 'Aucun client dans la corbeille.',
          hasMore: search ? search.hasMore.assure : store._deletedAssures().hasMore,
          loading: loading('assure'),
          loadingMore: loadingMore.assure,
          loadedCount: deletedAssures.length,
        },
        {
          kind: 'dossier' as const,
          title: 'Dossiers',
          rows: dossierRows,
          empty: 'Aucun dossier dans la corbeille.',
          hasMore: search ? search.hasMore.dossier : store._deletedDossiers().hasMore,
          loading: loading('dossier'),
          loadingMore: loadingMore.dossier,
          loadedCount: dossiers.length,
        },
      ];
    });

    return {
      visibleGroups: computed(() => {
        const words = normalize(store.query()).split(' ').filter(Boolean);
        const kind = store.kind();
        const days = store.period();
        const since = days ? daysAgo(days - 1) : 0;
        // Résultats Elasticsearch : déjà filtrés par le serveur (fautes de frappe comprises), sauf la période revue en direct.
        const fromSearch = !!store._search();
        const keep = (row: TrashRow) => {
          const text = normalize(`${row.title} ${row.detail}`);
          const deletedAt = row.deletedAt?.toMillis() ?? 0;
          return (fromSearch || words.every((word) => text.includes(word))) && deletedAt >= since;
        };
        return groups()
          .filter((group) => kind === 'all' || group.kind === kind)
          .map((group) => ({ ...group, rows: group.rows.filter(keep) }));
      }),
    };
  }),
  withMethods((store, service = inject(TrashService)) => {
    /** Restauration ou suppression définitive : la confirmation se referme, puis un message. */
    const run = rxMethod<{ action: Observable<unknown>; message: string }>(
      pipe(
        exhaustMap(({ action, message }) => {
          patchState(store, { busy: true });
          return action.pipe(
            tap(() => patchState(store, { busy: false, confirming: null, notice: { text: message, duration: 3000 } })),
            catchError((error) => {
              patchState(store, { busy: false, confirming: null, notice: { text: toBackendErrorMessage(error), duration: 5000 } });
              return EMPTY;
            }),
          );
        }),
      ),
    );

    return {
      clearNotice: () => patchState(store, { notice: null }),
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
  }),
);

/** Minuscules, sans accents ni espaces multiples (recherche). */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minuit local il y a `days` jours (setDate : juste lors d'un changement d'heure, contrairement à 24 h fixes). */
function daysAgo(days: number): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.getTime();
}
