import { AssureDocument } from '@shared';
import { databaseEntity, DocumentData } from '../../../../../core/providers/database-entity';

/**
 * Pièce rangée avec un client (CIN, Kbis…) : `ci_cabinets/{cabinetId}/ci_assures/{assureId}/ci_documents/{documentId}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un AssureDocument lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type AssureDocumentModel = AssureDocument;

function fromMap(document: DocumentData): AssureDocument {
  return document as unknown as AssureDocument;
}

export const AssureDocumentModel = {
  fromMap,
  entity: (cabinetId: string, assureId: string) =>
    databaseEntity(`ci_cabinets/${cabinetId}/ci_assures/${assureId}/ci_documents`, fromMap),
};
