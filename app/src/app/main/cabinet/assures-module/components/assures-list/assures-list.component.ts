import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Assure } from '@shared';
import { InfiniteScrollDirective } from '../../../../../core/directives/infinite-scroll.directive';
import { AssureFilters, DEFAULT_ASSURE_FILTERS } from '../../store/assures.store';
import { displayName } from '../../util/assures.utils';
import { ASSURES_STRUCTURE } from '../assures.structure';

/**
 * Liste des assurés (présentation CompliScan) : en-tête « Portefeuille », barre de filtres compacte,
 * tableau dans sa carte (nom en rose et email dessous) et défilement infini.
 */
@Component({
  selector: 'app-assures-list',
  imports: [RouterLink, MatButtonModule, MatIconModule, InfiniteScrollDirective],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">{{ structure.eyebrow }}</p>
        <h1>
          {{ structure.title }}
          @if (loaded()) {
            <span class="count">({{ total() }}{{ hasMore() ? '+' : '' }})</span>
          }
        </h1>
      </div>
      <a mat-flat-button class="ci-cta" [routerLink]="createUrl()">
        <mat-icon>add</mat-icon>
        {{ structure.create }}
      </a>
    </header>

    <section class="card toolbar" [attr.aria-label]="structure.filters.label">
      <label class="search">
        <mat-icon aria-hidden="true">search</mat-icon>
        <input
          type="search"
          [placeholder]="structure.searchPlaceholder"
          [attr.aria-label]="structure.search"
          [value]="query()"
          (input)="queryChanged.emit($any($event.target).value)"
        />
      </label>

      <select
        class="select"
        [attr.aria-label]="structure.filters.type"
        [value]="filters().type"
        (change)="filtersChanged.emit({ type: $any($event.target).value })"
      >
        <option value="all">{{ structure.filters.allTypes }}</option>
        @for (type of types; track type.value) {
          <option [value]="type.value">{{ type.label }}</option>
        }
      </select>

      <select
        class="select"
        [attr.aria-label]="structure.filters.sort"
        [value]="filters().sort"
        (change)="filtersChanged.emit({ sort: $any($event.target).value })"
      >
        <option value="name">{{ structure.filters.sortName }}</option>
        <option value="recent">{{ structure.filters.sortRecent }}</option>
      </select>

      @if (hasFilters()) {
        <button type="button" class="clear" (click)="filtersCleared.emit()">
          <mat-icon aria-hidden="true">filter_alt_off</mat-icon>{{ structure.filters.clear }}
        </button>
      }
    </section>

    <section class="card">
      <h2 class="card-title">{{ structure.eyebrow }}</h2>

      @if (!loaded()) {
        <p class="empty">{{ structure.loading }}</p>
      } @else if (assures().length) {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ structure.columns.name }}</th>
                <th>{{ structure.columns.type }}</th>
                <th>{{ structure.columns.identifier }}</th>
                <th>{{ structure.columns.phone }}</th>
                <th>{{ structure.columns.city }}</th>
              </tr>
            </thead>
            <tbody>
              @for (assure of assures(); track assure.id) {
                <tr [routerLink]="[detailBaseUrl(), assure.id]">
                  <td>
                    <div class="who">
                      <span class="avatar" aria-hidden="true">
                        <mat-icon>{{ assure.type === 'pro' ? 'apartment' : 'person' }}</mat-icon>
                      </span>
                      <span class="who-text">
                        <a [routerLink]="[detailBaseUrl(), assure.id]" (click)="$event.stopPropagation()">{{
                          nameOf(assure)
                        }}</a>
                        <span class="sub">{{ assure.email || '—' }}</span>
                      </span>
                    </div>
                  </td>
                  <td class="type">{{ typeLabels[assure.type] }}</td>
                  <td class="mono">{{ assure.siret || '—' }}</td>
                  <td>{{ assure.phone || '—' }}</td>
                  <td>{{ assure.address?.city || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="empty">{{ hasFilters() ? structure.noResult : structure.empty }}</p>
      }

      <div
        class="more"
        appInfiniteScroll
        [appInfiniteScrollDisabled]="!loaded() || !hasMore() || loadingMore()"
        [appInfiniteScrollCount]="loadedCount()"
        (reached)="loadMore.emit()"
      >
        @if (loaded() && hasMore()) {
          <span>{{ structure.loadingMore }}</span>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
    }

    .page-head {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: flex-end;
      justify-content: space-between;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--ci-border);
    }

    .eyebrow,
    .card-title {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .eyebrow {
      margin-bottom: 4px;
      color: var(--ci-pink);
    }

    h1 {
      display: flex;
      gap: 12px;
      align-items: baseline;
      margin: 0;
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--ci-navy-900);
    }

    .count {
      font-size: 18px;
      font-weight: 500;
      color: var(--ci-pink);
    }

    .card {
      border: 1px solid var(--ci-border);
      border-radius: 12px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
      overflow: hidden;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      padding: 16px 24px;
    }

    .search {
      display: flex;
      flex: 1 1 280px;
      gap: 8px;
      align-items: center;
      max-width: 520px;
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-bg);
      color: var(--ci-text-muted);

      &:focus-within {
        border-color: var(--ci-accent);
        box-shadow: 0 0 0 3px var(--ci-accent-soft);
      }

      mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }

      input {
        width: 100%;
        border: none;
        outline: none;
        background: transparent;
        font: inherit;
        font-size: 14px;
        color: var(--ci-text);
      }
    }

    .select,
    .clear {
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      color: var(--ci-text);
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--ci-accent);
        outline-offset: 1px;
      }
    }

    .clear {
      display: inline-flex;
      gap: 6px;
      align-items: center;

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    }

    .card-title {
      padding: 20px 24px;
      border-bottom: 1px solid var(--ci-border);
      color: var(--ci-text-muted);
    }

    .table-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 16px 20px;
      text-align: left;
      border-bottom: 1px solid var(--ci-border);
    }

    th {
      padding-top: 12px;
      padding-bottom: 12px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ci-text-muted);
      background: var(--ci-surface-2);
    }

    tbody tr {
      cursor: pointer;

      &:hover {
        background: var(--ci-surface-2);
      }
    }

    .who {
      display: flex;
      gap: 14px;
      align-items: center;
    }

    .avatar {
      display: grid;
      flex: none;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 1px solid var(--ci-border);
      border-radius: 50%;
      color: var(--ci-text-muted);
      background: var(--ci-surface-2);

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    }

    .who-text {
      display: grid;
      gap: 2px;
      min-width: 0;

      a {
        font-weight: 700;
        color: var(--ci-pink);
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }
    }

    .sub {
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .type {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .mono {
      font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
      color: var(--ci-text-muted);
    }

    .empty {
      margin: 0;
      padding: 40px 24px;
      text-align: center;
      color: var(--ci-text-muted);
    }

    .more {
      min-height: 1px;
      padding: 12px;
      text-align: center;
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    @media (max-width: 600px) {
      h1 {
        font-size: 24px;
      }

      .toolbar {
        padding: 12px;
      }

      .search,
      .select,
      .clear {
        flex: 1 1 100%;
        max-width: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssuresListComponent {
  /** Assurés chargés, filtrés. */
  readonly assures = input<Assure[]>([]);
  readonly total = input(0);
  readonly query = input('');
  readonly filters = input<AssureFilters>(DEFAULT_ASSURE_FILTERS);
  readonly hasFilters = input(false);
  readonly loaded = input(false);
  readonly createUrl = input('');
  readonly detailBaseUrl = input('');
  readonly queryChanged = output<string>();
  /** Firestore a d'autres éléments : la sentinelle de bas de liste demande la tranche suivante. */
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  /** Nombre d'éléments chargés (avant filtres) : relance la sentinelle tant qu'elle reste visible. */
  readonly loadedCount = input(0);
  readonly loadMore = output<void>();
  readonly filtersChanged = output<Partial<AssureFilters>>();
  readonly filtersCleared = output<void>();

  protected readonly structure = ASSURES_STRUCTURE.list;
  protected readonly typeLabels = ASSURES_STRUCTURE.typeLabels;
  protected readonly types = ASSURES_STRUCTURE.types;

  protected nameOf(assure: Assure): string {
    return displayName(assure);
  }
}
