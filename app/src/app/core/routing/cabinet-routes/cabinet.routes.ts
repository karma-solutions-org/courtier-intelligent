import { Routes } from '@angular/router';
import { SettingsStore } from '../../../main/cabinet/settings-module/store/settings.store';
import { CabinetsManagementStore } from '../../../main/super-admin/cabinets-management-module/store/cabinets-management.store';
import { roleGuard } from '../guards/auth.guards';
import { CabinetRouteContainerModel, SuperAdminRouteContainerModel } from './cabinet-route-container.model';

const underConstruction = () =>
  import('../../../main/commons/main-module/components/under-construction/under-construction.component').then(
    c => c.UnderConstructionComponent,
  );

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
    title: 'Dossiers — Courtier Intelligent',
    data: { pageTitle: 'Dossiers' },
    loadComponent: underConstruction,
  },
  {
    path: CabinetRouteContainerModel.ASSURES_ROUTE.path,
    canMatch: [roleGuard('admin', 'courtier')],
    title: 'Assurés — Courtier Intelligent',
    data: { pageTitle: 'Assurés' },
    loadComponent: underConstruction,
  },
  {
    path: CabinetRouteContainerModel.SETTINGS_ROUTE.path,
    canMatch: [roleGuard('admin')],
    title: 'Paramètres — Courtier Intelligent',
    providers: [SettingsStore],
    loadComponent: () =>
      import(
        '../../../main/cabinet/settings-module/components/settings-container/settings-container.component'
      ).then(c => c.SettingsContainerComponent),
  },
  {
    path: SuperAdminRouteContainerModel.CABINETS_ROUTE.path,
    canMatch: [roleGuard('superadmin')],
    title: 'Cabinets — Courtier Intelligent',
    providers: [CabinetsManagementStore],
    loadComponent: () =>
      import(
        '../../../main/super-admin/cabinets-management-module/components/cabinets-management-container/cabinets-management-container.component'
      ).then(c => c.CabinetsManagementContainerComponent),
  },
  {
    path: SuperAdminRouteContainerModel.CATALOGUE_ROUTE.path,
    canMatch: [roleGuard('superadmin')],
    title: 'Catalogue — Courtier Intelligent',
    data: { pageTitle: 'Catalogue' },
    loadComponent: underConstruction,
  },
  {
    path: SuperAdminRouteContainerModel.INSURERS_ROUTE.path,
    canMatch: [roleGuard('superadmin')],
    title: 'Assureurs — Courtier Intelligent',
    data: { pageTitle: 'Assureurs' },
    loadComponent: underConstruction,
  },
];
