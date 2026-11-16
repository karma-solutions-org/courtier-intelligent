import type { WhereFilterOp } from 'firebase/firestore';
import type { QueryModel } from './database.provider';

/** Opérateurs de filtre (mêmes noms que ngx-sg). */
export enum FilterOperator {
  isEqualTo = '==',
  isNotEqualTo = '!=',
  isLessThan = '<',
  isLessThanOrEqualTo = '<=',
  isGreaterThan = '>',
  isGreaterThanOrEqualTo = '>=',
  arrayContains = 'array-contains',
  arrayContainsAny = 'array-contains-any',
  whereIn = 'in',
  whereNotIn = 'not-in',
}

/** Sens d'un tri (mêmes noms que ngx-sg). */
export enum OrderByDirection {
  asc = 'asc',
  desc = 'desc',
}

/**
 * Construit une requête lisible et typée, au lieu d'un objet écrit à la main (même usage que `DatabaseQueryBuilder` de
 * ngx-sg) :
 *
 * ```ts
 * new DatabaseQueryBuilder().orderBy('createdAt', OrderByDirection.desc).limit(20).build();
 * ```
 */
export class DatabaseQueryBuilder {
  private readonly _query: Required<QueryModel> = { filters: [], orderBy: [], limit: 0 };

  where(field: string, operator: FilterOperator, value: unknown): this {
    this._query.filters.push({ field, operator: operator as WhereFilterOp, value });
    return this;
  }

  orderBy(field: string, direction: OrderByDirection = OrderByDirection.asc): this {
    this._query.orderBy.push({ field, direction });
    return this;
  }

  limit(limit: number): this {
    this._query.limit = limit;
    return this;
  }

  build(): QueryModel {
    return {
      ...(this._query.filters.length ? { filters: [...this._query.filters] } : {}),
      ...(this._query.orderBy.length ? { orderBy: [...this._query.orderBy] } : {}),
      ...(this._query.limit ? { limit: this._query.limit } : {}),
    };
  }
}
