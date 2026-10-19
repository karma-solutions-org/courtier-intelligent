/** Choix de l'admin : assureurs et produits actifs du cabinet (mêmes champs que les règles Firestore). */
export interface CatalogChoicesModel {
  enabledInsurers: string[];
  enabledProducts: string[];
}
