import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { GENERAL_DEDUCTIBLE, Guarantee, GuaranteeCoverage, guaranteeCoverage, Offer } from '@shared';
import { COMPARISON_STRUCTURE } from '../comparison-tab/comparison-tab.structure';

/** Une colonne du comparatif : l'assureur et son offre analysée. */
export interface ComparisonColumn {
  insurerId: string;
  insurerName: string;
  offer: Offer;
}

const COVERAGE_ICONS: Record<GuaranteeCoverage, string> = {
  included: 'check_circle',
  limited: 'error',
  absent: 'cancel',
};

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

/** Montant affiché, « — » s'il n'est pas connu. */
const money = (value: number | null | undefined): string => (value == null ? '—' : euros.format(value));

/** Tableau comparatif des offres, côte à côte (défilement horizontal sur petit écran, première colonne fixe). */
@Component({
  selector: 'app-comparison-table',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col" class="label">{{ text.insurer }}</th>
            @for (column of columns(); track column.insurerId) {
              <th
                scope="col"
                class="insurer"
                [class.chosen]="column.insurerId === decidedInsurerId()"
                [class.best]="column.insurerId === bestInsurerId()"
              >
                @if (column.insurerId === bestInsurerId()) {
                  <span class="best-flag">Meilleur score</span>
                }
                <span class="insurer-name">{{ column.insurerName }}</span>
                @if (column.insurerId === decidedInsurerId()) {
                  <span class="badge">{{ text.chosen }}</span>
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" class="label">{{ text.score }}</th>
            @for (column of columns(); track column.insurerId) {
              <td>
                @if (column.offer.score !== null && column.offer.score !== undefined) {
                  <span [class]="scoreClass(column.offer.score)">
                    <strong class="score">{{ column.offer.score }}</strong>
                  </span>
                  <span class="out-of">/ 100</span>
                } @else {
                  —
                }
              </td>
            }
          </tr>
          <tr>
            <th scope="row" class="label">{{ text.premiumAnnual }}</th>
            @for (column of columns(); track column.insurerId) {
              <td>{{ money(column.offer.premiumAnnual) }}</td>
            }
          </tr>
          <tr>
            <th scope="row" class="label">{{ text.premiumMonthly }}</th>
            @for (column of columns(); track column.insurerId) {
              <td>{{ money(column.offer.premiumMonthly) }}</td>
            }
          </tr>
          <tr>
            <th scope="row" class="label">{{ text.generalDeductible }}</th>
            @for (column of columns(); track column.insurerId) {
              <td>{{ money(column.offer.deductibles?.[general]) }}</td>
            }
          </tr>
          <tr class="section">
            <th scope="rowgroup" [attr.colspan]="columns().length + 1">{{ text.guarantees }}</th>
          </tr>
          @for (guarantee of guarantees(); track guarantee.code) {
            <tr>
              <th scope="row" class="label">
                {{ guarantee.label }}
                @if (mandatory().includes(guarantee.code)) {
                  <span class="tag">{{ text.mandatory }}</span>
                } @else if (niceToHave().includes(guarantee.code)) {
                  <span class="tag soft">{{ text.niceToHave }}</span>
                }
              </th>
              @for (column of columns(); track column.insurerId) {
                @let coverage = coverageOf(column.offer, guarantee.code);
                <td [title]="text.coverage[coverage]" [class.best-col]="column.insurerId === bestInsurerId()">
                  <span [class]="'pill pill--' + coverage"><mat-icon aria-hidden="true">{{ icons[coverage] }}</mat-icon>{{ text.coverage[coverage] }}</span>
                  @if (detailOf(column.offer, guarantee.code); as detail) {
                    <span class="detail">{{ detail }}</span>
                  }
                </td>
              }
            </tr>
          }
          <tr>
            <th scope="row" class="label">{{ text.gaps }}</th>
            @for (column of columns(); track column.insurerId) {
              <td class="gaps">
                @for (gap of column.offer.gaps ?? []; track $index) {
                  <p [class]="gap.severity"><mat-icon aria-hidden="true">{{ gap.severity === 'ko' ? 'cancel' : 'error' }}</mat-icon>{{ gap.message }}</p>
                } @empty {
                  <p>{{ text.noGap }}</p>
                }
              </td>
            }
          </tr>
          @if (canDecide()) {
            <tr>
              <th scope="row" class="label"></th>
              @for (column of columns(); track column.insurerId) {
                <td>
                  <button mat-flat-button type="button" [disabled]="busy()" (click)="choose.emit(column)">
                    {{ column.insurerId === decidedInsurerId() ? text.chosen : text.choose }}
                  </button>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .scroll {
      overflow-x: auto;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    table {
      border-collapse: separate;
      border-spacing: 0;
      min-width: 100%;
    }

    th,
    td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--ci-border);
      text-align: left;
      vertical-align: middle;
      min-width: 180px;
    }

    .label {
      position: sticky;
      left: 0;
      z-index: 1;
      min-width: 160px;
      background: var(--ci-surface);
      font-weight: 500;
      color: var(--ci-text);
      border-right: 1px solid var(--ci-border);
    }

    thead th {
      padding-top: 14px;
      font-weight: 600;
      font-size: 14px;
      background: var(--ci-surface-2);
      vertical-align: bottom;
    }

    .insurer-name {
      display: block;
    }

    thead th.best,
    td.best-col {
      background: var(--row-hover);
    }

    .best-flag {
      display: inline-block;
      margin-bottom: 4px;
      font-size: 11px;
      font-weight: 500;
      color: var(--ci-accent-ink);
    }

    .badge,
    .tag {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 500;
    }

    .badge {
      color: var(--ci-success);
      background: var(--ci-success-soft);
    }

    .tag {
      color: var(--ci-warning);
      background: var(--ci-warning-soft);
    }

    .tag.soft {
      color: var(--ci-text-muted);
      background: var(--ci-surface-2);
    }

    .section th {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ci-text-muted);
      background: var(--ci-surface-2);
    }

    .detail {
      display: block;
      margin-top: 4px;
      font-size: 12px;
      color: var(--ci-text-muted);
    }

    .gauge {
      display: inline-block;
      min-width: 28px;
      padding: 2px 8px;
      border-radius: 6px;
      text-align: center;
      color: var(--ci-success);
      background: var(--ci-success-soft);
    }

    .gauge--mid {
      color: var(--ci-warning);
      background: var(--ci-warning-soft);
    }

    .gauge--low {
      color: var(--ci-danger);
      background: var(--ci-danger-soft);
    }

    .score {
      font-size: 14px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .out-of {
      margin-left: 4px;
      font-size: 12px;
      color: var(--ci-text-muted);
    }

    .pill,
    .gaps p {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12.5px;
      font-weight: 500;

      mat-icon {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
    }

    .pill {
      padding: 2px 8px 2px 6px;
      border-radius: 999px;
    }

    .pill--included {
      color: var(--ci-success);
      background: var(--ci-success-soft);
    }

    .pill--limited {
      color: var(--ci-warning);
      background: var(--ci-warning-soft);
    }

    .pill--absent {
      color: var(--ci-danger);
      background: var(--ci-danger-soft);
    }

    .gaps p {
      display: flex;
      align-items: flex-start;
      margin: 0 0 6px;
      padding: 4px 8px;
      border-radius: 6px;
      color: var(--ci-success);
      background: var(--ci-success-soft);
    }

    .gaps p.warn {
      color: var(--ci-warning);
      background: var(--ci-warning-soft);
    }

    .gaps p.ko {
      color: var(--ci-danger);
      background: var(--ci-danger-soft);
    }

    tbody tr:last-child th,
    tbody tr:last-child td {
      border-bottom: none;
    }

    @media (max-width: 600px) {
      th,
      td {
        min-width: 140px;
        padding: 8px 10px;
      }

      .label {
        min-width: 120px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparisonTableComponent {
  readonly columns = input.required<ComparisonColumn[]>();
  readonly guarantees = input.required<Guarantee[]>();
  readonly mandatory = input<string[]>([]);
  readonly niceToHave = input<string[]>([]);
  readonly decidedInsurerId = input<string | null>(null);
  readonly canDecide = input(false);
  readonly busy = input(false);
  readonly choose = output<ComparisonColumn>();

  protected readonly text = COMPARISON_STRUCTURE.table;
  protected readonly icons = COVERAGE_ICONS;
  protected readonly general = GENERAL_DEDUCTIBLE;
  protected readonly coverageOf = guaranteeCoverage;
  protected readonly money = money;

  /** Colonne au meilleur score (mise en avant visuelle uniquement). */
  protected readonly bestInsurerId = computed(() => {
    let best: ComparisonColumn | null = null;
    for (const column of this.columns()) {
      const score = column.offer.score;
      if (score != null && (best === null || score > (best.offer.score ?? -1))) best = column;
    }
    return best?.insurerId ?? null;
  });

  protected scoreClass(score: number): string {
    return score >= 75 ? 'gauge gauge--high' : score >= 50 ? 'gauge gauge--mid' : 'gauge gauge--low';
  }

  /** Plafond et franchise de la garantie, s'ils sont connus. */
  protected detailOf(offer: Offer, code: string): string | null {
    const g = offer.guarantees.find(x => x.code === code && x.included);
    if (!g) return null;
    const deductible = offer.deductibles?.[code] ?? g.deductible;
    const parts = [
      g.limit != null ? `${this.text.limit} ${money(g.limit)}` : null,
      deductible != null ? `${this.text.deductible} ${money(deductible)}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }
}
