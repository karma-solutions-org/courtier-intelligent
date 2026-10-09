import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, exhaustMap, filter, interval, merge, of, pipe, startWith, switchMap, take, tap } from 'rxjs';
import { AuthUser } from '../../../../core/providers/authentication.provider';
import { CommonRouteContainerModel } from '../../../../core/routing/common-routes/common-route-container.model';
import {
  resetRequestStatus,
  setError,
  setFulfilled,
  setPending,
  withRequestStatus,
} from '../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { CredentialsModel } from '../models/credentials.model';
import { SignupModel } from '../models/signup.model';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { toAuthErrorMessage } from '../util/auth-error.utils';

/** Fréquence du signal de vie de la session (le serveur l'expire après 2 minutes sans signal). */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * `none` : pas de session (déconnecté, ou compte sans cabinet).
 * `opening` : ouverture en cours. `open` : cet appareil est l'appareil autorisé.
 */
type SessionStatus = 'none' | 'opening' | 'open';

interface AuthState {
  user: AuthUser | null;
  /** Vrai dès que Firebase a indiqué l'état de connexion initial. */
  initialized: boolean;
  resetEmailSent: boolean;
  /** Page où revenir après connexion ou inscription (ex. acceptation d'une invitation). */
  redirectUrl: string | null;
  sessionStatus: SessionStatus;
  /** Message affiché sur la page de connexion (ex. compte déjà connecté sur un autre appareil). */
  sessionNotice: string | null;
}

