import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Assure, Dossier } from '@shared';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';
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
}

/** Corbeille (admin) : clients et dossiers supprimés, à restaurer ou à supprimer définitivement. */
@Component({
  selector: 'app-trash-container',
  imports: [DatePipe, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, InfiniteScrollDirective],
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
        <input matInput type="search" [value]="query()" (input)="query.set($any($event.target).value)" />
        <mat-hint>Nom du client ou référence du dossier</mat-hint>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Afficher</mat-label>
        <mat-select [value]="kind()" (selectionChange)="kind.set($event.value)">
          <mat-option value="all">Tout</mat-option>
          <mat-option value="assure">Clients</mat-option>
          <mat-option value="dossier">Dossiers</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Supprimé</mat-label>
        <mat-select [value]="period()" (selectionChange)="period.set($event.value)">
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
                    {{ row.detail }} · supprimé le {{ row.deletedAt?.toMillis() | date: 'dd/MM/y à HH:mm' }}
                  </span>
                  @if (row.blocked) {
                    <span class="detail">{{ row.blocked }}</span>
                  }
                </div>
                @if (confirming() === row.id) {
                  <span class="confirm" role="alert">
                    Supprimer définitivement ? Action irréversible.
                    <button mat-button type="button" (click)="confirming.set(null)">Annuler</button>
                    <button mat-flat-button class="danger" type="button" [disabled]="busy()" (click)="deleteForever(row)">
                      Supprimer définitivement
                    </button>
                  </span>
                } @else {
                  <div class="actions">
                    <button mat-stroked-button type="button" [disabled]="busy() || !!row.blocked" (click)="restore(row)">
                      <mat-icon>restore_from_trash</mat-icon>Restaurer
                    </button>
                    <button mat-button type="button" class="danger-text" [disabled]="busy()" (click)="confirming.set(row.id)">
                      <mat-icon>delete_forever</mat-icon>Supprimer définitivement
                    </button>
                  </div>
                }
              </li>
            }
          </ul>
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

  /** Nombre d'éléments demandés à Firestore par groupe : grandit d'une tranche à chaque fin de défilement. */
  private readonly _limits = signal<Record<TrashKind, number>>({ assure: PAGE_SIZE, dossier: PAGE_SIZE });
  private readonly _loadingMore = signal<Record<TrashKind, boolean>>({ assure: false, dossier: false });

  private readonly _cabinetId$ = toObservable(this._auth.cabinetId);
  private readonly _deletedAssures = toSignal(
    combineLatest([this._cabinetId$, toObservable(computed(() => this._limits().assure))]).pipe(
      switchMap(([cabinetId, limit]) =>
        cabinetId ? this._service.watchDeletedAssures(cabinetId, limit) : of({ items: [] as Assure[], hasMore: false }),
      ),
      map((page) => (this._loadingMore.update((state) => ({ ...state, assure: false })), page)),
    ),
    { initialValue: { items: [] as Assure[], hasMore: false } },
  );
  private readonly _deletedDossiers = toSignal(
    combineLatest([this._cabinetId$, toObservable(computed(() => this._limits().dossier))]).pipe(
      switchMap(([cabinetId, limit]) =>
        cabinetId ? this._service.watchDeletedDossiers(cabinetId, limit) : of({ items: [] as Dossier[], hasMore: false }),
      ),
      map((page) => (this._loadingMore.update((state) => ({ ...state, dossier: false })), page)),
    ),
    { initialValue: { items: [] as Dossier[], hasMore: false } },
  );
  /** Clients des dossiers chargés, lus un par un (ils peuvent être actifs, donc hors de la liste des clients supprimés). */
  private readonly _dossierAssures = toSignal(
    combineLatest([
      this._cabinetId$,
      toObservable(computed(() => [...new Set(this._deletedDossiers().items.map((dossier) => dossier.assureId))].sort().join(','))),
    ]).pipe(
      distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
      switchMap(([cabinetId, ids]) =>
        cabinetId ? this._service.watchAssuresByIds(cabinetId, ids ? ids.split(',') : []) : of([] as Assure[]),
      ),
    ),
    { initialValue: [] as Assure[] },
  );

  protected loadMore(kind: TrashKind): void {
    const page = kind === 'assure' ? this._deletedAssures() : this._deletedDossiers();
    if (!page.hasMore || this._loadingMore()[kind]) return;
    this._loadingMore.update((state) => ({ ...state, [kind]: true }));
    this._limits.update((limits) => ({ ...limits, [kind]: limits[kind] + PAGE_SIZE }));
  }

  protected readonly groups = computed(() => {
    const deletedAssures = this._deletedAssures().items;
    const byId = new Map([...this._dossierAssures(), ...deletedAssures].map((assure) => [assure.id, assure]));
    const dossiers = this._deletedDossiers().items;

    const clientRows: TrashRow[] = deletedAssures
      .map((assure) => {
        const count = dossiers.filter((dossier) => dossier.deletedWith === assure.id).length;
        return {
          kind: 'assure',
          id: assure.id,
          title: displayName(assure),
          detail: count ? `avec ${count} dossier(s)` : 'sans dossier',
          deletedAt: assure.deletedAt,
          blocked: null,
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
      };
    });

    const loadingMore = this._loadingMore();
    return [
      {
        kind: 'assure' as const,
        title: 'Clients',
        rows: clientRows,
        empty: 'Aucun client dans la corbeille.',
        hasMore: this._deletedAssures().hasMore,
        loadingMore: loadingMore.assure,
        loadedCount: deletedAssures.length,
      },
      {
        kind: 'dossier' as const,
        title: 'Dossiers',
        rows: dossierRows,
        empty: 'Aucun dossier dans la corbeille.',
        hasMore: this._deletedDossiers().hasMore,
        loadingMore: loadingMore.dossier,
        loadedCount: dossiers.length,
      },
    ];
  });

  /** Filtres : texte (nom, référence, client), type d'élément, période de suppression en jours (0 = toutes). */
  protected readonly query = signal('');
  protected readonly kind = signal<TrashKind | 'all'>('all');
  protected readonly period = signal(0);
  protected readonly hasFilters = computed(() => !!this.query().trim() || this.kind() !== 'all' || this.period() > 0);

  protected readonly visibleGroups = computed(() => {
    const words = normalize(this.query()).split(' ').filter(Boolean);
    const kind = this.kind();
    const days = this.period();
    const since = days ? startOfDay(Date.now()) - (days - 1) * 86_400_000 : 0;
    const keep = (row: TrashRow) => {
      const text = normalize(`${row.title} ${row.detail}`);
      const deletedAt = row.deletedAt?.toMillis() ?? 0;
      return words.every((word) => text.includes(word)) && deletedAt >= since;
    };
    return this.groups()
      .filter((group) => kind === 'all' || group.kind === kind)
      .map((group) => ({ ...group, rows: group.rows.filter(keep) }));
  });

  protected clearFilters(): void {
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

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
