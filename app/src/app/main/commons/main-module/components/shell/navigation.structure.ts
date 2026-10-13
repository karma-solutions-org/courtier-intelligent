import { UserRole } from '@shared';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';

export interface NavItem {
  label: string;
  icon: string;
  url: string;
  roles: UserRole[];
}

export interface NavSection {
  title: string | null;
  items: NavItem[];
}

const ALL: UserRole[] = ['admin', 'courtier'];

/** Menu latéral : chaque entrée n'est affichée qu'aux rôles indiqués. */
export const NAVIGATION: NavSection[] = [
  {
    title: null,
    items: [
      { label: 'Tableau de bord', icon: 'space_dashboard', url: CabinetRouteContainerModel.DASHBOARD_ROUTE.url, roles: ALL },
      { label: 'Clients', icon: 'group', url: CabinetRouteContainerModel.CLIENTS_ROUTE.url, roles: ALL },
    ],
  },
  {
    title: 'Cabinet',
    items: [
      { label: 'Paramètres', icon: 'settings', url: CabinetRouteContainerModel.SETTINGS_ROUTE.url, roles: ['admin'] },
      { label: 'Corbeille', icon: 'delete', url: CabinetRouteContainerModel.TRASH_ROUTE.url, roles: ['admin'] },
    ],
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  courtier: 'Courtier',
};

/** Garde les sections et entrées visibles pour un rôle (sans cabinet : seulement le tableau de bord). */
export function navigationFor(role: UserRole | null): NavSection[] {
  return NAVIGATION.map(section => ({
    ...section,
    items: section.items.filter(item =>
      role ? item.roles.includes(role) : item.url === CabinetRouteContainerModel.DASHBOARD_ROUTE.url,
    ),
  })).filter(section => section.items.length > 0);
}
