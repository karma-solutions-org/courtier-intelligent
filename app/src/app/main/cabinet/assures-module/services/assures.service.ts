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
      .watchCollection<AssureDocument>(`ci_cabinets/${cabinetId}/ci_assures/${assureId}/ci_documents`)
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

  /** Assurés du cabinet hors corbeille : recherche et pagination se font côté app (Firestore n'a pas de recherche texte). */
  watchAssures(cabinetId: string): Observable<Assure[]> {
    return this._database
      .watchCollection<Assure>(`ci_cabinets/${cabinetId}/ci_assures`, { orderBy: [{ field: 'lastName' }] })
      .pipe(map((assures) => assures.filter((assure) => !assure.deletedAt)));
  }

  /**
   * Une tranche de la liste des assurés : les `limit` premiers dans l'ordre demandé (défilement infini).
   * `hasMore` est vrai tant que Firestore a rempli la tranche (corbeille comprise, filtrée ensuite).
   */
  watchAssuresPage(cabinetId: string, limit: number, sort: 'name' | 'recent'): Observable<{ assures: Assure[]; hasMore: boolean }> {
    return this._database
      .watchCollection<Assure>(`ci_cabinets/${cabinetId}/ci_assures`, {
        orderBy: [sort === 'recent' ? { field: 'createdAt', direction: 'desc' } : { field: 'lastName' }],
        limit,
      })
      .pipe(map((assures) => ({ assures: assures.filter((assure) => !assure.deletedAt), hasMore: assures.length >= limit })));
  }

  watchAssure(cabinetId: string, assureId: string): Observable<Assure | null> {
    return this._database.watchDocument<Assure>(`ci_cabinets/${cabinetId}/ci_assures/${assureId}`);
  }

  /** Dossiers d'un assuré, du plus récent au plus ancien. */
  watchDossiersOf(cabinetId: string, assureId: string): Observable<Dossier[]> {
    return this._database
      .watchCollection<Dossier>(`ci_cabinets/${cabinetId}/ci_dossiers`, {
        filters: [{ field: 'assureId', operator: '==', value: assureId }],
      })
      .pipe(map(dossiers => dossiers.filter(dossier => !dossier.deletedAt).sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))));
  }

  /** Crée l'assuré et renvoie son identifiant. */
  create(cabinetId: string, uid: string, data: AssureData): Observable<string> {
    return this._database.add(`ci_cabinets/${cabinetId}/ci_assures`, {
      ...data,
      createdBy: uid,
      createdAt: this._database.serverTimestamp(),
    });
  }

  /** Met le client et ses dossiers dans la corbeille (admin) : restaurables depuis la page Corbeille. */
  remove(assureId: string): Observable<{ ok: boolean }> {
    return this._backend.call('corbeille-supprimer', { kind: 'assure', id: assureId });
  }

  update(cabinetId: string, assureId: string, data: AssureData): Observable<void> {
    return this._database.update(`ci_cabinets/${cabinetId}/ci_assures/${assureId}`, {
      ...data,
      updatedAt: this._database.serverTimestamp(),
    });
  }
}
