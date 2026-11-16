import { Dossier } from '@shared';

/** Ligne d'une liste de dossiers du tableau de bord : le dossier et les noms déjà résolus. */
export interface DashboardDossierRow {
  dossier: Dossier;
  assureName: string;
  productName: string;
}
