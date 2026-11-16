import { DossierDocument } from '@shared';
import { databaseEntity, DocumentData } from '../../../../../core/providers/database-entity';

/**
 * Document d'un dossier (carte grise, devis…) : `…/ci_dossiers/{dossierId}/ci_documents/{documentId}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un DossierDocument lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type DossierDocumentModel = DossierDocument;

function fromMap(document: DocumentData): DossierDocument {
  return document as unknown as DossierDocument;
}

export const DossierDocumentModel = {
  fromMap,
  entity: (cabinetId: string, dossierId: string) =>
    databaseEntity(`ci_cabinets/${cabinetId}/ci_dossiers/${dossierId}/ci_documents`, fromMap),
};
