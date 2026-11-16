/**
 * Document tel que Firestore le rend : ses champs et son identifiant (la clé du document).
 */
export type DocumentData = Record<string, unknown> & { id: string };

/** Reconstruit une entité à partir d'un document lu. */
export type DatabaseEntityFactory<T> = (document: DocumentData) => T;

/**
 * Décrit une collection : son chemin et la façon de reconstruire ses documents. Les services passent ce descripteur au
 * provider au lieu d'écrire le chemin à la main (même rôle que `databaseEntity` de ngx-sg).
 *
 * Collection imbriquée : le descripteur se construit pour son parent.
 *
 * ```ts
 * export const DossierModel = {
 *   fromMap,
 *   entity: (cabinetId: string) => databaseEntity(`ci_cabinets/${cabinetId}/ci_dossiers`, fromMap),
 * };
 * ```
 */
export interface EntityDescriptor<T> {
  /** Chemin de la collection. */
  readonly path: string;
  /** Reconstruit l'entité à partir d'un document lu. */
  readonly fromMap: DatabaseEntityFactory<T>;
}

export function databaseEntity<T>(path: string, fromMap: DatabaseEntityFactory<T>): EntityDescriptor<T> {
  return { path, fromMap };
}
