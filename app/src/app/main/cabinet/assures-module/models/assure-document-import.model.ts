import { AssureDocumentType, AssureOcrValues } from '@shared';

/** Pièce envoyée (et lue si c'est une CIN ou un Kbis), à ranger avec le client à sa création. */
export interface ReadPiece {
  type: AssureDocumentType;
  storagePath: string;
  fileName: string;
  values: AssureOcrValues;
}

/** Fichier choisi dans « Pré-remplir depuis une pièce ». */
export interface PickedFile {
  id: number;
  file: File;
  type: AssureDocumentType;
  /** Envoyé dès le choix, pour que l'IA reconnaisse son type. */
  storagePath: string;
  status: 'recognizing' | 'ready' | 'failed';
}
