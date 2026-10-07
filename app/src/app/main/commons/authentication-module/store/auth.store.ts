import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { exhaustMap, pipe, switchMap, tap } from 'rxjs';
import { AuthUser } from '../../../../core/providers/authentication.provider';
import { CommonRouteContainerModel } from '../../../../core/routing/common-routes/common-route-container.model';
import {
  resetRequestStatus,
  setError,
  setFulfilled,
  setPending,
  withRequestStatus,
} from '../../../../core/store-features/with-request-status';
import { CredentialsModel } from '../models/credentials.model';
import { SignupModel } from '../models/signup.model';
import { AuthService } from '../services/auth.service';
import { toAuthErrorMessage } from '../util/auth-error.utils';

interface AuthState {
  user: AuthUser | null;
  /** Vrai dès que Firebase a indiqué l'état de connexion initial. */
  initialized: boolean;
  resetEmailSent: boolean;
  /** Page où revenir après connexion ou inscription (ex. acceptation d'une invitation). */
  redirectUrl: string | null;
}

/** Store global de l'authentification : utilisateur courant, cabinet et rôle. */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<AuthState>({ user: null, initialized: false, resetEmailSent: false, redirectUrl: null }),
  withRequestStatus(),
  withComputed(({ user }) => ({
    isAuthenticated: computed(() => user() !== null),
    tenantId: computed(() => user()?.tenantId ?? null),
    role: computed(() => user()?.role ?? null),
  })),
  withMethods((store, authService = inject(AuthService), router = inject(Router)) => ({
    signIn: rxMethod<CredentialsModel>(
      pipe(
        tap(() => patchState(store, setPending())),
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
        tap(() => patchState(store, setPending())),
        exhaustMap(signup =>
          authService.signUp(signup).pipe(
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
    signOut: rxMethod<void>(
      pipe(
        exhaustMap(() =>
          authService.signOut().pipe(
            tapResponse({
              next: () => router.navigateByUrl(CommonRouteContainerModel.LANDING_ROUTE.url),
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
      pipe(switchMap(() => authService.user$.pipe(tap(user => patchState(store, { user, initialized: true }))))),
    ),
  })),
  withHooks({ onInit: store => store._listenUser() }),
);
