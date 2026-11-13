export interface ConfirmDialogData {
  title: string;
  message: string;
  confirm: string;
  /** Libellé du bouton d'annulation (par défaut « Annuler »). */
  cancel?: string;
  /** Action destructive : bouton de confirmation en couleur d'alerte. */
  destructive?: boolean;
}
