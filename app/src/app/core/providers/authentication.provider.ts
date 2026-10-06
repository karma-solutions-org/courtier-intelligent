import { inject, Injectable } from '@angular/core';
import {
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { from, map, Observable } from 'rxjs';
import { FIREBASE_AUTH } from './firebase';

export type UserRole = 'superadmin' | 'admin' | 'courtier';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  tenantId: string | null;
  role: UserRole | null;
}

/** Port d'authentification : les services ne connaissent que cette classe. */
export abstract class AuthenticationProvider {
  abstract readonly user$: Observable<AuthUser | null>;
  abstract signIn(email: string, password: string): Observable<void>;
  abstract signOut(): Observable<void>;
  abstract sendPasswordReset(email: string): Observable<void>;
}

@Injectable()
export class FireauthProvider extends AuthenticationProvider {
  private readonly _auth = inject(FIREBASE_AUTH);

  /** Utilisateur courant avec ses claims (tenantId, role), réémis à chaque rafraîchissement du token. */
  readonly user$ = new Observable<AuthUser | null>(subscriber =>
    onIdTokenChanged(this._auth, async user => {
      if (!user) {
        subscriber.next(null);
        return;
      }
      const { claims } = await user.getIdTokenResult();
      subscriber.next({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        tenantId: (claims['tenantId'] as string | undefined) ?? null,
        role: (claims['role'] as UserRole | undefined) ?? null,
      });
    }),
  );

  signIn(email: string, password: string): Observable<void> {
    return from(signInWithEmailAndPassword(this._auth, email, password)).pipe(map(() => undefined));
  }

  signOut(): Observable<void> {
    return from(signOut(this._auth));
  }

  sendPasswordReset(email: string): Observable<void> {
    return from(sendPasswordResetEmail(this._auth, email));
  }
}
