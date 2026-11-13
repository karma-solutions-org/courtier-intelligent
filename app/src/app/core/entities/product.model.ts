import { Product } from '@shared';
import { databaseEntity, DocumentData } from '../providers/database-entity';

/**
 * Produit d'assurance : catalogue global `ci_products`, ou produit propre au cabinet `ci_cabinets/{cabinetId}/ci_products`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un Product lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type ProductModel = Product;

function fromMap(document: DocumentData): Product {
  return document as unknown as Product;
}

export const ProductModel = {
  fromMap,
  /** Catalogue global (écrit par les Cloud Functions). */
  entity: databaseEntity('ci_products', fromMap),
  /** Produits créés par le cabinet. */
  cabinetEntity: (cabinetId: string) => databaseEntity(`ci_cabinets/${cabinetId}/ci_products`, fromMap),
};
