import { QuoteJob } from '@shared';
import { databaseEntity, DocumentData } from '../../../../../core/providers/database-entity';

/**
 * Tarification d'un assureur pour un dossier (suivie par l'extension) : `…/ci_dossiers/{dossierId}/ci_quoteJobs/{insurerId}`.
 *
 * `fromMap` rend le document tel que Firestore le donne, typé : c'est l'endroit unique où normaliser un QuoteJob lu
 * (valeurs par défaut, conversions) si besoin.
 */
export type QuoteJobModel = QuoteJob;

function fromMap(document: DocumentData): QuoteJob {
  return document as unknown as QuoteJob;
}

export const QuoteJobModel = {
  fromMap,
  entity: (cabinetId: string, dossierId: string) =>
    databaseEntity(`ci_cabinets/${cabinetId}/ci_dossiers/${dossierId}/ci_quoteJobs`, fromMap),
};
