/** Chemins de l'espace connecté (/espace/...). */
export class CabinetRouteContainerModel {
  static readonly DASHBOARD_ROUTE = { path: 'tableau-de-bord', url: '/espace/tableau-de-bord' };
  static readonly DOSSIERS_ROUTE = { path: 'dossiers', url: '/espace/dossiers' };
  static readonly DOSSIER_NEW_ROUTE = { path: 'nouveau', url: '/espace/dossiers/nouveau' };
  static readonly CLIENTS_ROUTE = { path: 'clients', url: '/espace/clients' };
  static readonly CLIENT_NEW_ROUTE = { path: 'nouveau', url: '/espace/clients/nouveau' };
  /** Espace d'un client : point d'entrée de tous ses dossiers. */
  static clientUrl(clientId: string): string {
    return `${CabinetRouteContainerModel.CLIENTS_ROUTE.url}/${clientId}`;
  }

  static readonly SETTINGS_ROUTE = { path: 'parametres', url: '/espace/parametres' };
}
