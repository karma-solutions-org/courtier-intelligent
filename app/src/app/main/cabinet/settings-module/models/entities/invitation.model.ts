import { Invitation } from '@shared';
import { databaseEntity, DocumentData } from '../../../../../core/providers/database-entity';

/**
 * Invitation à rejoindre un cabinet (écrite par les Cloud Functions) : `ci_cabinets/{cabinetId}/ci_invitations/{invitationId}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un Invitation lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type InvitationModel = Invitation;

function fromMap(document: DocumentData): Invitation {
  return document as unknown as Invitation;
}

export const InvitationModel = {
  fromMap,
  entity: (cabinetId: string) => databaseEntity(`ci_cabinets/${cabinetId}/ci_invitations`, fromMap),
};
