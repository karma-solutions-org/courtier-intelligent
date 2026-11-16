import { MatDialog } from '@angular/material/dialog';
import { map, Observable } from 'rxjs';
import { ConfirmDialogPresentationComponent } from '../confirm-dialog-presentation/confirm-dialog-presentation.component';
import { ConfirmDialogData } from '../models/confirm-dialog-data.model';

/** Ouvre la confirmation (largeur limitée sur mobile) : émet true seulement si l'utilisateur confirme. */
export function openConfirmDialog(dialog: MatDialog, data: ConfirmDialogData): Observable<boolean> {
  return dialog
    .open<ConfirmDialogPresentationComponent, ConfirmDialogData, boolean>(ConfirmDialogPresentationComponent, { data, maxWidth: '95vw', autoFocus: 'first-tabbable' })
    .afterClosed()
    .pipe(map((confirmed) => confirmed === true));
}
