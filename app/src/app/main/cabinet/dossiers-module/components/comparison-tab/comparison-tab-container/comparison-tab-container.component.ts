import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { CurrencyPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComparisonStore } from '../../../store/comparison.store';
import { DossierStore } from '../../../store/dossier.store';
import {
  ComparisonColumn,
  ComparisonTablePresentationComponent,
} from '../../comparison-table/comparison-table-presentation/comparison-table-presentation.component';
import {
  DecisionDialogPresentationComponent,
  DecisionDialogData,
} from '../../decision-dialog/decision-dialog-presentation/decision-dialog-presentation.component';
import { COMPARISON_STRUCTURE } from '../comparison-tab.structure';

/** Onglet Comparatif : offres côte à côte (analysées par le serveur) et choix justifié de l'offre retenue. */
@Component({
  selector: 'app-comparison-tab',
  imports: [CurrencyPipe, MatButtonModule, MatIconModule, ComparisonTablePresentationComponent],
  providers: [ComparisonStore],
  templateUrl: './comparison-tab-container.component.html',
  styleUrl: './comparison-tab-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparisonTabContainerComponent {
  protected readonly store = inject(ComparisonStore);
  protected readonly dossierStore = inject(DossierStore);
  private readonly _dialog = inject(MatDialog);
  private readonly _snackBar = inject(MatSnackBar);

  protected readonly text = COMPARISON_STRUCTURE;
  protected readonly decision = computed(() => this.dossierStore.dossier()?.decision ?? null);

  constructor() {
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 4000 });
        this.store.clearSuccess();
      }
    });
  }

  protected choose(column: ComparisonColumn): void {
    const current = this.decision();
    this._dialog
      .open<DecisionDialogPresentationComponent, DecisionDialogData, string>(DecisionDialogPresentationComponent, {
        data: {
          insurerName: column.insurerName,
          justification: current?.insurerId === column.insurerId ? current.justification : null,
        },
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((justification) => {
        if (justification) {
          this.store.decide({ insurerId: column.insurerId, justification });
        }
      });
  }
}
