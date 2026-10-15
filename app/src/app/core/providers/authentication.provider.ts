import { inject, Injectable } from '@angular/core';
import { UserRole } from '@shared';
import type { Auth } from 'firebase/auth';
import { catchError, from, map, Observable, of, switchMap, throwError } from 'rxjs';
import { FIREBASE_AUTH } from './firebase';

export type { UserRole };

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  cabinetId: string | null;
  role: UserRole | null;
  /** Heure de connexion (secondes) de cet appareil : identifie sa session « un seul appareil ». */
  authTime: number | null;
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

/** SDK Firebase Auth chargé à la demande (hors du bundle initial). */
const sdk = () => import('firebase/auth');

@Injectable()
export class FireauthProvider extends AuthenticationProvider {
  private readonly _auth = inject(FIREBASE_AUTH);

  /** Exécute [action] avec l'instance Auth et le SDK, chargés à la première utilisation. */
  private _with<T>(action: (auth: Auth, fb: Awaited<ReturnType<typeof sdk>>) => Promise<T>): Observable<T> {
    return from(Promise.all([this._auth(), sdk()]).then(([auth, fb]) => action(auth, fb)));
  }

  /** Utilisateur courant avec ses claims (cabinetId, role), réémis à chaque rafraîchissement du token. */
  readonly user$ = from(Promise.all([this._auth(), sdk()])).pipe(
    switchMap(
      ([auth, { onIdTokenChanged }]) =>
        new Observable<AuthUser | null>(subscriber =>
          onIdTokenChanged(auth, async user => {
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
              authTime: Number(claims['auth_time']) || null,
            });
          }),
        ),
    ),
  );

  signIn(email: string, password: string): Observable<void> {
    return this._with((auth, fb) => fb.signInWithEmailAndPassword(auth, email, password)).pipe(map(() => undefined));
  }

  signUp(displayName: string, email: string, password: string): Observable<void> {
    return this._with((auth, fb) =>
      fb.createUserWithEmailAndPassword(auth, email, password).then(({ user }) => fb.updateProfile(user, { displayName })),
    );
  }

  signOut(): Observable<void> {
    return this._with((auth, fb) => fb.signOut(auth));
  }

  sendPasswordReset(email: string, continueUrl: string): Observable<void> {
    return this._with((auth, fb) => {
      // Email rédigé en français ; après le changement de mot de passe, le lien ramène à la connexion.
      auth.languageCode = 'fr';
      return fb.sendPasswordResetEmail(auth, email, { url: continueUrl });
    }).pipe(
      catchError(error =>
        // Ne pas révéler si un compte existe pour cet email.
        (error as { code?: string })?.code === 'auth/user-not-found' ? of(undefined) : throwError(() => error),
      ),
    );
  }

  refreshToken(): Observable<void> {
    return this._with(async auth => {
      await auth.currentUser?.getIdToken(true);
    });
  }
}
