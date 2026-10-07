import { Provider } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { AuthenticationProvider, AuthUser } from '../../../providers/authentication.provider';

/**
 * Remplace Firebase Auth : l'utilisateur connecté se change à la main avec [signInAs]
 * et [signOutUser]. `undefined` = Firebase n'a pas encore donné l'état initial.
 */
export class FakeAuthenticationProvider extends AuthenticationProvider {
  private readonly _user = new BehaviorSubject<AuthUser | null | undefined>(undefined);

  readonly user$ = new Observable<AuthUser | null>(subscriber =>
    this._user.subscribe(user => {
      if (user !== undefined) subscriber.next(user);
    }),
  );

  readonly signIn = vi.fn((_email: string, _password: string) => of(undefined));
  readonly signUp = vi.fn((_name: string, _email: string, _password: string) => of(undefined));
  readonly signOut = vi.fn(() => of(undefined));
  readonly sendPasswordReset = vi.fn((_email: string, _continueUrl: string) => of(undefined));
  readonly refreshToken = vi.fn(() => of(undefined));

  signInAs(user: AuthUser): void {
    this._user.next(user);
  }

  signOutUser(): void {
    this._user.next(null);
  }
}

export function provideFakeAuthentication(fake: FakeAuthenticationProvider): Provider {
  return { provide: AuthenticationProvider, useValue: fake };
}
