import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Assure, Dossier, PROTECTED_DOSSIER_STATUSES } from '@shared';
import { catchError, combineLatest, debounceTime, distinctUntilChanged, map, Observable, of, switchMap, tap } from 'rxjs';
import { InfiniteScrollDirective } from '../../../../../core/directives/infinite-scroll.directive';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { displayName } from '../../../assures-module/util/assures.utils';
import { TrashKind, TrashService } from '../../services/trash.service';

/** Taille d'une tranche du défilement infini. */
const PAGE_SIZE = 20;

interface TrashRow {
  kind: TrashKind;
  id: string;
  title: string;
  detail: string;
  deletedAt: Dossier['deletedAt'];
  /** Raison pour laquelle l'élément ne peut pas être restauré seul (son client est dans la corbeille). */
  blocked: string | null;
  /** Proposition envoyée à l'assuré : jamais supprimé définitivement (seule la restauration reste possible). */
  protected: boolean;
}

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
  imports: [DatePipe, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule, InfiniteScrollDirective],
  template: `
    <header class="head">
      <h1>Corbeille</h1>
      <p class="sub">
        Les clients et dossiers supprimés restent ici jusqu'à leur restauration ou leur suppression définitive.
        Un client restauré revient avec les dossiers supprimés en même temps que lui.
      </p>
    </header>

    <div class="filters">
      <mat-form-field appearance="outline" class="search" subscriptSizing="dynamic">
        <mat-label>Rechercher</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input
          matInput
          type="search"
          [value]="query()"
          (input)="setQuery($any($event.target).value)"
          (keydown.escape)="setQuery('')"
        />
        <mat-hint>Nom du client ou référence du dossier</mat-hint>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Afficher</mat-label>
        <mat-select [value]="kind()" (selectionChange)="setKind($event.value)">
          <mat-option value="all">Tout</mat-option>
          <mat-option value="assure">Clients</mat-option>
          <mat-option value="dossier">Dossiers</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Supprimé</mat-label>
        <mat-select [value]="period()" (selectionChange)="setPeriod($event.value)">
          <mat-option [value]="0">À tout moment</mat-option>
          <mat-option [value]="1">Aujourd'hui</mat-option>
          <mat-option [value]="7">Ces 7 derniers jours</mat-option>
          <mat-option [value]="30">Ces 30 derniers jours</mat-option>
        </mat-select>
      </mat-form-field>

      @if (hasFilters()) {
        <button mat-button type="button" class="clear" (click)="clearFilters()">
          <mat-icon>filter_alt_off</mat-icon>Effacer les filtres
        </button>
      }
    </div>

    @if (loadError()) {
      <p class="banner error" role="alert">
        <mat-icon>error_outline</mat-icon>{{ loadError() }}
      </p>
    }
    @if (searchUnavailable()) {
      <p class="banner" role="status">
        <mat-icon>info</mat-icon>Recherche avancée indisponible : résultats limités aux éléments chargés.
      </p>
    }

    @for (group of visibleGroups(); track group.title) {
      <section class="card">
        <h2>{{ group.title }} ({{ group.rows.length }}{{ group.hasMore ? '+' : '' }})</h2>
        @if (group.rows.length) {
          <ul class="rows">
            @for (row of group.rows; track row.id) {
              <li>
                <div class="what">
                  <span class="title">{{ row.title }}</span>
                  <span class="detail">
                    {{ row.detail }} · Supprimé le {{ row.deletedAt?.toMillis() | date: 'dd/MM/y à HH:mm' }}
                  </span>
                  @if (row.blocked) {
                    <span class="detail">{{ row.blocked }}</span>
                  }
                  @if (row.protected) {
                    <span class="detail">Proposition envoyée : conservé, suppression définitive impossible.</span>
                  }
                </div>
                @if (confirming() === row.id) {
                  <span class="confirm" role="alert">
                    Supprimer définitivement « {{ row.title }} » ? Action irréversible.
                    <button
                      #cancelDelete
                      mat-button
                      type="button"
                      [attr.aria-label]="'Annuler la suppression définitive de ' + row.title"
                      (click)="confirming.set(null)"
                    >
                      Annuler
                    </button>
                    <button
                      mat-flat-button
                      class="danger"
                      type="button"
                      [disabled]="busy()"
                      [attr.aria-label]="'Confirmer la suppression définitive de ' + row.title"
                      (click)="deleteForever(row)"
                    >
                      Confirmer la suppression
                    </button>
                  </span>
                } @else {
                  <div class="actions">
                    <button
                      mat-stroked-button
                      type="button"
                      [disabled]="busy() || !!row.blocked"
                      [attr.aria-label]="'Restaurer ' + row.title"
                      (click)="restore(row)"
                    >
                      <mat-icon>restore_from_trash</mat-icon>Restaurer
                    </button>
                    @if (!row.protected) {
                      <button
                        mat-button
                        type="button"
                        class="danger-text"
                        [disabled]="busy()"
                        [attr.aria-label]="'Supprimer définitivement ' + row.title"
                        (click)="confirming.set(row.id)"
                      >
                        <mat-icon>delete_forever</mat-icon>Supprimer définitivement
                      </button>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        } @else if (group.loading) {
          <div class="loading" role="status"><mat-progress-spinner mode="indeterminate" diameter="24" />Chargement…</div>
        } @else if (!group.hasMore) {
          <p class="empty">{{ hasFilters() ? 'Aucun élément ne correspond aux filtres.' : group.empty }}</p>
        }
        <div
          class="more"
          appInfiniteScroll
          [appInfiniteScrollDisabled]="!group.hasMore || group.loadingMore"
          [appInfiniteScrollCount]="group.loadedCount"
          (reached)="loadMore(group.kind)"
        >
          @if (group.hasMore) {
            <span>Chargement de la suite…</span>
          }
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
    }

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    .sub {
      margin: 4px 0 0;
      color: var(--ci-text-muted);
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: flex-start;

      mat-form-field {
        width: 200px;
      }

      .search {
        flex: 1 1 280px;
        width: auto;
        max-width: 420px;
      }

      .clear {
        margin-top: 8px;
      }
    }

    @media (max-width: 600px) {
      .filters mat-form-field,
      .filters .search {
        flex: 1 1 100%;
        width: 100%;
        max-width: none;
      }
    }

    .card {
      padding: 20px 24px;
      border: 1px solid var(--ci-border);
      border-radius: 12px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    h2 {
      margin: 0 0 12px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ci-text-muted);
    }

    .rows {
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid var(--ci-border);

        &:last-child {
          border-bottom: 0;
        }
      }
    }

    .what {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .title {
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .detail {
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .actions,
    .confirm {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .banner {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 0;
      padding: 10px 14px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      color: var(--ci-text-muted);

      &.error {
        color: var(--ci-danger, #c62828);
        background: var(--ci-danger-soft, #fdecea);
      }
    }

    .loading {
      display: flex;
      gap: 8px;
      align-items: center;
      color: var(--ci-text-muted);
    }

    @media (max-width: 600px) {
      .confirm {
        flex-direction: column;
        align-items: stretch;
        width: 100%;
      }
    }

    .danger-text {
      color: var(--ci-danger, #c62828);
    }

    .danger {
      background: var(--ci-danger, #c62828);
      color: #fff;
    }

    .empty {
      margin: 0;
      color: var(--ci-text-muted);
    }

    .more {
      min-height: 1px;
      padding: 8px;
      text-align: center;
      font-size: 13px;
      color: var(--ci-text-muted);
    }
  `,
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
  protected readonly kind = signal<TrashKind | 'all'>('all');
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

  /** Bouton « Annuler » de la confirmation en ligne : reçoit le focus à l'ouverture (Entrée ne supprime pas par mégarde). */
  private readonly _cancelDelete = viewChild<ElementRef<HTMLButtonElement>>('cancelDelete');

  constructor() {
    effect(() => this._cancelDelete()?.nativeElement.focus());
  }

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

  protected setKind(kind: TrashKind | 'all'): void {
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

  protected readonly groups = computed(() => {
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
