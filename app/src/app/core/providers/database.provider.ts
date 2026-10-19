import { inject, Injectable } from '@angular/core';
import type { WhereFilterOp } from 'firebase/firestore';
import { catchError, combineLatest, defer, map, Observable, of } from 'rxjs';
import { FIRESTORE } from './firebase';

export interface QueryFilter {
  field: string;
  operator: WhereFilterOp;
  value: unknown;
}

export interface QueryModel {
  filters?: QueryFilter[];
  orderBy?: { field: string; direction?: 'asc' | 'desc' }[];
  limit?: number;
}

/** Port base de données : les services ne connaissent que cette classe. */
export abstract class DatabaseProvider {
  abstract watchDocument<T>(path: string): Observable<T | null>;
  abstract watchCollection<T>(path: string, queryModel?: QueryModel): Observable<T[]>;
  /** Documents dont l'identifiant figure dans `ids`, en direct et dans l'ordre donné (absents écartés). */
  abstract watchByIds<T extends { id: string }>(path: string, ids: string[]): Observable<T[]>;
  abstract add<T extends object>(path: string, data: T): Observable<string>;
  abstract set<T extends object>(path: string, data: T, merge?: boolean): Observable<void>;
  abstract update(path: string, data: Record<string, unknown>): Observable<void>;
  abstract delete(path: string): Observable<void>;
  /** Valeur à utiliser pour les champs createdAt / updatedAt. */
  abstract serverTimestamp(): unknown;
}

/** Marqueur de `serverTimestamp()` : remplacé par la vraie valeur Firestore à l'écriture (SDK chargé à la demande). */
const SERVER_TIMESTAMP: unique symbol = Symbol('serverTimestamp');
type ServerTimestampMarker = typeof SERVER_TIMESTAMP;

function isServerTimestamp(value: unknown): value is ServerTimestampMarker {
  return value === SERVER_TIMESTAMP;
}

/** Objet littéral (pas une instance Timestamp, Date, FieldValue…), à parcourir récursivement. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Firestore, chargé à la première lecture ou écriture : le SDK (le plus lourd de Firebase) reste hors du bundle initial.
 */
@Injectable()
export class FirestoreProvider extends DatabaseProvider {
  private readonly _firestore = inject(FIRESTORE);

  private async _sdk() {
    const [sdk, firestore] = await Promise.all([import('firebase/firestore'), this._firestore()]);
    return { sdk, firestore };
  }

  /** Écoute en temps réel, ouverte une fois le SDK chargé ; se désabonner avant ce chargement n'ouvre rien. */
  private _listen<T>(open: (next: (value: T) => void, error: (error: unknown) => void) => Promise<() => void>): Observable<T> {
    return new Observable<T>(subscriber => {
      let unsubscribe: (() => void) | null = null;
      let closed = false;
      open(
        value => subscriber.next(value),
        error => subscriber.error(error),
      ).then(
        stop => (closed ? stop() : (unsubscribe = stop)),
        error => subscriber.error(error),
      );
      return () => {
        closed = true;
        unsubscribe?.();
      };
    });
  }

  /** Remplace les marqueurs de date serveur (y compris dans les objets et tableaux imbriqués) par la valeur Firestore. */
  private _withTimestamps<T extends object>(data: T, serverTimestamp: () => unknown): T {
    const replace = (value: unknown): unknown => {
      if (isServerTimestamp(value)) return serverTimestamp();
      if (Array.isArray(value)) return value.map(replace);
      if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
      return value;
    };
    return replace(data) as T;
  }

  watchDocument<T>(path: string): Observable<T | null> {
    return this._listen<T | null>(async (next, error) => {
      const { sdk, firestore } = await this._sdk();
      return sdk.onSnapshot(
        sdk.doc(firestore, path),
        snapshot => next(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : null),
        error,
      );
    });
  }

  /**
   * Requêtes `documentId() in` par lots de 30 (limite Firestore) au lieu d'un écouteur par document. Un lot en échec
   * (ex. droits) est ignoré pour ne pas vider tout le résultat.
   */
  watchByIds<T extends { id: string }>(path: string, ids: string[]): Observable<T[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return of([]);
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
    const watchChunk = (chunk: string[]) =>
      this._listen<T[]>(async (next, error) => {
        const { sdk, firestore } = await this._sdk();
        return sdk.onSnapshot(
          sdk.query(sdk.collection(firestore, path), sdk.where(sdk.documentId(), 'in', chunk)),
          snapshot => next(snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as T)),
          error,
        );
      }).pipe(catchError(() => of([] as T[])));
    return combineLatest(chunks.map(watchChunk)).pipe(
      map(results => {
        const byId = new Map(results.flat().map(item => [item.id, item]));
        return ids.map(id => byId.get(id)).filter((item): item is T => !!item);
      }),
    );
  }

  watchCollection<T>(path: string, queryModel: QueryModel = {}): Observable<T[]> {
    return this._listen<T[]>(async (next, error) => {
      const { sdk, firestore } = await this._sdk();
      const constraints = [
        ...(queryModel.filters ?? []).map(f => sdk.where(f.field, f.operator, f.value)),
        ...(queryModel.orderBy ?? []).map(o => sdk.orderBy(o.field, o.direction ?? 'asc')),
        ...(queryModel.limit ? [sdk.limit(queryModel.limit)] : []),
      ];
      return sdk.onSnapshot(
        sdk.query(sdk.collection(firestore, path), ...constraints),
        snapshot => next(snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as T)),
        error,
      );
    });
  }

  add<T extends object>(path: string, data: T): Observable<string> {
    return defer(async () => {
      const { sdk, firestore } = await this._sdk();
      return (await sdk.addDoc(sdk.collection(firestore, path), this._withTimestamps(data, sdk.serverTimestamp))).id;
    });
  }

  set<T extends object>(path: string, data: T, merge = false): Observable<void> {
    return defer(async () => {
      const { sdk, firestore } = await this._sdk();
      await sdk.setDoc(sdk.doc(firestore, path), this._withTimestamps(data, sdk.serverTimestamp), { merge });
    });
  }

  update(path: string, data: Record<string, unknown>): Observable<void> {
    return defer(async () => {
      const { sdk, firestore } = await this._sdk();
      await sdk.updateDoc(sdk.doc(firestore, path), this._withTimestamps(data, sdk.serverTimestamp));
    });
  }

  delete(path: string): Observable<void> {
    return defer(async () => {
      const { sdk, firestore } = await this._sdk();
      await sdk.deleteDoc(sdk.doc(firestore, path));
    });
  }

  serverTimestamp(): ServerTimestampMarker {
    return SERVER_TIMESTAMP;
  }
}
