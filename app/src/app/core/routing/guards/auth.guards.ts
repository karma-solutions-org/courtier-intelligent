import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanMatchFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { UserRole } from '../../providers/authentication.provider';
import { AuthStore } from '../../../main/commons/authentication-module/store/auth.store';
import { CommonRouteContainerModel } from '../common-routes/common-route-container.model';

/** Attend que l'état de connexion soit connu (et la session de l'appareil ouverte), puis évalue la condition. */
function whenAuthReady(check: (store: InstanceType<typeof AuthStore>, router: Router) => boolean | ReturnType<Router['parseUrl']>) {
  const store = inject(AuthStore);
  const router = inject(Router);
  return toObservable(store.ready).pipe(
    filter(Boolean),
    take(1),
    map(() => check(store, router)),
  );
}

/** Réservé aux utilisateurs connectés ; sinon redirection vers la connexion. */
export const authGuard: CanMatchFn = () =>
  whenAuthReady((store, router) =>
    store.isAuthenticated() || router.parseUrl(CommonRouteContainerModel.SIGNIN_ROUTE.url),
  );

/** Réservé aux visiteurs non connectés (pages de connexion) ; sinon redirection vers l'accueil. */
export const guestGuard: CanMatchFn = () =>
  whenAuthReady((store, router) =>
    !store.isAuthenticated() || router.parseUrl(CommonRouteContainerModel.HOME_ROUTE.url),
  );

/** Réservé à certains rôles : le code de la zone n'est pas téléchargé pour les autres. */
export const roleGuard =
  (...roles: UserRole[]): CanMatchFn =>
  () =>
    whenAuthReady((store, router) => {
      const role = store.role();
      return (role !== null && roles.includes(role)) || router.parseUrl(CommonRouteContainerModel.HOME_ROUTE.url);
    });
