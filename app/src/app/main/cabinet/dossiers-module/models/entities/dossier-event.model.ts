import { DossierEvent } from '@shared';
import { databaseEntity, DocumentData } from '../../../../../core/providers/database-entity';

/**
 * Événement de l'historique d'un dossier : `…/ci_dossiers/{dossierId}/ci_events/{eventId}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un DossierEvent lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type DossierEventModel = DossierEvent;

function fromMap(document: DocumentData): DossierEvent {
  return document as unknown as DossierEvent;
}

export const DossierEventModel = {
  fromMap,
  entity: (cabinetId: string, dossierId: string) =>
    databaseEntity(`ci_cabinets/${cabinetId}/ci_dossiers/${dossierId}/ci_events`, fromMap),
};
