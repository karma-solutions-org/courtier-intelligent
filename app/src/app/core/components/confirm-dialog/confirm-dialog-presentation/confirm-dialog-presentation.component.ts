import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { ConfirmDialogData } from '../models/confirm-dialog-data.model';

/**
 * Confirmation simple (remplace confirm() du navigateur) : renvoie true si l'utilisateur confirme.
 * Le focus initial est sur « Annuler » : Entrée ne déclenche jamais l'action par mégarde.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './confirm-dialog-presentation.component.html',
  styleUrl: './confirm-dialog-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogPresentationComponent {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
