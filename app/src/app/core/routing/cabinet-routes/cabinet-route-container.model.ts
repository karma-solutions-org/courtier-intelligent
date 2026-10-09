/** Chemins de l'espace connecté (/espace/...). */
export class CabinetRouteContainerModel {
  static readonly DASHBOARD_ROUTE = { path: 'tableau-de-bord', url: '/espace/tableau-de-bord' };
  static readonly DOSSIERS_ROUTE = { path: 'dossiers', url: '/espace/dossiers' };
  static readonly DOSSIER_NEW_ROUTE = { path: 'nouveau', url: '/espace/dossiers/nouveau' };
  static readonly ASSURES_ROUTE = { path: 'assures', url: '/espace/assures' };
  static readonly ASSURE_NEW_ROUTE = { path: 'nouveau', url: '/espace/assures/nouveau' };
  static readonly SETTINGS_ROUTE = { path: 'parametres', url: '/espace/parametres' };
}
