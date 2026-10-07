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
    path: CommonRouteContainerModel.SIGNUP_ROUTE.path,
    canMatch: [guestGuard],
    title: 'Inscription — Courtier Intelligent',
    loadComponent: () =>
      import(
        '../../../main/commons/authentication-module/components/signup/signup-container/signup-container.component'
      ).then(c => c.SignupContainerComponent),
  },
  {
    // Accessible connecté ou non : la page guide l'invité dans les deux cas.
    path: CommonRouteContainerModel.INVITATION_ROUTE.path,
    title: 'Invitation — Courtier Intelligent',
    loadComponent: () =>
      import(
        '../../../main/commons/authentication-module/components/accept-invitation/accept-invitation-container/accept-invitation-container.component'
      ).then(c => c.AcceptInvitationContainerComponent),
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
