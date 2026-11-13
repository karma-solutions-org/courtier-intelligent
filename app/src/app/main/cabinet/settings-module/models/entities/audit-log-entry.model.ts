import { AuditLogEntry } from '@shared';
import { databaseEntity, DocumentData } from '../../../../../core/providers/database-entity';

/**
 * Entrée du journal des connexions et des appareils (lue par les admins) : `ci_cabinets/{cabinetId}/ci_auditLog/{entryId}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un AuditLogEntry lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type AuditLogEntryModel = AuditLogEntry;

function fromMap(document: DocumentData): AuditLogEntry {
  return document as unknown as AuditLogEntry;
}

export const AuditLogEntryModel = {
  fromMap,
  entity: (cabinetId: string) => databaseEntity(`ci_cabinets/${cabinetId}/ci_auditLog`, fromMap),
};
