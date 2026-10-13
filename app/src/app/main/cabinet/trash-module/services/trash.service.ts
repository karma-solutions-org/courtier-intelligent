import { inject, Injectable } from '@angular/core';
import { Assure, Dossier } from '@shared';
import { combineLatest, map, Observable, of } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';

export type TrashKind = 'assure' | 'dossier';

/** Corbeille du cabinet : lecture des éléments supprimés, restauration et suppression définitive (functions corbeille-*). */
@Injectable({ providedIn: 'root' })
export class TrashService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _backend = inject(BackendProvider);

  /**
   * Clients dans la corbeille, du plus récemment supprimé au plus ancien : les `limit` premiers (défilement infini).
   * Le tri sur `deletedAt` écarte d'office les clients actifs (Firestore ignore les documents sans ce champ).
   */
  watchDeletedAssures(cabinetId: string, limit: number): Observable<{ items: Assure[]; hasMore: boolean }> {
    return this._database
      .watchCollection<Assure>(`ci_cabinets/${cabinetId}/ci_assures`, { orderBy: [{ field: 'deletedAt', direction: 'desc' }], limit })
      .pipe(map((items) => ({ items: items.filter((assure) => !!assure.deletedAt), hasMore: items.length >= limit })));
  }

  /** Dossiers dans la corbeille, du plus récemment supprimé au plus ancien : les `limit` premiers. */
  watchDeletedDossiers(cabinetId: string, limit: number): Observable<{ items: Dossier[]; hasMore: boolean }> {
    return this._database
      .watchCollection<Dossier>(`ci_cabinets/${cabinetId}/ci_dossiers`, { orderBy: [{ field: 'deletedAt', direction: 'desc' }], limit })
      .pipe(map((items) => ({ items: items.filter((dossier) => !!dossier.deletedAt), hasMore: items.length >= limit })));
  }

  /** Clients des dossiers affichés (le nom d'un dossier supprimé vient de son client, actif ou non). */
  watchAssuresByIds(cabinetId: string, ids: string[]): Observable<Assure[]> {
    if (!ids.length) return of([]);
    return combineLatest(ids.map((id) => this._database.watchDocument<Assure>(`ci_cabinets/${cabinetId}/ci_assures/${id}`))).pipe(
      map((assures) => assures.filter((assure): assure is Assure => !!assure)),
    );
  }

  restore(kind: TrashKind, id: string): Observable<{ ok: boolean }> {
    return this._backend.call('corbeille-restaurer', { kind, id });
  }

  deleteForever(kind: TrashKind, id: string): Observable<{ ok: boolean }> {
    return this._backend.call('corbeille-supprimerDefinitivement', { kind, id });
  }
}

export function byDeletedAt(a: { deletedAt?: unknown }, b: { deletedAt?: unknown }): number {
  const time = (value: unknown) => (value as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
  return time(b.deletedAt) - time(a.deletedAt);
}
