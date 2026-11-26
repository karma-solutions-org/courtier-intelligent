/** Choix de l'admin : assureurs et produits actifs du cabinet (mêmes champs que les règles Firestore). */
export interface CatalogChoicesModel {
  enabledInsurers: string[];
  enabledProducts: string[];
  /** Assureurs actifs dont le catalogue autorise le clic final automatique et pour lesquels l'admin l'a activé. */
  autoSubmitInsurers: string[];
}
