import { Assure } from '@shared';
import { databaseEntity, DocumentData } from '../providers/database-entity';

/**
 * Client (assuré) d'un cabinet : `ci_cabinets/{cabinetId}/ci_assures/{assureId}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un Assure lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type AssureModel = Assure;

function fromMap(document: DocumentData): Assure {
  return document as unknown as Assure;
}

export const AssureModel = {
  fromMap,
  entity: (cabinetId: string) => databaseEntity(`ci_cabinets/${cabinetId}/ci_assures`, fromMap),
};
