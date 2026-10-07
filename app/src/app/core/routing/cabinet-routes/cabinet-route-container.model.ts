/** Chemins de l'espace connecté (/espace/...). */
export class CabinetRouteContainerModel {
  static readonly DASHBOARD_ROUTE = { path: 'tableau-de-bord', url: '/espace/tableau-de-bord' };
  static readonly DOSSIERS_ROUTE = { path: 'dossiers', url: '/espace/dossiers' };
  static readonly ASSURES_ROUTE = { path: 'assures', url: '/espace/assures' };
  static readonly SETTINGS_ROUTE = { path: 'parametres', url: '/espace/parametres' };
}

/** Chemins de la console super-admin (/espace/admin/...). */
export class SuperAdminRouteContainerModel {
  static readonly CABINETS_ROUTE = { path: 'admin/cabinets', url: '/espace/admin/cabinets' };
  static readonly CATALOGUE_ROUTE = { path: 'admin/catalogue', url: '/espace/admin/catalogue' };
  static readonly INSURERS_ROUTE = { path: 'admin/assureurs', url: '/espace/admin/assureurs' };
}
