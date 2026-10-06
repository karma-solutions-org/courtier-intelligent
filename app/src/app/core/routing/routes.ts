import { Routes } from '@angular/router';
import { CommonRouteContainerModel } from './common-routes/common-route-container.model';
import { COMMON_ROUTES } from './common-routes/common.routes';
import { authGuard } from './guards/auth.guards';

/** Routes racines : chaque zone (commons, cabinet, super-admin) est chargée en lazy. */
export const ROUTES: Routes = [
  ...COMMON_ROUTES,
  {
    path: CommonRouteContainerModel.HOME_ROUTE.path,
    pathMatch: 'full',
    canMatch: [authGuard],
    title: 'Accueil — Courtier Intelligent',
    loadComponent: () =>
      import('../../main/commons/main-module/components/home-container/home-container.component').then(
        c => c.HomeContainerComponent,
      ),
  },
  { path: '**', redirectTo: CommonRouteContainerModel.SIGNIN_ROUTE.path },
];
