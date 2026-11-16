import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComparisonStore } from '../../../store/comparison.store';
import { DossierStore } from '../../../store/dossier.store';
import { ComparisonColumn } from '../../comparison-table/comparison-table-presentation/comparison-table-presentation.component';
import {
  DecisionDialogPresentationComponent,
  DecisionDialogData,
} from '../../decision-dialog/decision-dialog-presentation/decision-dialog-presentation.component';
import { ComparisonTabPresentationComponent } from '../comparison-tab-presentation/comparison-tab-presentation.component';

/** Onglet Comparatif : offres côte à côte (analysées par le serveur) et choix justifié de l'offre retenue. */
@Component({
  selector: 'app-comparison-tab-container',
  imports: [ComparisonTabPresentationComponent],
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

  protected async choose(column: ComparisonColumn): Promise<void> {
    const current = this.decision();
    const dialog = this._dialog.open<DecisionDialogPresentationComponent, DecisionDialogData, string>(DecisionDialogPresentationComponent, {
        data: {
          insurerName: column.insurerName,
          justification: current?.insurerId === column.insurerId ? current.justification : null,
        },
        maxWidth: '95vw',
      });
    const justification = await firstValueFrom(dialog.afterClosed());
    if (justification) {
      this.store.decide({ insurerId: column.insurerId, justification });
    }
  }
}
