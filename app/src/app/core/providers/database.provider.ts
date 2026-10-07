import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryConstraint,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  WhereFilterOp,
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';
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
  abstract add<T extends object>(path: string, data: T): Observable<string>;
  abstract set<T extends object>(path: string, data: T, merge?: boolean): Observable<void>;
  abstract update(path: string, data: Record<string, unknown>): Observable<void>;
  abstract delete(path: string): Observable<void>;
  /** Valeur à utiliser pour les champs createdAt / updatedAt. */
  abstract serverTimestamp(): unknown;
}

@Injectable()
export class FirestoreProvider extends DatabaseProvider {
  private readonly _firestore = inject(FIRESTORE);

  watchDocument<T>(path: string): Observable<T | null> {
    return new Observable<T | null>(subscriber =>
      onSnapshot(
        doc(this._firestore, path),
        snapshot => subscriber.next(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : null),
        error => subscriber.error(error),
      ),
    );
  }

  watchCollection<T>(path: string, queryModel: QueryModel = {}): Observable<T[]> {
    const constraints: QueryConstraint[] = [
      ...(queryModel.filters ?? []).map(f => where(f.field, f.operator, f.value)),
      ...(queryModel.orderBy ?? []).map(o => orderBy(o.field, o.direction ?? 'asc')),
      ...(queryModel.limit ? [limit(queryModel.limit)] : []),
    ];
    return new Observable<T[]>(subscriber =>
      onSnapshot(
        query(collection(this._firestore, path), ...constraints),
        snapshot => subscriber.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as T)),
        error => subscriber.error(error),
      ),
    );
  }

  add<T extends object>(path: string, data: T): Observable<string> {
    return from(addDoc(collection(this._firestore, path), data)).pipe(map(ref => ref.id));
  }

  set<T extends object>(path: string, data: T, merge = false): Observable<void> {
    return from(setDoc(doc(this._firestore, path), data, { merge }));
  }

  update(path: string, data: Record<string, unknown>): Observable<void> {
    return from(updateDoc(doc(this._firestore, path), data));
  }

  delete(path: string): Observable<void> {
    return from(deleteDoc(doc(this._firestore, path)));
  }

  serverTimestamp(): unknown {
    return serverTimestamp();
  }
}
