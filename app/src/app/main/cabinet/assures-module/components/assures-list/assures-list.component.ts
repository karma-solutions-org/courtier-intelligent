import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { Assure } from '@shared';
import { displayName } from '../../util/assures.utils';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Liste des assurés : recherche, tableau et pagination. */
@Component({
  selector: 'app-assures-list',
  imports: [RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule],
  template: `
    <header>
      <h1>{{ structure.title }}</h1>
      <a mat-flat-button [routerLink]="createUrl()">
        <mat-icon>add</mat-icon>
        {{ structure.create }}
      </a>
    </header>

    <section class="card">
      <mat-form-field appearance="outline" class="search" subscriptSizing="dynamic">
        <mat-label>{{ structure.search }}</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput type="search" [value]="query()" (input)="queryChanged.emit($any($event.target).value)" />
        <mat-hint>{{ structure.searchHint }}</mat-hint>
      </mat-form-field>

      @if (!loaded()) {
        <p class="empty">{{ structure.loading }}</p>
      } @else if (assures().length) {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ structure.columns.name }}</th>
                <th>{{ structure.columns.type }}</th>
                <th>{{ structure.columns.email }}</th>
                <th>{{ structure.columns.phone }}</th>
                <th>{{ structure.columns.city }}</th>
              </tr>
            </thead>
            <tbody>
              @for (assure of assures(); track assure.id) {
                <tr>
                  <td>
                    <a [routerLink]="[detailBaseUrl(), assure.id]">{{ nameOf(assure) }}</a>
                    @if (assure.type === 'pro') {
                      <span class="sub">{{ assure.firstName }} {{ assure.lastName }}</span>
                    }
                  </td>
                  <td>{{ typeLabels[assure.type] }}</td>
                  <td>{{ assure.email || '—' }}</td>
                  <td>{{ assure.phone || '—' }}</td>
                  <td>{{ assure.address?.city || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="empty">{{ query() ? structure.noResult : structure.empty }}</p>
      }

      <mat-paginator
        [length]="total()"
        [pageIndex]="pageIndex()"
        [pageSize]="pageSize()"
        [pageSizeOptions]="pageSizeOptions()"
        [hidePageSize]="false"
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

    .search {
      width: 100%;
      max-width: 480px;
      margin-bottom: 16px;
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

    .sub {
      display: block;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty {
      padding: 32px 0;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssuresListComponent {
  /** Assurés de la page courante. */
  readonly assures = input<Assure[]>([]);
  readonly total = input(0);
  readonly query = input('');
  readonly pageIndex = input(0);
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<number[]>([10, 25, 50]);
  readonly loaded = input(false);
  readonly createUrl = input('');
  readonly detailBaseUrl = input('');
  readonly queryChanged = output<string>();
  readonly pageChanged = output<PageEvent>();

  protected readonly structure = ASSURES_STRUCTURE.list;
  protected readonly typeLabels = ASSURES_STRUCTURE.typeLabels;

  protected nameOf(assure: Assure): string {
    return displayName(assure);
  }
}
