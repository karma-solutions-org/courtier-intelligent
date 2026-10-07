import { UserRole } from '@shared';
import {
  CabinetRouteContainerModel,
  SuperAdminRouteContainerModel,
} from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';

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

const ALL: UserRole[] = ['admin', 'courtier', 'superadmin'];

/** Menu latéral : chaque entrée n'est affichée qu'aux rôles indiqués. */
export const NAVIGATION: NavSection[] = [
  {
    title: null,
    items: [
      { label: 'Tableau de bord', icon: 'space_dashboard', url: CabinetRouteContainerModel.DASHBOARD_ROUTE.url, roles: ALL },
      { label: 'Dossiers', icon: 'folder_open', url: CabinetRouteContainerModel.DOSSIERS_ROUTE.url, roles: ['admin', 'courtier'] },
      { label: 'Assurés', icon: 'group', url: CabinetRouteContainerModel.ASSURES_ROUTE.url, roles: ['admin', 'courtier'] },
    ],
  },
  {
    title: 'Cabinet',
    items: [{ label: 'Paramètres', icon: 'settings', url: CabinetRouteContainerModel.SETTINGS_ROUTE.url, roles: ['admin'] }],
  },
  {
    title: 'Super-admin',
    items: [
      { label: 'Cabinets', icon: 'apartment', url: SuperAdminRouteContainerModel.CABINETS_ROUTE.url, roles: ['superadmin'] },
      { label: 'Catalogue', icon: 'inventory_2', url: SuperAdminRouteContainerModel.CATALOGUE_ROUTE.url, roles: ['superadmin'] },
      { label: 'Assureurs', icon: 'shield', url: SuperAdminRouteContainerModel.INSURERS_ROUTE.url, roles: ['superadmin'] },
    ],
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Super-admin',
  admin: 'Administrateur',
  courtier: 'Courtier',
};

/** Garde les sections et entrées visibles pour un rôle (rôle absent : entrées ouvertes à tous). */
export function navigationFor(role: UserRole | null): NavSection[] {
  return NAVIGATION.map(section => ({
    ...section,
    items: section.items.filter(item => (role ? item.roles.includes(role) : item.roles === ALL)),
  })).filter(section => section.items.length > 0);
}
