import { Dossier } from '@shared';
import { databaseEntity, DocumentData } from '../providers/database-entity';

/**
 * Dossier d'un cabinet : `ci_cabinets/{cabinetId}/ci_dossiers/{dossierId}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un Dossier lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type DossierModel = Dossier;

function fromMap(document: DocumentData): Dossier {
  return document as unknown as Dossier;
}

export const DossierModel = {
  fromMap,
  entity: (cabinetId: string) => databaseEntity(`ci_cabinets/${cabinetId}/ci_dossiers`, fromMap),
};
