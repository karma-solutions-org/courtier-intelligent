import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';
import { openConfirmDialog } from '../../components/confirm-dialog/confirm-dialog.component';

/** Page qui peut avoir des modifications pas encore enregistrées. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

const UNSAVED_CHANGES_MESSAGE =
  'Des modifications ne sont pas enregistrées. Quitter quand même ?';

/** Demande confirmation (dialogue Material) avant de quitter une page dont des modifications ne sont pas enregistrées. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component): boolean | Observable<boolean> => {
  if (!component?.hasUnsavedChanges()) return true;
  return openConfirmDialog(inject(MatDialog), {
    title: 'Modifications non enregistrées',
    message: UNSAVED_CHANGES_MESSAGE,
    confirm: 'Quitter sans enregistrer',
    cancel: 'Rester sur la page',
    destructive: true,
  });
};
