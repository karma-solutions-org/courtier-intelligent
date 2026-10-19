import { inject, Injectable } from '@angular/core';
import { Assure, Dossier } from '@shared';
import { map, Observable } from 'rxjs';
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

  /**
   * Recherche Elasticsearch dans la corbeille (function recherche-corbeille) : texte, type et période de suppression
   * (`from`/`to` en millisecondes), du plus récemment supprimé au plus ancien sans texte.
   */
  search(params: { q?: string; kind?: 'client' | 'dossier'; from?: number; to?: number; size: number; offset?: number }): Observable<{ kind: 'client' | 'dossier'; id: string }[]> {
    const data = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined));
    return this._backend
      .call<typeof data, { items: { kind: 'client' | 'dossier'; id: string }[] }>('recherche-corbeille', data)
      .pipe(map((result) => result.items));
  }

  /** Dossiers trouvés, en direct et dans l'ordre donné (restaurés ou disparus écartés). */
  watchDeletedDossiersByIds(cabinetId: string, ids: string[]): Observable<Dossier[]> {
    return this._database
      .watchByIds<Dossier>(`ci_cabinets/${cabinetId}/ci_dossiers`, ids)
      .pipe(map((dossiers) => dossiers.filter((dossier) => !!dossier.deletedAt)));
  }

  /** Clients des dossiers affichés (le nom d'un dossier supprimé vient de son client, actif ou non). */
  watchAssuresByIds(cabinetId: string, ids: string[]): Observable<Assure[]> {
    return this._database.watchByIds<Assure>(`ci_cabinets/${cabinetId}/ci_assures`, ids);
  }

  restore(kind: TrashKind, id: string): Observable<{ ok: boolean }> {
    return this._backend.call('corbeille-restaurer', { kind, id });
  }

  deleteForever(kind: TrashKind, id: string): Observable<{ ok: boolean }> {
    return this._backend.call('corbeille-supprimerDefinitivement', { kind, id });
  }
}
