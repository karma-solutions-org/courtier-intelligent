import { CanDeactivateFn } from '@angular/router';

/** Page qui peut avoir des modifications pas encore enregistrées. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

export const UNSAVED_CHANGES_MESSAGE =
  'Des modifications ne sont pas enregistrées. Quitter quand même ?';

/** Demande confirmation avant de quitter une page dont des modifications ne sont pas enregistrées. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) =>
  !component?.hasUnsavedChanges() || confirm(UNSAVED_CHANGES_MESSAGE);
