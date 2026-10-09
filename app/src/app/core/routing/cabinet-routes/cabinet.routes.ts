import { Routes } from '@angular/router';
import { SettingsStore } from '../../../main/cabinet/settings-module/store/settings.store';
import { DossierStore } from '../../../main/cabinet/dossiers-module/store/dossier.store';
import { DossiersStore } from '../../../main/cabinet/dossiers-module/store/dossiers.store';
import { AssuresStore } from '../../../main/cabinet/assures-module/store/assures.store';
import { roleGuard } from '../guards/auth.guards';
import { CabinetRouteContainerModel } from './cabinet-route-container.model';

/** Pages affichées dans le layout de l'espace connecté. */
export const CABINET_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: CabinetRouteContainerModel.DASHBOARD_ROUTE.path },
  {
    path: CabinetRouteContainerModel.DASHBOARD_ROUTE.path,
    title: 'Tableau de bord — Courtier Intelligent',
    loadComponent: () =>
      import('../../../main/commons/main-module/components/home-container/home-container.component').then(
        c => c.HomeContainerComponent,
      ),
  },
  {
    path: CabinetRouteContainerModel.DOSSIERS_ROUTE.path,
    canMatch: [roleGuard('admin', 'courtier')],
    providers: [DossiersStore],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Dossiers — Courtier Intelligent',
        loadComponent: () =>
          import('../../../main/cabinet/dossiers-module/components/dossiers-container/dossiers-container.component').then(
            c => c.DossiersContainerComponent,
          ),
      },
      {
        path: CabinetRouteContainerModel.DOSSIER_NEW_ROUTE.path,
        title: 'Nouveau dossier — Courtier Intelligent',
        loadComponent: () =>
          import(
            '../../../main/cabinet/dossiers-module/components/new-dossier-container/new-dossier-container.component'
          ).then(c => c.NewDossierContainerComponent),
      },
      {
        // Étapes 3 et 4 de « Nouveau dossier » : questionnaire et récapitulatif (reprise d'un brouillon).
        path: ':id/brouillon',
        title: 'Brouillon — Courtier Intelligent',
        providers: [DossierStore],
        loadComponent: () =>
          import(
            '../../../main/cabinet/dossiers-module/components/dossier-draft-container/dossier-draft-container.component'
          ).then(c => c.DossierDraftContainerComponent),
      },
      {
        path: ':id',
        title: 'Dossier — Courtier Intelligent',
        providers: [DossierStore],
        loadComponent: () =>
          import(
            '../../../main/cabinet/dossiers-module/components/dossier-detail-container/dossier-detail-container.component'
          ).then(c => c.DossierDetailContainerComponent),
      },
    ],
  },
  {
    path: CabinetRouteContainerModel.ASSURES_ROUTE.path,
    canMatch: [roleGuard('admin', 'courtier')],
    providers: [AssuresStore],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Assurés — Courtier Intelligent',
        loadComponent: () =>
          import('../../../main/cabinet/assures-module/components/assures-container/assures-container.component').then(
            c => c.AssuresContainerComponent,
          ),
      },
      {
        path: CabinetRouteContainerModel.ASSURE_NEW_ROUTE.path,
        title: 'Nouvel assuré — Courtier Intelligent',
        loadComponent: () =>
          import(
            '../../../main/cabinet/assures-module/components/new-assure-container/new-assure-container.component'
          ).then(c => c.NewAssureContainerComponent),
      },
      {
        path: ':id',
        title: 'Fiche assuré — Courtier Intelligent',
        loadComponent: () =>
          import(
            '../../../main/cabinet/assures-module/components/assure-detail-container/assure-detail-container.component'
          ).then(c => c.AssureDetailContainerComponent),
      },
    ],
  },
  {
    path: CabinetRouteContainerModel.SETTINGS_ROUTE.path,
    canMatch: [roleGuard('admin')],
    title: 'Paramètres — Courtier Intelligent',
    providers: [SettingsStore],
    loadComponent: () =>
      import('../../../main/cabinet/settings-module/components/settings-container/settings-container.component').then(
        c => c.SettingsContainerComponent,
      ),
  },
];
