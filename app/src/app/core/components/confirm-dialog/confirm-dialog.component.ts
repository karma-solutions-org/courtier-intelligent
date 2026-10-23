import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map, Observable } from 'rxjs';

interface ConfirmDialogData {
  title: string;
  message: string;
  confirm: string;
  /** Libellé du bouton d'annulation (par défaut « Annuler »). */
  cancel?: string;
  /** Action destructive : bouton de confirmation en couleur d'alerte. */
  destructive?: boolean;
}

/**
 * Confirmation simple (remplace confirm() du navigateur) : renvoie true si l'utilisateur confirme.
 * Le focus initial est sur « Annuler » : Entrée ne déclenche jamais l'action par mégarde.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false" cdkFocusInitial>{{ data.cancel ?? 'Annuler' }}</button>
      <button mat-flat-button type="button" [class.danger]="data.destructive" [mat-dialog-close]="true">{{ data.confirm }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .danger {
      background: var(--ci-danger, #c62828);
      color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}

/** Ouvre la confirmation (largeur limitée sur mobile) : émet true seulement si l'utilisateur confirme. */
export function openConfirmDialog(dialog: MatDialog, data: ConfirmDialogData): Observable<boolean> {
  return dialog
    .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data, maxWidth: '95vw', autoFocus: 'first-tabbable' })
    .afterClosed()
    .pipe(map((confirmed) => confirmed === true));
}
