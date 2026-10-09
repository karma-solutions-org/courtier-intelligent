import { DatePipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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
  imports: [DatePipe, PercentPipe, RouterLink, StatusChipComponent],
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
        <section class="card">
          <h2>{{ structure.toProcess.title }}</h2>
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
            <p class="muted">{{ structure.toProcess.empty }}</p>
          }
        </section>

        <section class="card">
          <h2>{{ structure.followUp.title }}</h2>
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
            <p class="muted">{{ structure.followUp.empty }}</p>
          }
        </section>
      </div>

      @if (isAdmin()) {
        <section class="card">
          <h2>{{ structure.conversion.title }}</h2>
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
                          <td class="num">{{ row.rate | percent: '1.0-0' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                } @else {
                  <p class="muted">{{ structure.conversion.empty }}</p>
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
      gap: 24px;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 18px;
      font-weight: 600;
    }

    h3 {
      margin: 0 0 8px;
      font-size: 15px;
      font-weight: 600;
    }

    .counters {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px;
    }

    .counter {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 14px 16px;
      border-radius: 12px;
      text-decoration: none;
      color: inherit;
      background: var(--mat-sys-surface-container);
      transition: background 0.15s;
    }

    .counter:hover,
    .counter:focus-visible {
      background: var(--mat-sys-surface-container-high);
    }

    .count {
      font-size: 26px;
      font-weight: 600;
    }

    .label {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
      gap: 24px;
    }

    .card {
      padding: 16px 20px;
      border-radius: 12px;
      border: 1px solid var(--mat-sys-outline-variant);
    }

    .rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .rows li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .rows li:last-child {
      border-bottom: none;
    }

    .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .date,
    .hint,
    .muted {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .hint {
      margin: -6px 0 12px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .num {
      text-align: right;
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
