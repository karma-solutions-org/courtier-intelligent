import { inject, Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { FIREBASE_FUNCTIONS } from './firebase';

/** Port backend : appels aux Cloud Functions. */
export abstract class BackendProvider {
  abstract call<TRequest, TResponse>(name: string, data: TRequest): Observable<TResponse>;
}

@Injectable()
export class FirebaseFunctionsProvider extends BackendProvider {
  private readonly _functions = inject(FIREBASE_FUNCTIONS);

  call<TRequest, TResponse>(name: string, data: TRequest): Observable<TResponse> {
    // Le SDK Functions est chargé au premier appel (hors du bundle initial).
    return defer(async () => {
      const [{ httpsCallable }, functions] = await Promise.all([import('firebase/functions'), this._functions()]);
      return (await httpsCallable<TRequest, TResponse>(functions, name)(data)).data;
    });
  }
}
