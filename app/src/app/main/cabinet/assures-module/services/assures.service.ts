import { inject, Injectable } from '@angular/core';
import { Assure, Dossier } from '@shared';
import { map, Observable } from 'rxjs';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { AssureData } from '../models/assure-form.model';

@Injectable({ providedIn: 'root' })
export class AssuresService {
  private readonly _database = inject(DatabaseProvider);

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
