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
  templateUrl: './sans-suite-dialog-presentation.component.html',
  styleUrl: './sans-suite-dialog-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SansSuiteDialogPresentationComponent {
  protected readonly data = inject<SansSuiteDialogData>(MAT_DIALOG_DATA);
  private readonly _ref = inject<MatDialogRef<SansSuiteDialogPresentationComponent, string>>(MatDialogRef);
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
