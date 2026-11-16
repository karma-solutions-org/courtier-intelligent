import { inject, Injectable } from '@angular/core';
import { defer, Observable, Subject, tap } from 'rxjs';
import { toBackendErrorReason } from '../utils/backend-error.utils';
import { FIREBASE_FUNCTIONS } from './firebase';

/** Port backend : appels aux Cloud Functions. */
export abstract class BackendProvider {
  abstract call<TRequest, TResponse>(name: string, data: TRequest): Observable<TResponse>;
  /** Émis quand le serveur refuse un appel : la session de cet appareil a été fermée (ou reprise ailleurs). */
  readonly sessionClosed = new Subject<void>();
}

@Injectable()
export class FirebaseFunctionsProvider extends BackendProvider {
  private readonly _functions = inject(FIREBASE_FUNCTIONS);

  call<TRequest, TResponse>(name: string, data: TRequest): Observable<TResponse> {
    // Le SDK Functions est chargé au premier appel (hors du bundle initial).
    return defer(async () => {
      const [{ httpsCallable }, functions] = await Promise.all([import('firebase/functions'), this._functions()]);
      return (await httpsCallable<TRequest, TResponse>(functions, name)(data)).data;
    }).pipe(
      tap({ error: error => toBackendErrorReason(error) === 'session_closed' && this.sessionClosed.next() }),
    );
  }
}
