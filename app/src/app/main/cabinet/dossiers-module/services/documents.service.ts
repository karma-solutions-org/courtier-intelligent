import { inject, Injectable } from '@angular/core';
import { DossierDocument, DossierDocumentStatus, DossierDocumentType, OcrField } from '@shared';
import { Observable } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { StorageProvider } from '../../../../core/providers/storage.provider';

/** Documents d'un dossier (E12) : envoi dans Storage, enregistrement et lecture automatique via les functions `documents-*`. */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _backend = inject(BackendProvider);
  private readonly _storage = inject(StorageProvider);

  watchDocuments(cabinetId: string, dossierId: string): Observable<DossierDocument[]> {
    return this._database.watchCollection<DossierDocument>(`cabinets/${cabinetId}/dossiers/${dossierId}/documents`);
  }

  upload(storagePath: string, file: Blob): Observable<string> {
    return this._storage.upload(storagePath, file);
  }

  /** Le serveur relit le fichier envoyé (emplacement, type, taille) puis écrit l'entrée du document. */
  register(dossierId: string, type: DossierDocumentType, storagePath: string, fileName: string): Observable<{ documentId: string }> {
    return this._backend.call('documents-enregistrer', { dossierId, type, storagePath, fileName });
  }

  /** Lecture par l'IA : renvoie les valeurs proposées (rien n'est écrit dans le dossier). */
  analyze(dossierId: string, documentId: string): Observable<{ status: DossierDocumentStatus; ocrFields: OcrField[]; remaining: number }> {
    return this._backend.call('documents-analyser', { dossierId, documentId });
  }

  downloadUrl(storagePath: string): Observable<string> {
    return this._storage.getUrl(storagePath);
  }
}
