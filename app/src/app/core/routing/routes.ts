import { Routes } from '@angular/router';
import { CommonRouteContainerModel } from './common-routes/common-route-container.model';
import { COMMON_ROUTES } from './common-routes/common.routes';
import { authGuard } from './guards/auth.guards';

/** Routes racines : chaque zone (commons, cabinet) est chargée en lazy. */
export const ROUTES: Routes = [
  {
    path: CommonRouteContainerModel.LANDING_ROUTE.path,
    pathMatch: 'full',
    title: 'Courtier Intelligent — Le back-office des cabinets de courtage',
    loadComponent: () =>
      import('../../main/commons/presentation-module/components/landing-container/landing-container.component').then(
        c => c.LandingContainerComponent,
      ),
  },
  ...COMMON_ROUTES,
  {
    // Espace connecté : layout (menu latéral + barre du haut) et ses pages.
    path: CommonRouteContainerModel.HOME_ROUTE.path,
    canMatch: [authGuard],
    loadComponent: () =>
      import('../../main/commons/main-module/components/shell/shell-container/shell-container.component').then(
        c => c.ShellContainerComponent,
      ),
    loadChildren: () => import('./cabinet-routes/cabinet.routes').then(r => r.CABINET_ROUTES),
  },
  {
    path: '**',
    title: 'Page introuvable — Courtier Intelligent',
    loadComponent: () =>
      import('../../main/commons/main-module/components/not-found/not-found.component').then(c => c.NotFoundComponent),
  },
];
