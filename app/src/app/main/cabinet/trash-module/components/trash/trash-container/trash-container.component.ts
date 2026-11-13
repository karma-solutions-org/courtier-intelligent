import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Assure, Dossier, PROTECTED_DOSSIER_STATUSES } from '@shared';
import { catchError, combineLatest, debounceTime, distinctUntilChanged, map, Observable, of, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../../commons/authentication-module/store/auth.store';
import { displayName } from '../../../../assures-module/util/assures.utils';
import { TrashGroup, TrashKindFilter, TrashRow } from '../../../models/trash.model';
import { TrashKind, TrashService } from '../../../services/trash.service';
import { TrashPresentationComponent } from '../trash-presentation/trash-presentation.component';

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

/** Corbeille (admin) : clients et dossiers supprimés, à restaurer ou à supprimer définitivement. */
@Component({
  selector: 'app-trash-container',
  imports: [TrashPresentationComponent],
  templateUrl: './trash-container.component.html',
  styleUrl: './trash-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashContainerComponent {
  private readonly _service = inject(TrashService);
  private readonly _auth = inject(AuthStore);
  private readonly _snackBar = inject(MatSnackBar);
  protected readonly busy = signal(false);
  protected readonly confirming = signal<string | null>(null);

  /** Filtres : texte (nom, référence, client), type d'élément, période de suppression en jours (0 = toutes). */
  protected readonly query = signal('');
  protected readonly kind = signal<TrashKindFilter>('all');
  protected readonly period = signal(0);
  protected readonly hasFilters = computed(() => !!this.query().trim() || this.kind() !== 'all' || this.period() > 0);

  /** Erreur de lecture Firestore (droits, réseau) : affichée en bandeau au lieu d'une liste vide trompeuse. */
  protected readonly loadError = signal<string | null>(null);
  /** Elasticsearch en échec : filtrage local des tranches chargées. */
  protected readonly searchUnavailable = signal(false);
  /** Recherche en cours (frappe en attente ou réponse attendue). */
  private readonly _searching = signal(false);

  /** Nombre d'éléments demandés à Firestore par groupe : grandit d'une tranche à chaque fin de défilement. */
  private readonly _limits = signal<Record<TrashKind, number>>(EMPTY_LIMITS);
  private readonly _loadingMore = signal<Record<TrashKind, boolean>>(NOT_LOADING);

  private readonly _cabinetId$ = toObservable(this._auth.cabinetId);
  private readonly _deletedAssures = toSignal(
    combineLatest([this._cabinetId$, toObservable(computed(() => this._limits().assure))]).pipe(
      switchMap(([cabinetId, limit]) =>
        cabinetId
          ? this._service.watchDeletedAssures(cabinetId, limit).pipe(this._orEmpty<Assure>())
          : of({ items: [] as Assure[], hasMore: false }),
      ),
      map((page): TrashPage<Assure> => (this._loadingMore.update((state) => ({ ...state, assure: false })), { ...page, loaded: true })),
    ),
    { initialValue: { items: [], hasMore: false, loaded: false } as TrashPage<Assure> },
  );
  private readonly _deletedDossiers = toSignal(
    combineLatest([this._cabinetId$, toObservable(computed(() => this._limits().dossier))]).pipe(
      switchMap(([cabinetId, limit]) =>
        cabinetId
          ? this._service.watchDeletedDossiers(cabinetId, limit).pipe(this._orEmpty<Dossier>())
          : of({ items: [] as Dossier[], hasMore: false }),
      ),
      map((page): TrashPage<Dossier> => (this._loadingMore.update((state) => ({ ...state, dossier: false })), { ...page, loaded: true })),
    ),
    { initialValue: { items: [], hasMore: false, loaded: false } as TrashPage<Dossier> },
  );
  /** Nombre de résultats demandés à Elasticsearch par type : grandit d'une tranche à chaque fin de défilement. */
  private readonly _searchLimits = signal<Record<TrashKind, number>>(EMPTY_LIMITS);
  private readonly _searchLoadingMore = signal<Record<TrashKind, boolean>>(NOT_LOADING);
  private readonly _filters = computed(() => ({ q: this.query().trim(), kind: this.kind(), period: this.period() }), {
    equal: (a, b) => a.q === b.q && a.kind === b.kind && a.period === b.period,
  });
  /**
   * Recherche Elasticsearch dès qu'un filtre est actif (300 ms après la dernière frappe) : couvre toute la corbeille,
   * pas seulement les tranches chargées. Une requête par type pour savoir s'il reste des clients et des dossiers.
   * switchMap ignore les réponses d'une recherche dépassée. Échec : filtre local et message.
   */
  private readonly _search = toSignal(
    combineLatest([this._cabinetId$, toObservable(this._filters), toObservable(this._searchLimits)]).pipe(
      tap(([cabinetId, { q, kind, period }]) => this._searching.set(!!cabinetId && (!!q || kind !== 'all' || !!period))),
      debounceTime(300),
      switchMap(([cabinetId, { q, kind, period }, limits]) => {
        if (!cabinetId || (!q && kind === 'all' && !period)) return of(null);
        const from = period ? daysAgo(period - 1) : undefined;
        const kinds: TrashKind[] = kind === 'all' ? ['assure', 'dossier'] : [kind];
        return combineLatest(kinds.map((k) => this._searchKind(cabinetId, k, q, from, limits[k]))).pipe(
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
        this._searching.set(false);
        this._searchLoadingMore.set(NOT_LOADING);
      }),
    ),
    { initialValue: null as TrashSearch | null },
  );

  /** Clients des dossiers chargés (ils peuvent être actifs, donc hors de la liste des clients supprimés). */
  private readonly _dossierAssures = toSignal(
    combineLatest([
      this._cabinetId$,
      toObservable(
        computed(() =>
          [...new Set([...this._deletedDossiers().items, ...(this._search()?.dossiers ?? [])].map((dossier) => dossier.assureId))]
            .sort()
            .join(','),
        ),
      ),
    ]).pipe(
      distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
      switchMap(([cabinetId, ids]) =>
        cabinetId
          ? this._service.watchAssuresByIds(cabinetId, ids ? ids.split(',') : []).pipe(catchError(() => of([] as Assure[])))
          : of([] as Assure[]),
      ),
    ),
    { initialValue: [] as Assure[] },
  );

  /** Lecture Firestore en échec : bandeau d'erreur et groupe vide (au lieu d'un écran figé). */
  private _orEmpty<T>() {
    return catchError<{ items: T[]; hasMore: boolean }, Observable<{ items: T[]; hasMore: boolean }>>((error) => {
      this.loadError.set(`Impossible de charger la corbeille : ${toBackendErrorMessage(error)}`);
      return of({ items: [] as T[], hasMore: false });
    });
  }

  /** Recherche d'un type ; null si Elasticsearch ou la lecture des fiches échoue. */
  private _searchKind(cabinetId: string, kind: TrashKind, q: string, from: number | undefined, size: number) {
    return this._service.search({ q, kind: kind === 'assure' ? 'client' : 'dossier', from, size }).pipe(
      switchMap((items) => {
        const ids = items.map((item) => item.id);
        const hasMore = items.length >= size;
        return kind === 'assure'
          ? this._service.watchAssuresByIds(cabinetId, ids).pipe(
              map((assures) => ({ kind, assures: assures.filter((assure) => !!assure.deletedAt), dossiers: [] as Dossier[], hasMore })),
            )
          : this._service
              .watchDeletedDossiersByIds(cabinetId, ids)
              .pipe(map((dossiers) => ({ kind, assures: [] as Assure[], dossiers, hasMore })));
      }),
      tap(() => this.searchUnavailable.set(false)),
      catchError(() => {
        this.searchUnavailable.set(true);
        return of(null);
      }),
    );
  }

  protected setQuery(query: string): void {
    this.query.set(query);
    this._searchLimits.set(EMPTY_LIMITS);
  }

  protected setKind(kind: TrashKindFilter): void {
    this.kind.set(kind);
    this._searchLimits.set(EMPTY_LIMITS);
  }

  protected setPeriod(period: number): void {
    this.period.set(period);
    this._searchLimits.set(EMPTY_LIMITS);
  }

  protected loadMore(kind: TrashKind): void {
    const search = this._search();
    if (search) {
      if (!search.hasMore[kind] || this._searchLoadingMore()[kind]) return;
      this._searchLoadingMore.update((state) => ({ ...state, [kind]: true }));
      this._searchLimits.update((limits) => ({ ...limits, [kind]: limits[kind] + PAGE_SIZE }));
      return;
    }
    const page = kind === 'assure' ? this._deletedAssures() : this._deletedDossiers();
    if (!page.hasMore || this._loadingMore()[kind]) return;
    this._loadingMore.update((state) => ({ ...state, [kind]: true }));
    this._limits.update((limits) => ({ ...limits, [kind]: limits[kind] + PAGE_SIZE }));
  }

  protected readonly groups = computed((): TrashGroup[] => {
    const search = this._search();
    const deletedAssures = search ? search.assures : this._deletedAssures().items;
    const byId = new Map([...this._dossierAssures(), ...deletedAssures].map((assure) => [assure.id, assure]));
    const dossiers = search ? search.dossiers : this._deletedDossiers().items;
    // Dossiers connus (tranche chargée et résultats) : compte et protection des clients.
    const known = new Map([...this._deletedDossiers().items, ...(search?.dossiers ?? [])].map((dossier) => [dossier.id, dossier]));
    const isProtected = (dossier: Dossier) => PROTECTED_DOSSIER_STATUSES.includes(dossier.status);

    const clientRows: TrashRow[] = deletedAssures
      .map((assure) => {
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
    const dossierRows: TrashRow[] = dossiers.filter((dossier) => !dossier.deletedWith).map((dossier) => {
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

    const loadingMore = search ? this._searchLoadingMore() : this._loadingMore();
    // Chargement initial ou recherche en attente : indicateur au lieu d'un « aucun élément » prématuré.
    const searching = this._searching();
    const loading = (kind: TrashKind) =>
      searching || (!search && !(kind === 'assure' ? this._deletedAssures() : this._deletedDossiers()).loaded);
    return [
      {
        kind: 'assure' as const,
        title: 'Clients',
        rows: clientRows,
        empty: 'Aucun client dans la corbeille.',
        hasMore: search ? search.hasMore.assure : this._deletedAssures().hasMore,
        loading: loading('assure'),
        loadingMore: loadingMore.assure,
        loadedCount: deletedAssures.length,
      },
      {
        kind: 'dossier' as const,
        title: 'Dossiers',
        rows: dossierRows,
        empty: 'Aucun dossier dans la corbeille.',
        hasMore: search ? search.hasMore.dossier : this._deletedDossiers().hasMore,
        loading: loading('dossier'),
        loadingMore: loadingMore.dossier,
        loadedCount: dossiers.length,
      },
    ];
  });

  protected readonly visibleGroups = computed(() => {
    const words = normalize(this.query()).split(' ').filter(Boolean);
    const kind = this.kind();
    const days = this.period();
    const since = days ? daysAgo(days - 1) : 0;
    // Résultats Elasticsearch : déjà filtrés par le serveur (fautes de frappe comprises), sauf la période revue en direct.
    const fromSearch = !!this._search();
    const keep = (row: TrashRow) => {
      const text = normalize(`${row.title} ${row.detail}`);
      const deletedAt = row.deletedAt?.toMillis() ?? 0;
      return (fromSearch || words.every((word) => text.includes(word))) && deletedAt >= since;
    };
    return this.groups()
      .filter((group) => kind === 'all' || group.kind === kind)
      .map((group) => ({ ...group, rows: group.rows.filter(keep) }));
  });

  protected clearFilters(): void {
    this._searchLimits.set(EMPTY_LIMITS);
    this.query.set('');
    this.kind.set('all');
    this.period.set(0);
  }

  protected restore(row: TrashRow): void {
    this._run(this._service.restore(row.kind, row.id), row.kind === 'assure' ? 'Client restauré.' : 'Dossier restauré.');
  }

  protected deleteForever(row: TrashRow): void {
    this._run(this._service.deleteForever(row.kind, row.id), 'Supprimé définitivement.');
  }

  private _run(action: ReturnType<TrashService['restore']>, message: string): void {
    this.busy.set(true);
    action.subscribe({
      next: () => {
        this.busy.set(false);
        this.confirming.set(null);
        this._snackBar.open(message, undefined, { duration: 3000 });
      },
      error: (error) => {
        this.busy.set(false);
        this.confirming.set(null);
        this._snackBar.open(toBackendErrorMessage(error), undefined, { duration: 5000 });
      },
    });
  }
}

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
