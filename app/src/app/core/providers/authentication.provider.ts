import { inject, Injectable } from '@angular/core';
import { UserRole } from '@shared';
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { catchError, from, map, Observable, of, throwError } from 'rxjs';
import { FIREBASE_AUTH } from './firebase';

export type { UserRole };

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  cabinetId: string | null;
  role: UserRole | null;
}

/** Port d'authentification : les services ne connaissent que cette classe. */
export abstract class AuthenticationProvider {
  abstract readonly user$: Observable<AuthUser | null>;
  abstract signIn(email: string, password: string): Observable<void>;
  abstract signUp(displayName: string, email: string, password: string): Observable<void>;
  abstract signOut(): Observable<void>;
  abstract sendPasswordReset(email: string, continueUrl: string): Observable<void>;
  /** Recharge le token pour récupérer des claims modifiés côté serveur (cabinet, rôle). */
  abstract refreshToken(): Observable<void>;
}

@Injectable()
export class FireauthProvider extends AuthenticationProvider {
  private readonly _auth = inject(FIREBASE_AUTH);

  /** Utilisateur courant avec ses claims (cabinetId, role), réémis à chaque rafraîchissement du token. */
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
        cabinetId: (claims['ci_cabinet_id'] as string | undefined) ?? null,
        role: (claims['ci_role'] as UserRole | undefined) ?? null,
      });
    }),
  );

  signIn(email: string, password: string): Observable<void> {
    return from(signInWithEmailAndPassword(this._auth, email, password)).pipe(map(() => undefined));
  }

  signUp(displayName: string, email: string, password: string): Observable<void> {
    return from(
      createUserWithEmailAndPassword(this._auth, email, password).then(({ user }) => updateProfile(user, { displayName })),
    );
  }

  signOut(): Observable<void> {
    return from(signOut(this._auth));
  }

  sendPasswordReset(email: string, continueUrl: string): Observable<void> {
    // Email rédigé en français ; après le changement de mot de passe, le lien ramène à la connexion.
    this._auth.languageCode = 'fr';
    return from(sendPasswordResetEmail(this._auth, email, { url: continueUrl })).pipe(
      catchError(error =>
        // Ne pas révéler si un compte existe pour cet email.
        (error as { code?: string })?.code === 'auth/user-not-found' ? of(undefined) : throwError(() => error),
      ),
    );
  }

  refreshToken(): Observable<void> {
    const user = this._auth.currentUser;
    return user ? from(user.getIdToken(true)).pipe(map(() => undefined)) : of(undefined);
  }
}
