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
      <h1><span class="h1-icon" aria-hidden="true"><mat-icon>groups</mat-icon></span>{{ structure.title }}</h1>
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
                  <td class="who">
                    <span class="avatar" [attr.data-hue]="hueOf(nameOf(assure))" aria-hidden="true">{{ initialsOf(nameOf(assure)) }}</span>
                    <span class="who-text">
                    <a [routerLink]="[detailBaseUrl(), assure.id]">{{ nameOf(assure) }}</a>
                    @if (assure.type === 'pro') {
                      <span class="sub">{{ assure.firstName }} {{ assure.lastName }}</span>
                    }
                    </span>
                  </td>
                  <td><span class="type" [class.pro]="assure.type === 'pro'">{{ typeLabels[assure.type] }}</span></td>
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
      border-bottom: 1px solid var(--ci-border);
    }

    th {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ci-text-muted);
    }

    .sub {
      display: block;
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .empty {
      padding: 32px 0;
      text-align: center;
      color: var(--ci-text-muted);
    }
  
    .avatar {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      font-size: 13px;
      font-weight: 600;
      color: var(--ci-navy-900);
      background: var(--ci-navy-100);
    }

    h1 {
      display: flex;
      align-items: center;
      gap: 12px;
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

    .who {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .who-text {
      min-width: 0;
    }

    .who a {
      font-weight: 600;
      color: var(--ci-navy-700);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    th {
      color: var(--ci-navy-800);
      background: var(--ci-navy-50);
    }

    tbody tr:hover {
      background: var(--ci-navy-50);
    }

    .type {
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      color: var(--ci-info);
      background: var(--ci-info-soft);

      &.pro {
        color: var(--st-tarification);
        background: var(--st-tarification-bg);
      }
    }

    @media (max-width: 600px) {
      .card {
        padding: 16px 12px;
      }
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

  protected initialsOf(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]!.toUpperCase())
      .join('');
  }

  /** Teinte stable (0-5) dérivée du nom, pour colorer l'avatar. */
  protected hueOf(name: string): number {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % 6;
  }
}
