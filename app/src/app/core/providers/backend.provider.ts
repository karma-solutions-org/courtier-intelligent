import { inject, Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { from, map, Observable } from 'rxjs';
import { FIREBASE_FUNCTIONS } from './firebase';

/** Port backend : appels aux Cloud Functions. */
export abstract class BackendProvider {
  abstract call<TRequest, TResponse>(name: string, data: TRequest): Observable<TResponse>;
}

@Injectable()
export class FirebaseFunctionsProvider extends BackendProvider {
  private readonly _functions = inject(FIREBASE_FUNCTIONS);

  call<TRequest, TResponse>(name: string, data: TRequest): Observable<TResponse> {
    return from(httpsCallable<TRequest, TResponse>(this._functions, name)(data)).pipe(map(result => result.data));
  }
}
