import { Assure, Dossier } from '@shared';
import { CabinetRouteContainerModel } from '../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { ASSURES_STRUCTURE } from '../components/assures.structure';
import { displayName } from './assures.utils';

/** Statuts où le dossier n'avance plus. */
const CLOSED_STATUSES: Dossier['status'][] = ['souscrit', 'refuse'];

/** Initiales de l'avatar : premières lettres des deux premiers mots du nom affiché. */
export function initialsOf(assure: Assure): string {
  const words = displayName(assure).trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Détails affichés en lecture : la société d'abord pour un professionnel. */
export function assureDetails(assure: Assure): { label: string; value: string | null | undefined }[] {
  const fields = ASSURES_STRUCTURE.detail.fields;
  const company =
    assure.type === 'pro'
      ? [
          { label: fields.companyName, value: assure.companyName },
          { label: fields.siret, value: assure.siret },
        ]
      : [];
  return [
    ...company,
    { label: fields.civilite, value: assure.civilite },
    { label: fields.lastName, value: assure.lastName },
    { label: fields.firstName, value: assure.firstName },
    { label: fields.birthDate, value: formatDate(assure.birthDate) },
    { label: fields.email, value: assure.email },
    { label: fields.phone, value: assure.phone },
    { label: fields.street, value: assure.address?.street },
    { label: fields.postalCode, value: assure.address?.postalCode },
    { label: fields.city, value: assure.address?.city },
  ];
}

/** Compteurs de l'espace client : dossiers en cours et souscrits. */
export function dossierStats(dossiers: Dossier[]): { inProgress: number; won: number } {
  return {
    inProgress: dossiers.filter((dossier) => !CLOSED_STATUSES.includes(dossier.status)).length,
    won: dossiers.filter((dossier) => dossier.status === 'souscrit').length,
  };
}

/** Un brouillon se reprend dans son questionnaire, les autres s'ouvrent sur leur fiche. */
export function dossierLink(dossier: Pick<Dossier, 'id' | 'status'>): string[] {
  const base = [CabinetRouteContainerModel.DOSSIERS_ROUTE.url, dossier.id];
  return dossier.status === 'brouillon' ? [...base, 'brouillon'] : base;
}

/** « 1985-04-12 » → « 12/04/1985 ». */
function formatDate(iso: string | null | undefined): string | null {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (iso ?? null);
}
