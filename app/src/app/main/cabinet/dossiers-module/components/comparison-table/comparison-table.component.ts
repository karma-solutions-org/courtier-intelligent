import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { GENERAL_DEDUCTIBLE, Guarantee, GuaranteeCoverage, guaranteeCoverage, Offer } from '@shared';
import { COMPARISON_STRUCTURE } from '../comparison-tab/comparison-tab.structure';

/** Une colonne du comparatif : l'assureur et son offre analysée. */
export interface ComparisonColumn {
  insurerId: string;
  insurerName: string;
  offer: Offer;
}

const COVERAGE_ICONS: Record<GuaranteeCoverage, string> = {
  included: '✅',
  limited: '⚠️',
  absent: '❌',
};

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

/** Montant affiché, « — » s'il n'est pas connu. */
export const money = (value: number | null | undefined): string => (value == null ? '—' : euros.format(value));

/** Tableau comparatif des offres, côte à côte (défilement horizontal sur petit écran, première colonne fixe). */
@Component({
  selector: 'app-comparison-table',
  imports: [MatButtonModule],
  template: `
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col" class="label">{{ text.insurer }}</th>
            @for (column of columns(); track column.insurerId) {
              <th scope="col" [class.chosen]="column.insurerId === decidedInsurerId()">
                {{ column.insurerName }}
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
                  <strong class="score" [class.low]="column.offer.score < 50">{{ column.offer.score }}</strong>
                  / 100
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
                <td [title]="text.coverage[coverage]">
                  <span role="img" [attr.aria-label]="text.coverage[coverage]">{{ icons[coverage] }}</span>
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
                  <p [class]="gap.severity">{{ gap.severity === 'ko' ? '❌' : '⚠️' }} {{ gap.message }}</p>
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
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
    }

    table {
      border-collapse: collapse;
      min-width: 100%;
    }

    th,
    td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      text-align: left;
      vertical-align: top;
      min-width: 180px;
    }

    .label {
      position: sticky;
      left: 0;
      z-index: 1;
      min-width: 160px;
      background: #fff;
      font-weight: 500;
    }

    thead th {
      font-weight: 600;
    }

    .chosen {
      background: var(--mat-sys-primary-container);
    }

    .badge,
    .tag {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      background: var(--mat-sys-secondary-container);
    }

    .tag.soft {
      background: var(--mat-sys-surface-container);
    }

    .section th {
      font-weight: 600;
      background: var(--mat-sys-surface-container-low);
    }

    .detail {
      margin-left: 4px;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .score {
      font-size: 18px;
    }

    .score.low,
    .gaps .ko {
      color: var(--mat-sys-error);
    }

    .gaps p {
      margin: 0 0 4px;
      font-size: 13px;
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
