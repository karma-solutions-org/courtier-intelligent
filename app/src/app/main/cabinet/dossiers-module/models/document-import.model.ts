import { DossierDocumentType, OcrField } from '@shared';

/** Type choisi à l'import : « auto » laisse l'IA reconnaître le type de chaque fichier. */
export type PickedDocumentType = DossierDocumentType | 'auto';

/** Fichier choisi dans « Importer un document », avec son type (pré-rempli avec le type du menu au moment du choix). */
export interface PickedDocumentFile {
  id: number;
  file: File;
  type: PickedDocumentType;
}

/** Valeurs lues par l'IA sur un document, proposées champ par champ avant d'être appliquées au dossier. */
export interface OcrProposal {
  documentId: string;
  fields: OcrField[];
}

/** Étape en cours : envoi des fichiers ou lecture d'un document. */
export type DocumentImportBusy = 'upload' | 'analyze' | null;
