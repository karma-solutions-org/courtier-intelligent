import { inject, Injectable } from '@angular/core';
import { UserRole } from '@shared';
import type { Auth } from 'firebase/auth';
import { catchError, exhaustMap, first, from, interval, map, Observable, of, switchMap, throwError } from 'rxjs';
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
  /** Vrai une fois le lien de vérification cliqué. */
  emailVerified: boolean;
}

/** Port d'authentification : les services ne connaissent que cette classe. */
export abstract class AuthenticationProvider {
  abstract readonly user$: Observable<AuthUser | null>;
  abstract signIn(email: string, password: string): Observable<void>;
  abstract signUp(displayName: string, email: string, password: string): Observable<void>;
  /** Émet une fois que l'utilisateur courant a cliqué le lien de vérification (token rechargé). */
  abstract waitForEmailVerification(): Observable<void>;
  /** Renvoie le lien de vérification à l'utilisateur courant. */
  abstract resendEmailVerification(): Observable<void>;
  abstract signOut(): Observable<void>;
  abstract sendPasswordReset(email: string, continueUrl: string): Observable<void>;
  /** Recharge le token pour récupérer des claims modifiés côté serveur (cabinet, rôle). */
  abstract refreshToken(): Observable<void>;
}

/** Fréquence de vérification du clic sur le lien reçu par email. */
const VERIFICATION_POLL_MS = 3_000;

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
              emailVerified: user.emailVerified,
            });
          }),
        ),
    ),
  );

  signIn(email: string, password: string): Observable<void> {
    return this._with((auth, fb) => fb.signInWithEmailAndPassword(auth, email, password)).pipe(map(() => undefined));
  }

  signUp(displayName: string, email: string, password: string): Observable<void> {
    return this._with(async (auth, fb) => {
      const { user } = await fb.createUserWithEmailAndPassword(auth, email, password);
      await fb.updateProfile(user, { displayName });
      // Le serveur exige une adresse vérifiée pour créer le cabinet : on envoie le lien tout de suite.
      auth.languageCode = 'fr';
      // Sans lien de retour : la page d'inscription restée ouverte ouvre elle-même la session.
      await fb.sendEmailVerification(user);
    });
  }

  waitForEmailVerification(): Observable<void> {
    // Le lien est ouvert dans un autre onglet : on recharge l'utilisateur jusqu'à voir l'adresse vérifiée.
    return interval(VERIFICATION_POLL_MS).pipe(
      exhaustMap(() =>
        this._with(async auth => {
          await auth.currentUser?.reload();
          return auth.currentUser?.emailVerified === true;
        }),
      ),
      first(verified => verified),
      // Le token doit porter email_verified pour que le serveur accepte la création du cabinet.
      switchMap(() => this.refreshToken()),
    );
  }

  resendEmailVerification(): Observable<void> {
    return this._with(async (auth, fb) => {
      if (!auth.currentUser) return;
      auth.languageCode = 'fr';
      await fb.sendEmailVerification(auth.currentUser);
    });
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