/** Store global de l'authentification : utilisateur courant, cabinet, rôle et session de l'appareil. */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<AuthState>({
    user: null,
    initialized: false,
    resetEmailSent: false,
    redirectUrl: null,
    sessionStatus: 'none',
    sessionNotice: null,
  }),
  withRequestStatus(),
  withComputed(({ user, initialized, sessionStatus }) => ({
    isAuthenticated: computed(() => user() !== null),
    cabinetId: computed(() => user()?.cabinetId ?? null),
    role: computed(() => user()?.role ?? null),
    /** Prêt à afficher l'espace : état connu et, pour un membre de cabinet, session ouverte sur cet appareil. */
    ready: computed(() => initialized() && !(user()?.cabinetId && sessionStatus() !== 'open')),
  })),
  // ── Session : un seul appareil connecté par utilisateur ───────────────────
  withMethods((store, authService = inject(AuthService), session = inject(SessionService), router = inject(Router)) => {
    /** Déconnecte cet appareil sans fermer la session (elle appartient à un autre appareil). */
    const kickOut = (notice: string) => {
      patchState(store, { sessionStatus: 'none', sessionNotice: notice });
      authService
        .signOut()
        .pipe(take(1))
        .subscribe(() => router.navigateByUrl(CommonRouteContainerModel.SIGNIN_ROUTE.url));
    };

    return {
      _openSession: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { sessionStatus: 'opening' })),
          exhaustMap(() =>
            session.open().pipe(
              tapResponse({
                next: () => patchState(store, { sessionStatus: 'open', sessionNotice: null }),
                error: error => kickOut(toBackendErrorMessage(error)),
              }),
            ),
          ),
        ),
      ),
      /** Signal de vie, et déconnexion si la session de ce membre n'est plus celle de cet appareil. */
      _keepAlive: rxMethod<{ cabinetId: string; uid: string; authTime: number | null } | null>(
        pipe(
          switchMap(target =>
            target
              ? merge(
                  interval(HEARTBEAT_INTERVAL_MS).pipe(
                    startWith(0),
                    switchMap(() => session.heartbeat(target.cabinetId, target.uid).pipe(catchError(() => EMPTY))),
                  ),
                  // La session enregistrée n'est plus celle de cette connexion : fermée, ou reprise par un autre appareil.
                  session.watchActiveSession(target.cabinetId, target.uid).pipe(
                    filter(active => active?.authTime !== target.authTime),
                    take(1),
                    tap(() => kickOut('Votre session a été fermée. Reconnectez-vous sur cet appareil.')),
                  ),
                )
              : EMPTY,
          ),
        ),
      ),
    };
  }),
  // ── Connexion, inscription, déconnexion ───────────────────────────────────
  withMethods((store, authService = inject(AuthService), session = inject(SessionService), router = inject(Router)) => ({
    signIn: rxMethod<CredentialsModel>(
      pipe(
        tap(() => patchState(store, setPending(), { sessionNotice: null })),
        exhaustMap(credentials =>
          authService.signIn(credentials).pipe(
            tapResponse({
              next: () => {
                patchState(store, setFulfilled());
                router.navigateByUrl(store.redirectUrl() ?? CommonRouteContainerModel.HOME_ROUTE.url);
                patchState(store, { redirectUrl: null });
              },
              error: error => patchState(store, setError(toAuthErrorMessage(error))),
            }),
          ),
        ),
      ),
    ),
    signUp: rxMethod<SignupModel>(
      pipe(
        tap(() => patchState(store, setPending(), { sessionNotice: null })),
        exhaustMap(signup =>
          authService.signUp(signup).pipe(
            tapResponse({
              next: () => {
                patchState(store, setFulfilled());
                router.navigateByUrl(store.redirectUrl() ?? CommonRouteContainerModel.HOME_ROUTE.url);
                patchState(store, { redirectUrl: null });
              },
              error: error => patchState(store, setError(toSignupErrorMessage(error))),
            }),
          ),
        ),
      ),
    ),
    signOut: rxMethod<void>(
      pipe(
        exhaustMap(() =>
          // Ferme la session de cet appareil : l'utilisateur peut aussitôt se connecter ailleurs.
          (store.sessionStatus() === 'open' ? session.close() : of(undefined)).pipe(
            switchMap(() => authService.signOut()),
            tapResponse({
              next: () => {
                patchState(store, { sessionStatus: 'none' });
                router.navigateByUrl(CommonRouteContainerModel.LANDING_ROUTE.url);
              },
              error: error => patchState(store, setError(toAuthErrorMessage(error))),
            }),
          ),
        ),
      ),
    ),
    sendPasswordReset: rxMethod<string>(
      pipe(
        tap(() => patchState(store, setPending(), { resetEmailSent: false })),
        exhaustMap(email =>
          authService.sendPasswordReset(email).pipe(
            tapResponse({
              next: () => patchState(store, setFulfilled(), { resetEmailSent: true }),
              error: error => patchState(store, setError(toAuthErrorMessage(error))),
            }),
          ),
        ),
      ),
    ),
    /** N'accepte que des chemins internes à l'app, pour éviter toute redirection externe. */
    setRedirectUrl: (url: string | null) =>
      patchState(store, { redirectUrl: url && url.startsWith('/') && !url.startsWith('//') ? url : null }),
    refreshClaims: rxMethod<void>(pipe(exhaustMap(() => authService.refreshToken()))),
    resetStatus: () => patchState(store, resetRequestStatus(), { resetEmailSent: false }),
    _listenUser: rxMethod<void>(
      pipe(
        switchMap(() =>
          authService.user$.pipe(
            tap(user => {
              patchState(store, { user, initialized: true });
              if (!user) {
                patchState(store, { sessionStatus: 'none' });
              } else if (user.cabinetId && store.sessionStatus() === 'none') {
                store._openSession();
              }
            }),
          ),
        ),
      ),
    ),
  })),
  withHooks({
    onInit: store => {
      store._listenUser();
      store._keepAlive(
        computed(() => {
          const user = store.user();
          return store.sessionStatus() === 'open' && user?.cabinetId
            ? { cabinetId: user.cabinetId, uid: user.uid, authTime: user.authTime }
            : null;
        }),
      );
    },
  }),
);

/** L'inscription enchaîne Firebase Auth (codes « auth/… ») puis la création du cabinet (function). */
function toSignupErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  return code.startsWith('auth/') ? toAuthErrorMessage(error) : toBackendErrorMessage(error);
}
