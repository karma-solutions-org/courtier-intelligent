/** Alignement du contenu d'une colonne. */
export type TableColumnAlign = 'start' | 'center' | 'end';

/** Colonne de `app-table`. */
export interface TableColumn {
  /**
   * Identifiant de la colonne. Sans gabarit `appTableCell` du même nom, la cellule affiche `row[key]`
   * (ou « — » si la valeur est vide).
   */
  key: string;
  /** En-tête affiché. */
  label: string;
  align?: TableColumnAlign;
  /** Largeur CSS (`'120px'`, `'20%'`…). Sans largeur, la colonne partage l'espace restant. */
  width?: string;
  /** Police à chasse fixe (identifiants, numéros). */
  mono?: boolean;
}
