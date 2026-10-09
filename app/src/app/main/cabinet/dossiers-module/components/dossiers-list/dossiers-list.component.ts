import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { Dossier, DOSSIER_STATUS_LABELS, DossierStatus } from '@shared';
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

/** Liste des dossiers : filtres (statut, produit, courtier, « Mes dossiers »), tableau et pagination. */
@Component({
  selector: 'app-dossiers-list',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatPaginatorModule,
    MatSelectModule,
    MatSlideToggleModule,
    StatusChipComponent,
  ],
  template: `
    <header>
      <h1>{{ structure.title }}</h1>
      <a mat-flat-button [routerLink]="createUrl()">
        <mat-icon>add</mat-icon>
        {{ structure.create }}
      </a>
    </header>

    <section class="card">
      <div class="filters">
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
        <p class="empty">{{ hasFilter() ? structure.noResult : structure.empty }}</p>
      }

      <mat-paginator
        [length]="total()"
        [pageIndex]="pageIndex()"
        [pageSize]="pageSize()"
        [pageSizeOptions]="pageSizeOptions()"
        [attr.aria-label]="structure.pageSize"
        (page)="pageChanged.emit($event)"
      />
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
      font-size: 26px;
      font-weight: 600;
    }

    .card {
      padding: 24px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
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
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    th {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mat-sys-on-surface-variant);
    }

    .resume {
      margin-left: 10px;
      font-size: 13px;
    }

    .empty {
      padding: 32px 0;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
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
  readonly pageIndex = input(0);
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<number[]>([10, 25, 50]);
  readonly loaded = input(false);
  readonly createUrl = input('');
  readonly baseUrl = input('');
  readonly filterChanged = output<Partial<DossierFilter>>();
  readonly filterReset = output<void>();
  readonly pageChanged = output<PageEvent>();

  protected readonly structure = DOSSIERS_STRUCTURE.list;
  protected readonly statuses: DossierStatus[] = STATUS_ORDER;
  protected readonly statusLabels = DOSSIER_STATUS_LABELS;

  protected hasFilter(): boolean {
    const { status, productId, assignedTo, mine } = this.filter();
    return !!status || !!productId || !!assignedTo || mine;
  }

  protected isDefault(): boolean {
    return isDefaultFilter(this.filter());
  }
}
