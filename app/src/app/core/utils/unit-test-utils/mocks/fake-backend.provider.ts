import { Observable, of, throwError } from 'rxjs';
import { BackendProvider } from '../../../providers/backend.provider';

/**
 * Faux `BackendProvider` : enregistre chaque appel de Cloud Function (nom, données) et rend la réponse préparée avec
 * `givenResponse` (ou une erreur avec `givenError`).
 */
export class FakeBackendProvider extends BackendProvider {
  readonly calls: { name: string; data: unknown }[] = [];
  private readonly _responses = new Map<string, unknown>();
  private readonly _errors = new Map<string, unknown>();

  givenResponse(name: string, response: unknown): this {
    this._responses.set(name, response);
    return this;
  }

  givenError(name: string, error: unknown): this {
    this._errors.set(name, error);
    return this;
  }

  call<TRequest, TResponse>(name: string, data: TRequest): Observable<TResponse> {
    this.calls.push({ name, data });
    if (this._errors.has(name)) return throwError(() => this._errors.get(name));
    return of(this._responses.get(name) as TResponse);
  }
}
