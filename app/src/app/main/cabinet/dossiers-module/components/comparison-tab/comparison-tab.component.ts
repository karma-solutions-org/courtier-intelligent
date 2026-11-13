import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { CurrencyPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComparisonStore } from '../../store/comparison.store';
import { DossierStore } from '../../store/dossier.store';
import {
  ComparisonColumn,
  ComparisonTableComponent,
} from '../comparison-table/comparison-table.component';
import {
  DecisionDialogComponent,
  DecisionDialogData,
} from '../decision-dialog/decision-dialog.component';
import { COMPARISON_STRUCTURE } from './comparison-tab.structure';

/** Onglet Comparatif : offres côte à côte (analysées par le serveur) et choix justifié de l'offre retenue. */
@Component({
  selector: 'app-comparison-tab',
  imports: [CurrencyPipe, MatButtonModule, MatIconModule, ComparisonTableComponent],
  providers: [ComparisonStore],
  templateUrl: './comparison-tab.component.html',
  styleUrl: './comparison-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparisonTabComponent {
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
      .open<DecisionDialogComponent, DecisionDialogData, string>(DecisionDialogComponent, {
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
