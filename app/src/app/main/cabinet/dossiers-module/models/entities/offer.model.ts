import { Offer } from '@shared';
import { databaseEntity, DocumentData } from '../../../../../core/providers/database-entity';

/**
 * Offre d'un assureur pour un dossier : `…/ci_dossiers/{dossierId}/ci_offers/{insurerId}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un Offer lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type OfferModel = Offer;

function fromMap(document: DocumentData): Offer {
  return document as unknown as Offer;
}

export const OfferModel = {
  fromMap,
  entity: (cabinetId: string, dossierId: string) =>
    databaseEntity(`ci_cabinets/${cabinetId}/ci_dossiers/${dossierId}/ci_offers`, fromMap),
};
