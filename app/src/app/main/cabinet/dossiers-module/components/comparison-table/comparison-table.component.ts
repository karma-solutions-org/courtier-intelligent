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
export const money = (value: number | null | undefined): string => (value == null ? '—' : euros.format(value));

/** Tableau comparatif des offres, côte à côte (défilement horizontal sur petit écran, première colonne fixe). */
@Component({
  selector: 'app-comparison-table',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './comparison-table.component.html',
  styleUrl: './comparison-table.component.scss',
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
