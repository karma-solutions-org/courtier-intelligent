import { inject, Injectable } from '@angular/core';
import { Assure, AssureDocument, AssureDuplicateReason, AssureDocumentType, AssureOcrValues, AssureReadableType, Dossier } from '@shared';
import { combineLatest, map, Observable, of } from 'rxjs';
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
  readPiece(type: AssureReadableType, storagePath: string): Observable<{ values: AssureOcrValues; readable: boolean }> {
    return this._backend.call('assures-lirePiece', { type, storagePath });
  }

  /** Type de la pièce reconnu par l'IA (`null` : non reconnu), pour le pré-sélectionner. */
  recognizePiece(storagePath: string): Observable<{ type: AssureDocumentType | null }> {
    return this._backend.call('assures-reconnaitrePiece', { storagePath });
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

  /**
   * Recherche Elasticsearch (function recherche-clients) : identifiants des clients du cabinet correspondant au texte,
   * dans l'ordre de pertinence. Couvre tout le portefeuille, pas seulement la tranche chargée.
   */
  search(query: string, size = 50): Observable<string[]> {
    return this._backend
      .call<{ q: string; size: number }, { ids: string[] }>('recherche-clients', { q: query, size })
      .pipe(map((result) => result.ids));
  }

  /**
   * Doublons possibles côté serveur (function assures-verifierDoublon) : tout le cabinet, corbeille comprise,
   * par SIRET, email, identité (nom + date de naissance) ou raison sociale.
   */
  verifyDuplicates(candidate: {
    firstName?: string; lastName?: string; birthDate?: string; email?: string; siret?: string; companyName?: string; excludeId?: string;
  }): Observable<{ id: string; reasons: AssureDuplicateReason[]; deleted: boolean }[]> {
    const data = Object.fromEntries(Object.entries(candidate).filter(([, value]) => typeof value === 'string' && value.trim()));
    return this._backend
      .call<typeof data, { duplicates: { id: string; reasons: AssureDuplicateReason[]; deleted: boolean }[] }>('assures-verifierDoublon', data)
      .pipe(map((result) => result.duplicates));
  }

  /** Fiches des clients trouvés, en direct et dans l'ordre donné (clients dans la corbeille ou disparus écartés). */
  watchAssuresByIds(cabinetId: string, ids: string[]): Observable<Assure[]> {
    if (!ids.length) return of([]);
    return combineLatest(ids.map((id) => this.watchAssure(cabinetId, id))).pipe(
      map((assures) => assures.filter((assure): assure is Assure => !!assure && !assure.deletedAt)),
    );
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

  /**
   * Crée l'assuré (function assures-creer) et renvoie son identifiant. Refus BLOQUANT (`duplicate_assure`) si un
   * client du cabinet hors corbeille a le même SIRET ou le même email ; l'homonymie reste un simple avertissement.
   */
  create(data: AssureData): Observable<string> {
    return this._backend.call<AssureData, { id: string }>('assures-creer', data).pipe(map(result => result.id));
  }

  /** Met le client et ses dossiers dans la corbeille (admin) : restaurables depuis la page Corbeille. */
  remove(assureId: string): Observable<{ ok: boolean }> {
    return this._backend.call('corbeille-supprimer', { kind: 'assure', id: assureId });
  }

  /**
   * Modifie la fiche (function assures-modifier) : mêmes contrôles que la création, dont le doublon BLOQUANT
   * (`duplicate_assure`) sur le SIRET ou l'email d'un autre client. Les règles refusent ce changement en écriture directe.
   */
  update(assureId: string, data: AssureData): Observable<void> {
    return this._backend
      .call<{ id: string; fiche: AssureData }, { id: string }>('assures-modifier', { id: assureId, fiche: data })
      .pipe(map(() => undefined));
  }
}
