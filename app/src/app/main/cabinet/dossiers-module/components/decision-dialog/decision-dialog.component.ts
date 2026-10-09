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
  template: `
    <h2 mat-dialog-title>{{ text.title }} · {{ data.insurerName }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="field">
        <mat-label>{{ text.justification }}</mat-label>
        <textarea matInput rows="5" [formControl]="justification" [maxlength]="max"></textarea>
        <mat-hint>{{ text.hint }}</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>{{ text.cancel }}</button>
      <button mat-flat-button type="button" [disabled]="!valid()" (click)="submit()">
        {{ text.confirm }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .field {
      width: 100%;
      min-width: min(480px, 80vw);
    }
  `,
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
