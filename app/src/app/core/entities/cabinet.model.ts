import { Cabinet } from '@shared';
import { databaseEntity, DocumentData } from '../providers/database-entity';

/**
 * Cabinet de courtage (unité d'isolation des données) : `ci_cabinets/{cabinetId}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un Cabinet lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type CabinetModel = Cabinet;

function fromMap(document: DocumentData): Cabinet {
  return document as unknown as Cabinet;
}

export const CabinetModel = {
  fromMap,
  entity: databaseEntity('ci_cabinets', fromMap),
};
