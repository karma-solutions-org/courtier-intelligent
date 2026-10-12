import { DatePipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Dossier, DOSSIER_STATUS_LABELS, DossierStatus } from '@shared';
import { StatusChipComponent } from '../../../dossiers-module/components/status-chip/status-chip.component';
import { STATUS_ORDER } from '../../../dossiers-module/util/dossiers.utils';
import { ConversionRate } from '../../util/dashboard.utils';
import { DASHBOARD_STRUCTURE } from '../dashboard.structure';

/** Une ligne de dossier du tableau de bord, noms déjà résolus. */
export interface DashboardDossierRow {
  dossier: Dossier;
  assureName: string;
  productName: string;
}

/** Une ligne de taux de conversion, nom déjà résolu. */
export interface ConversionRow extends ConversionRate {
  name: string;
}

/** Tableau de bord : compteurs par statut, dossiers à traiter, relances et (admin) taux de conversion. */
@Component({
  selector: 'app-dashboard-presentation',
  imports: [DatePipe, PercentPipe, RouterLink, MatIconModule, StatusChipComponent],
  template: `
    @if (!loaded()) {
      <p class="muted">{{ structure.loading }}</p>
    } @else {
      <section>
        <h2>{{ structure.counters.title }}</h2>
        <div class="counters">
          @for (status of statuses; track status) {
            <a
              class="counter"
              [attr.data-status]="status"
              [routerLink]="dossiersUrl()"
              [queryParams]="{ statut: status }"
              [attr.aria-label]="statusLabels[status] + ' : ' + counts()[status] + ' — ' + structure.counters.hint"
            >
              <span class="count">{{ counts()[status] }}</span>
              <span class="label">{{ statusLabels[status] }}</span>
            </a>
          }
        </div>
      </section>

      <div class="columns">
        <section class="card card--process">
          <h2><mat-icon aria-hidden="true">assignment</mat-icon>{{ structure.toProcess.title }}</h2>
          @if (toProcess().length) {
            <ul class="rows">
              @for (row of toProcess(); track row.dossier.id) {
                <li>
                  <a [routerLink]="dossierLink(row.dossier)">{{ row.dossier.reference || '—' }}</a>
                  <span class="name">{{ row.assureName }} · {{ row.productName }}</span>
                  <app-status-chip [status]="row.dossier.status" />
                </li>
              }
            </ul>
          } @else {
            <div class="empty"><svg class="empty-art" viewBox="0 0 120 80" aria-hidden="true"><rect x="30" y="14" width="60" height="50" rx="8" fill="#fff" stroke="#d1d5db" stroke-width="2"/><rect x="40" y="26" width="30" height="5" rx="2.5" fill="#d1d5db"/><rect x="40" y="37" width="40" height="4" rx="2" fill="#e5e7eb"/><rect x="40" y="46" width="24" height="4" rx="2" fill="#e5e7eb"/></svg><p class="muted">{{ structure.toProcess.empty }}</p></div>
          }
        </section>

        <section class="card card--follow">
          <h2><mat-icon aria-hidden="true">schedule_send</mat-icon>{{ structure.followUp.title }}</h2>
          <p class="hint">{{ structure.followUp.hint }}</p>
          @if (toFollowUp().length) {
            <ul class="rows">
              @for (row of toFollowUp(); track row.dossier.id) {
                <li>
                  <a [routerLink]="dossierLink(row.dossier)">{{ row.dossier.reference || '—' }}</a>
                  <span class="name">{{ row.assureName }} · {{ row.productName }}</span>
                  <span class="date">
                    {{ structure.followUp.sentOn }} {{ row.dossier.proposal?.sentAt?.toMillis() | date: 'd MMM y' }}
                  </span>
                </li>
              }
            </ul>
          } @else {
            <div class="empty"><svg class="empty-art" viewBox="0 0 120 80" aria-hidden="true"><rect x="30" y="14" width="60" height="50" rx="8" fill="#fff" stroke="#d1d5db" stroke-width="2"/><rect x="40" y="26" width="30" height="5" rx="2.5" fill="#d1d5db"/><rect x="40" y="37" width="40" height="4" rx="2" fill="#e5e7eb"/><rect x="40" y="46" width="24" height="4" rx="2" fill="#e5e7eb"/></svg><p class="muted">{{ structure.followUp.empty }}</p></div>
          }
        </section>
      </div>

      @if (isAdmin()) {
        <section class="card card--conversion">
          <h2><mat-icon aria-hidden="true">insights</mat-icon>{{ structure.conversion.title }}</h2>
          <p class="hint">{{ structure.conversion.hint }}</p>
          <div class="columns">
            @for (table of conversionTables(); track table.title) {
              <div>
                <h3>{{ table.title }}</h3>
                @if (table.rows.length) {
                  <table>
                    <thead>
                      <tr>
                        <th>{{ structure.conversion.columns.name }}</th>
                        <th class="num">{{ structure.conversion.columns.closed }}</th>
                        <th class="num">{{ structure.conversion.columns.souscrit }}</th>
                        <th class="num">{{ structure.conversion.columns.rate }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of table.rows; track row.key) {
                        <tr>
                          <td>{{ row.name }}</td>
                          <td class="num">{{ row.closed }}</td>
                          <td class="num">{{ row.souscrit }}</td>
                          <td class="num">
                            <span class="rate-cell">
                              <span class="bar" aria-hidden="true"
                                ><span [class]="rateClass(row.rate ?? 0)" [style.width.%]="(row.rate ?? 0) * 100"></span
                              ></span>
                              <span class="rate">{{ row.rate | percent: '1.0-0' }}</span>
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                } @else {
                  <div class="empty"><svg class="empty-art" viewBox="0 0 120 80" aria-hidden="true"><rect x="30" y="14" width="60" height="50" rx="8" fill="#fff" stroke="#d1d5db" stroke-width="2"/><rect x="40" y="26" width="30" height="5" rx="2.5" fill="#d1d5db"/><rect x="40" y="37" width="40" height="4" rx="2" fill="#e5e7eb"/><rect x="40" y="46" width="24" height="4" rx="2" fill="#e5e7eb"/></svg><p class="muted">{{ structure.conversion.empty }}</p></div>
                }
              </div>
            }
          </div>
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      font-size: 16px;
      font-weight: 600;

      mat-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        font-size: 20px;
        color: var(--ci-text-muted);
      }
    }

    h3 {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 600;
      color: var(--ci-text-muted);
    }

    .counters {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
    }

    .counter {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 14px 16px;
      border-radius: 8px;
      text-decoration: none;
      color: var(--ci-text);
      background: var(--ci-surface);
      border: 1px solid var(--ci-border);
      box-shadow: var(--ci-shadow-sm);
      transition: border-color 0.15s;
    }

    .counter:hover {
      border-color: #cbd2dc;
    }

    .counter:focus-visible {
      outline: 2px solid var(--ci-accent);
      outline-offset: 2px;
    }

    .count {
      order: 2;
      font-size: 24px;
      font-weight: 600;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
      color: var(--ci-text);
    }

    .label {
      order: 1;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--ci-text-muted);

      &::before {
        content: '';
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--st-dot);
      }
    }

    .columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
      gap: 24px;
    }

    .card {
      min-width: 0;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid var(--ci-border);
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    .rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .rows li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
      margin: 0 -8px;
      padding: 10px 8px;
      border-radius: 6px;
      border-bottom: 1px solid var(--ci-border);
      transition: background 0.15s;
    }

    .rows li:hover {
      background: var(--ci-surface-2);
    }

    .rows li:last-child {
      border-bottom: none;
    }

    .rows a {
      font-weight: 500;
      color: var(--ci-navy-900);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    .name {
      flex: 1;
      min-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .date {
      padding: 2px 8px;
      border-radius: 999px;
      color: var(--st-proposition_envoyee);
      background: var(--st-proposition_envoyee-bg);
    }

    .date,
    .hint,
    .muted {
      font-size: 13px;
    }

    .hint,
    .muted {
      color: var(--ci-text-muted);
    }

    .hint {
      margin: -6px 0 14px;
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 12px 0;
      text-align: center;
    }

    .empty-art {
      width: 120px;
      height: 80px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 8px;
      text-align: left;
      border-bottom: 1px solid var(--ci-border);
    }

    th {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--ci-text-muted);
    }

    .num {
      text-align: right;
    }

    .rate-cell {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .bar {
      width: 72px;
      height: 6px;
      overflow: hidden;
      border-radius: 3px;
      background: #eceef2;
    }

    .fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--ci-navy-900);
    }

    .rate {
      min-width: 38px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 480px) {
      .counters {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      th,
      td {
        padding: 6px 4px;
      }

      .bar {
        width: 40px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPresentationComponent {
  readonly loaded = input(false);
  readonly isAdmin = input(false);
  readonly counts = input.required<Record<DossierStatus, number>>();
  readonly toProcess = input<DashboardDossierRow[]>([]);
  readonly toFollowUp = input<DashboardDossierRow[]>([]);
  readonly conversionByCourtier = input<ConversionRow[]>([]);
  readonly conversionByProduct = input<ConversionRow[]>([]);
  readonly dossiersUrl = input('');

  protected readonly structure = DASHBOARD_STRUCTURE;
  protected readonly statuses = STATUS_ORDER;
  protected readonly statusLabels = DOSSIER_STATUS_LABELS;

  /** Couleur de la barre selon le taux de conversion. */
  protected rateClass(rate: number): string {
    return rate >= 0.5 ? 'fill fill--high' : rate >= 0.25 ? 'fill fill--mid' : 'fill fill--low';
  }

  protected conversionTables(): { title: string; rows: ConversionRow[] }[] {
    return [
      { title: this.structure.conversion.byCourtier, rows: this.conversionByCourtier() },
      { title: this.structure.conversion.byProduct, rows: this.conversionByProduct() },
    ];
  }

  /** Un brouillon se reprend dans le questionnaire, les autres dossiers s'ouvrent sur leur fiche. */
  protected dossierLink(dossier: Dossier): string[] {
    return dossier.status === 'brouillon' ? [this.dossiersUrl(), dossier.id, 'brouillon'] : [this.dossiersUrl(), dossier.id];
  }
}
