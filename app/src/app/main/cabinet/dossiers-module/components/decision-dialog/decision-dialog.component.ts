import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DECISION_JUSTIFICATION_MAX, validateDecisionJustification } from '@shared';
import { COMPARISON_STRUCTURE } from '../comparison-tab/comparison-tab.structure';

export interface DecisionDialogData {
  insurerName: string;
  justification: string | null;
}

/** Choix d'une offre : la justification est obligatoire. Renvoie la justification saisie. */
@Component({
  selector: 'app-decision-dialog',
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './decision-dialog.component.html',
  styleUrl: './decision-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionDialogComponent {
  protected readonly data = inject<DecisionDialogData>(MAT_DIALOG_DATA);
  private readonly _ref = inject<MatDialogRef<DecisionDialogComponent, string>>(MatDialogRef);
  protected readonly text = COMPARISON_STRUCTURE.dialog;
  protected readonly max = DECISION_JUSTIFICATION_MAX;
  protected readonly justification = new FormControl(this.data.justification ?? '', {
    nonNullable: true,
  });

  protected valid(): boolean {
    return validateDecisionJustification(this.justification.value) === null;
  }

  protected submit(): void {
    if (this.valid()) {
      this._ref.close(this.justification.value.trim());
    }
  }
}
