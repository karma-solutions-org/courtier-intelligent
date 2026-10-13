import { inject, Injectable } from '@angular/core';
import { Assure, AssureDocument, AssureDocumentType, AssureOcrValues, Dossier } from '@shared';
import { map, Observable } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { StorageProvider } from '../../../../core/providers/storage.provider';
import { AssureData } from '../models/assure-form.model';

@Injectable({ providedIn: 'root' })
export class AssuresService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _backend = inject(BackendProvider);
  private readonly _storage = inject(StorageProvider);

  /** Pièces rangées avec le client (CIN, Kbis), de la plus récente à la plus ancienne. */
  watchDocuments(cabinetId: string, assureId: string): Observable<AssureDocument[]> {
    return this._database
      .watchCollection<AssureDocument>(`cabinets/${cabinetId}/assures/${assureId}/documents`)
      .pipe(map(documents => documents.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))));
  }

  /** Dépose une pièce dans le dépôt provisoire du courtier (avant que le client n'existe). */
  uploadImport(storagePath: string, file: Blob): Observable<string> {
    return this._storage.upload(storagePath, file);
  }

  /** Lecture de la pièce par l'IA : valeurs proposées pour la fiche, rien n'est écrit. */
  readPiece(type: AssureDocumentType, storagePath: string): Observable<{ values: AssureOcrValues; readable: boolean }> {
    return this._backend.call('assures-lirePiece', { type, storagePath });
  }

  /** Range la pièce avec le client créé. */
  attachPiece(data: { assureId: string; type: AssureDocumentType; storagePath: string; fileName: string; values: AssureOcrValues }): Observable<{ documentId: string }> {
    return this._backend.call('assures-rattacherPiece', data);
  }

  downloadUrl(storagePath: string): Observable<string> {
    return this._storage.getUrl(storagePath);
  }

  /** Tous les assurés du cabinet : recherche et pagination se font côté app (Firestore n'a pas de recherche texte). */
  watchAssures(cabinetId: string): Observable<Assure[]> {
    return this._database.watchCollection<Assure>(`cabinets/${cabinetId}/assures`, {
      orderBy: [{ field: 'lastName' }],
    });
  }

  /** Dossiers d'un assuré, du plus récent au plus ancien. */
  watchDossiersOf(cabinetId: string, assureId: string): Observable<Dossier[]> {
    return this._database
      .watchCollection<Dossier>(`cabinets/${cabinetId}/dossiers`, {
        filters: [{ field: 'assureId', operator: '==', value: assureId }],
      })
      .pipe(map(dossiers => dossiers.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))));
  }

  /** Crée l'assuré et renvoie son identifiant. */
  create(cabinetId: string, uid: string, data: AssureData): Observable<string> {
    return this._database.add(`cabinets/${cabinetId}/assures`, {
      ...data,
      createdBy: uid,
      createdAt: this._database.serverTimestamp(),
    });
  }

  update(cabinetId: string, assureId: string, data: AssureData): Observable<void> {
    return this._database.update(`cabinets/${cabinetId}/assures/${assureId}`, {
      ...data,
      updatedAt: this._database.serverTimestamp(),
    });
  }
}
