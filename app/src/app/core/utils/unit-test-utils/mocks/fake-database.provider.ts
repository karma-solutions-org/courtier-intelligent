import { Observable, of } from 'rxjs';
import { DatabaseProvider, QueryModel } from '../../../providers/database.provider';

/** Un appel reçu par le faux provider : sa méthode, son chemin et ses paramètres. */
export interface DatabaseCall {
  method: 'watchDocument' | 'watchCollection' | 'watchByIds' | 'add' | 'set' | 'update' | 'delete';
  path: string;
  query?: QueryModel;
  ids?: string[];
  data?: unknown;
}

/**
 * Faux `DatabaseProvider` pour les tests de services : enregistre chaque appel (chemin, requête) et rend les documents
 * préparés par chemin avec `givenDocuments` / `givenDocument`. Les méthodes par entité (`list`, `watchById`…) sont celles
 * du vrai provider : le test vérifie donc aussi que l'entité donne le bon chemin.
 */
export class FakeDatabaseProvider extends DatabaseProvider {
  readonly calls: DatabaseCall[] = [];
  private readonly _collections = new Map<string, unknown[]>();
  private readonly _documents = new Map<string, unknown>();

  givenDocuments(path: string, documents: unknown[]): this {
    this._collections.set(path, documents);
    return this;
  }

  givenDocument(path: string, document: unknown): this {
    this._documents.set(path, document);
    return this;
  }

  protected watchDocument<T>(path: string): Observable<T | null> {
    this.calls.push({ method: 'watchDocument', path });
    return of((this._documents.get(path) as T | undefined) ?? null);
  }

  protected watchCollection<T>(path: string, query?: QueryModel): Observable<T[]> {
    this.calls.push({ method: 'watchCollection', path, query });
    return of((this._collections.get(path) ?? []) as T[]);
  }

  protected watchByIds<T extends { id: string }>(path: string, ids: string[]): Observable<T[]> {
    this.calls.push({ method: 'watchByIds', path, ids });
    const byId = new Map(((this._collections.get(path) ?? []) as T[]).map((item) => [item.id, item]));
    return of(ids.map((id) => byId.get(id)).filter((item): item is T => !!item));
  }

  protected add<T extends object>(path: string, data: T): Observable<string> {
    this.calls.push({ method: 'add', path, data });
    return of('new-id');
  }

  protected set<T extends object>(path: string, data: T): Observable<void> {
    this.calls.push({ method: 'set', path, data });
    return of(undefined);
  }

  protected update(path: string, data: Record<string, unknown>): Observable<void> {
    this.calls.push({ method: 'update', path, data });
    return of(undefined);
  }

  protected delete(path: string): Observable<void> {
    this.calls.push({ method: 'delete', path });
    return of(undefined);
  }

  serverTimestamp(): unknown {
    return 'SERVER_TIMESTAMP';
  }
}
