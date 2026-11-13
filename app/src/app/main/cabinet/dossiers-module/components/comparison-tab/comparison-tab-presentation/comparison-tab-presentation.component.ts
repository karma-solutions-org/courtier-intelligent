import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Dossier, Guarantee, NeedAnalysis } from '@shared';
import {
  ComparisonColumn,
  ComparisonTablePresentationComponent,
} from '../../comparison-table/comparison-table-presentation/comparison-table-presentation.component';
import { COMPARISON_STRUCTURE } from '../comparison-tab.structure';

/** Onglet Comparatif : offres côte à côte, offre retenue et sa justification. */
@Component({
  selector: 'app-comparison-tab-presentation',
  imports: [CurrencyPipe, MatButtonModule, MatIconModule, ComparisonTablePresentationComponent],
  templateUrl: './comparison-tab-presentation.component.html',
  styleUrl: './comparison-tab-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparisonTabPresentationComponent {
  readonly error = input<string | null>(null);
  readonly loaded = input(false);
  readonly columns = input<ComparisonColumn[]>([]);
  /** Assureurs dont l'offre est à refaire (dossier modifié depuis le tarif). */
  readonly staleNames = input<string[]>([]);
  readonly canReopen = input(false);
  readonly canDecide = input(false);
  readonly busy = input(false);
  readonly decision = input<Dossier['decision'] | null>(null);
  readonly need = input<NeedAnalysis | null>(null);
  readonly guarantees = input<Guarantee[]>([]);
  readonly insurerNames = input<Map<string, string>>(new Map());

  readonly reopen = output<void>();
  readonly choose = output<ComparisonColumn>();

  protected readonly text = COMPARISON_STRUCTURE;
}
