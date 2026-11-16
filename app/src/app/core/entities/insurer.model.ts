import { Insurer } from '@shared';
import { databaseEntity, DocumentData } from '../providers/database-entity';

/**
 * Assureur : catalogue global `ci_insurers`, ou assureur propre au cabinet `ci_cabinets/{cabinetId}/ci_insurers`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un Insurer lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type InsurerModel = Insurer;

function fromMap(document: DocumentData): Insurer {
  return document as unknown as Insurer;
}

export const InsurerModel = {
  fromMap,
  /** Catalogue global (écrit par les Cloud Functions). */
  entity: databaseEntity('ci_insurers', fromMap),
};
