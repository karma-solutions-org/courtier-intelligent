import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { Dossier, DOSSIER_STATUS_LABELS, DossierStatus } from '@shared';
import { InfiniteScrollDirective } from '../../../../../core/directives/infinite-scroll.directive';
import { DossierFilter, isDefaultFilter, STATUS_ORDER } from '../../util/dossiers.utils';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';
import { StatusChipComponent } from '../status-chip/status-chip.component';

/** Une ligne de la liste : le dossier et les noms déjà résolus (assuré, produit, courtier). */
export interface DossierRow {
  dossier: Dossier;
  assureName: string;
  productName: string;
  courtierName: string;
}

export interface Option {
  id: string;
  label: string;
}

/** Liste des dossiers : filtres (statut, produit, courtier, « Mes dossiers »), tableau et défilement infini. */
@Component({
  selector: 'app-dossiers-list',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    StatusChipComponent,
    InfiniteScrollDirective,
  ],
  template: `
    <header>
      <h1><span class="h1-icon" aria-hidden="true"><mat-icon>folder_copy</mat-icon></span>{{ structure.title }}</h1>
      <a mat-flat-button [routerLink]="createUrl()">
        <mat-icon>add</mat-icon>
        {{ structure.create }}
      </a>
    </header>

    <section class="card">
      <div class="filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ structure.search }}</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input
            matInput
            type="search"
            [value]="filter().query"
            [placeholder]="structure.searchHint"
            (input)="filterChanged.emit({ query: $any($event.target).value })"
            (keydown.escape)="filterChanged.emit({ query: '' })"
          />
          @if (searching()) {
            <mat-hint>{{ structure.searching }}</mat-hint>
          } @else if (searchUnavailable()) {
            <mat-hint>{{ structure.searchUnavailable }}</mat-hint>
          }
        </mat-form-field>
        <mat-slide-toggle [checked]="filter().mine" (change)="filterChanged.emit({ mine: $event.checked })">
          {{ structure.mine }}
        </mat-slide-toggle>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ structure.filters.status }}</mat-label>
          <mat-select [value]="filter().status" (selectionChange)="filterChanged.emit({ status: $event.value })">
            <mat-option value="">{{ structure.filters.all }}</mat-option>
            @for (status of statuses; track status) {
              <mat-option [value]="status">{{ statusLabels[status] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ structure.filters.product }}</mat-label>
          <mat-select [value]="filter().productId" (selectionChange)="filterChanged.emit({ productId: $event.value })">
            <mat-option value="">{{ structure.filters.allProducts }}</mat-option>
            @for (product of products(); track product.id) {
              <mat-option [value]="product.id">{{ product.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ structure.filters.courtier }}</mat-label>
          <mat-select
            [value]="filter().mine ? '' : filter().assignedTo"
            [disabled]="filter().mine"
            (selectionChange)="filterChanged.emit({ assignedTo: $event.value })"
          >
            <mat-option value="">{{ structure.filters.allCourtiers }}</mat-option>
            @for (member of courtiers(); track member.id) {
              <mat-option [value]="member.id">{{ member.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (!isDefault()) {
          <button mat-button type="button" (click)="filterReset.emit()">{{ structure.reset }}</button>
        }
      </div>

      @if (!loaded()) {
        <p class="empty">{{ structure.loading }}</p>
      } @else if (rows().length) {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ structure.columns.reference }}</th>
                <th>{{ structure.columns.assure }}</th>
                <th>{{ structure.columns.product }}</th>
                <th>{{ structure.columns.status }}</th>
                <th>{{ structure.columns.courtier }}</th>
                <th>{{ structure.columns.createdAt }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.dossier.id) {
                <tr>
                  <td>
                    <a [routerLink]="[baseUrl(), row.dossier.id]">{{ row.dossier.reference || '—' }}</a>
                    @if (row.dossier.status === 'brouillon') {
                      <a class="resume" [routerLink]="[baseUrl(), row.dossier.id, 'brouillon']">{{ structure.resume }}</a>
                    }
                  </td>
                  <td>{{ row.assureName }}</td>
                  <td>{{ row.productName }}</td>
                  <td><app-status-chip [status]="row.dossier.status" /></td>
                  <td>{{ row.courtierName }}</td>
                  <td>{{ row.dossier.createdAt?.toMillis() | date: 'd MMM y' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-wrap"><svg class="empty-art" viewBox="0 0 120 80" aria-hidden="true"><rect x="30" y="14" width="60" height="50" rx="8" fill="#fff" stroke="#d1d5db" stroke-width="2"/><rect x="40" y="26" width="30" height="5" rx="2.5" fill="#d1d5db"/><rect x="40" y="37" width="40" height="4" rx="2" fill="#e5e7eb"/><rect x="40" y="46" width="24" height="4" rx="2" fill="#e5e7eb"/></svg><p class="empty">{{ hasFilter() ? structure.noResult : structure.empty }}</p></div>
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
      display: block;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
    }

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    .card {
      padding: 24px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 16px;
      margin-bottom: 16px;

      mat-form-field {
        width: 190px;
      }
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
      padding: 12px 8px;
      text-align: left;
      border-bottom: 1px solid var(--ci-border);
    }

    th {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ci-text-muted);
    }

    .resume {
      margin-left: 10px;
      font-size: 13px;
    }

    .empty {
      padding: 32px 0;
      text-align: center;
      color: var(--ci-text-muted);
    }
  
    h1 {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
    }

    .h1-icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      color: var(--ci-navy-900);
      background: var(--ci-navy-50);
    }

    header {
      flex-wrap: wrap;
    }

    .card {
      box-shadow: var(--ci-shadow-sm);
    }

    .filters {
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid var(--ci-border);
      background: var(--ci-surface-2);
    }

    th {
      color: var(--ci-navy-800);
      background: var(--ci-navy-50);

      &:first-child {
        border-radius: 10px 0 0 10px;
      }

      &:last-child {
        border-radius: 0 10px 10px 0;
      }
    }

    th,
    td {
      border-bottom-color: var(--ci-border);
    }

    tbody tr {
      transition: background 0.15s;

      &:hover {
        background: var(--ci-navy-50);
      }
    }

    td a:first-child {
      font-weight: 600;
      color: var(--ci-navy-700);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    .resume {
      padding: 2px 8px;
      border-radius: 999px;
      font-weight: 600;
      color: var(--ci-warning);
      background: var(--ci-warning-soft);
      text-decoration: none;
    }

    .empty-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 16px;
    }

    .empty-art {
      width: 140px;
      height: 92px;
    }

    .more {
      min-height: 1px;
      padding: 12px;
      text-align: center;
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .empty-wrap .empty {
      padding-top: 8px;
    }

    @media (max-width: 600px) {
      .card {
        padding: 16px 12px;
      }

      .filters mat-form-field {
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossiersListComponent {
  readonly rows = input<DossierRow[]>([]);
  readonly total = input(0);
  readonly filter = input.required<DossierFilter>();
  readonly products = input<Option[]>([]);
  readonly courtiers = input<Option[]>([]);
  readonly loaded = input(false);
  readonly createUrl = input('');
  readonly baseUrl = input('');
  readonly filterChanged = output<Partial<DossierFilter>>();
  readonly filterReset = output<void>();
  /** Firestore a d'autres éléments : la sentinelle de bas de liste demande la tranche suivante. */
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  /** Recherche Elasticsearch en cours. */
  readonly searching = input(false);
  /** Elasticsearch en échec : résultats limités aux dossiers chargés. */
  readonly searchUnavailable = input(false);
  /** Nombre d'éléments chargés (avant filtres) : relance la sentinelle tant qu'elle reste visible. */
  readonly loadedCount = input(0);
  readonly loadMore = output<void>();

  protected readonly structure = DOSSIERS_STRUCTURE.list;
  protected readonly statuses: DossierStatus[] = STATUS_ORDER;
  protected readonly statusLabels = DOSSIER_STATUS_LABELS;

  protected hasFilter(): boolean {
    const { status, productId, assignedTo, mine, query } = this.filter();
    return !!status || !!productId || !!assignedTo || mine || !!query.trim();
  }

  protected isDefault(): boolean {
    return isDefaultFilter(this.filter());
  }
}
