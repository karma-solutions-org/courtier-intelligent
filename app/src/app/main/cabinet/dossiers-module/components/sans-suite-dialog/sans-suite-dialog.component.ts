import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SANS_SUITE_MOTIF_MAX } from '@shared';

export interface SansSuiteDialogData {
  reference: string | null;
}

/** Classement sans suite : le motif est obligatoire. Renvoie le motif saisi. */
@Component({
  selector: 'app-sans-suite-dialog',
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Classer sans suite{{ data.reference ? ' · ' + data.reference : '' }}</h2>
    <mat-dialog-content>
      <p class="note">
        Le dossier sera clos définitivement et ne pourra plus avancer.
        Les tarifications encore en cours seront annulées.
      </p>
      <mat-form-field appearance="outline" class="field">
        <mat-label>Motif</mat-label>
        <textarea matInput rows="4" [formControl]="motif" [maxlength]="max"></textarea>
        <mat-hint align="end">{{ motif.value.length }} / {{ max }}</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Annuler</button>
      <button mat-flat-button type="button" [disabled]="!valid()" (click)="submit()">Classer sans suite</button>
    </mat-dialog-actions>
  `,
  styles: `
    .note {
      margin: 0 0 12px;
    }

    .field {
      width: 100%;
      min-width: min(480px, 80vw);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SansSuiteDialogComponent {
  protected readonly data = inject<SansSuiteDialogData>(MAT_DIALOG_DATA);
  private readonly _ref = inject<MatDialogRef<SansSuiteDialogComponent, string>>(MatDialogRef);
  protected readonly max = SANS_SUITE_MOTIF_MAX;
  protected readonly motif = new FormControl('', { nonNullable: true });

  protected valid(): boolean {
    const motif = this.motif.value.trim();
    return motif.length > 0 && motif.length <= this.max;
  }

  protected submit(): void {
    if (this.valid()) this._ref.close(this.motif.value.trim());
  }
}
