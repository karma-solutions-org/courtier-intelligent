import { Routes } from '@angular/router';
import { guestGuard } from '../guards/auth.guards';
import { CommonRouteContainerModel } from './common-route-container.model';

/** Pages publiques : accessibles uniquement sans être connecté. */
export const COMMON_ROUTES: Routes = [
  {
    path: CommonRouteContainerModel.SIGNIN_ROUTE.path,
    canMatch: [guestGuard],
    title: 'Connexion — Courtier Intelligent',
    loadComponent: () =>
      import(
        '../../../main/commons/authentication-module/components/signin/signin-container/signin-container.component'
      ).then(c => c.SigninContainerComponent),
  },
  {
    path: CommonRouteContainerModel.FORGOT_PASSWORD_ROUTE.path,
    canMatch: [guestGuard],
    title: 'Mot de passe oublié — Courtier Intelligent',
    loadComponent: () =>
      import(
        '../../../main/commons/authentication-module/components/forget-password/forget-password-container/forget-password-container.component'
      ).then(c => c.ForgetPasswordContainerComponent),
  },
];
