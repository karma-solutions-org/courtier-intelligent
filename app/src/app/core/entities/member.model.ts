import { Member } from '@shared';
import { databaseEntity, DocumentData } from '../providers/database-entity';

/**
 * Membre d'un cabinet (admin ou courtier) : `ci_cabinets/{cabinetId}/ci_members/{uid}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un Member lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type MemberModel = Member;

function fromMap(document: DocumentData): Member {
  return document as unknown as Member;
}

export const MemberModel = {
  fromMap,
  entity: (cabinetId: string) => databaseEntity(`ci_cabinets/${cabinetId}/ci_members`, fromMap),
};
