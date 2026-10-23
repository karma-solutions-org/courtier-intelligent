import { Assure, Dossier, foldText, PROTECTED_DOSSIER_STATUSES } from '@shared';
import { displayName } from '../../assures-module/util/assures.utils';
import type { TrashKind } from '../services/trash.service';

/** Taille d'une tranche du défilement infini. */
export const TRASH_PAGE_SIZE = 20;
export const EMPTY_LIMITS: Record<TrashKind, number> = { assure: TRASH_PAGE_SIZE, dossier: TRASH_PAGE_SIZE };
export const NOT_LOADING: Record<TrashKind, boolean> = { assure: false, dossier: false };

export interface TrashRow {
  kind: TrashKind;
  id: string;
  title: string;
  detail: string;
  deletedAt: Dossier['deletedAt'];
  /** Raison pour laquelle l'élément ne peut pas être restauré seul (son client est dans la corbeille). */
  blocked: string | null;
  /** Proposition envoyée à l'assuré : jamais supprimé définitivement (seule la restauration reste possible). */
  protected: boolean;
}

/** Tranche Firestore d'un groupe (`loaded` : première réponse reçue). */
export interface TrashPage<T> {
  items: T[];
  hasMore: boolean;
  loaded: boolean;
}

/** Résultats Elasticsearch de la corbeille (null : pas de filtre, ou service indisponible → filtrage local). */
export interface TrashSearch {
  assures: Assure[];
  dossiers: Dossier[];
  hasMore: Record<TrashKind, boolean>;
}

/** Un groupe affiché (clients ou dossiers) : ses lignes et l'état de son chargement. */
export interface TrashGroup {
  kind: TrashKind;
  title: string;
  rows: TrashRow[];
  empty: string;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadedCount: number;
}

/** Filtres de la corbeille : texte, type d'élément, période de suppression en jours (0 = toutes). */
export interface TrashFilters {
  query: string;
  kind: TrashKind | 'all';
  period: number;
}

export const hasTrashFilters = ({ query, kind, period }: TrashFilters): boolean => !!query.trim() || kind !== 'all' || period > 0;

/** Identifiants (triés, joints) des clients des dossiers connus : ils peuvent être actifs, donc hors de la corbeille. */
export function dossierAssureIds(dossiers: Dossier[]): string {
  return [...new Set(dossiers.map((dossier) => dossier.assureId))].sort().join(',');
}

/** Ce qu'il faut pour construire les groupes : tranches Firestore, recherche éventuelle et état des chargements. */
export interface TrashSources {
  deletedAssures: TrashPage<Assure>;
  deletedDossiers: TrashPage<Dossier>;
  search: TrashSearch | null;
  dossierAssures: Assure[];
  loadingMore: Record<TrashKind, boolean>;
  searchLoadingMore: Record<TrashKind, boolean>;
  searching: boolean;
}

/** Les deux groupes de la corbeille : clients, puis dossiers (ceux partis avec leur client reviennent avec lui). */
export function trashGroups(sources: TrashSources): TrashGroup[] {
  const { deletedAssures, deletedDossiers, search } = sources;
  const assures = search ? search.assures : deletedAssures.items;
  const byId = new Map([...sources.dossierAssures, ...assures].map((assure) => [assure.id, assure]));
  const dossiers = search ? search.dossiers : deletedDossiers.items;
  // Dossiers connus (tranche chargée et résultats) : compte et protection des clients.
  const known = new Map([...deletedDossiers.items, ...(search?.dossiers ?? [])].map((dossier) => [dossier.id, dossier]));
  const isProtected = (dossier: Dossier) => PROTECTED_DOSSIER_STATUSES.includes(dossier.status);

  const clientRows: TrashRow[] = assures.map((assure) => {
    // Seuls les dossiers chargés sont connus : pas de compte (il serait faux au-delà de la tranche affichée).
    const own = [...known.values()].filter((dossier) => dossier.deletedWith === assure.id);
    return {
      kind: 'assure',
      id: assure.id,
      title: displayName(assure),
      detail: 'Client (revient avec ses dossiers supprimés en même temps)',
      deletedAt: assure.deletedAt,
      blocked: null,
      protected: own.some(isProtected),
    };
  });

  // Les dossiers partis avec leur client sont comptés sur la ligne du client et reviennent avec lui.
  const dossierRows: TrashRow[] = dossiers.filter((dossier) => !dossier.deletedWith).map((dossier) => {
    const assure = byId.get(dossier.assureId);
    return {
      kind: 'dossier',
      id: dossier.id,
      title: dossier.reference || 'Brouillon',
      detail: assure ? displayName(assure) : 'Client inconnu',
      deletedAt: dossier.deletedAt,
      blocked: assure?.deletedAt ? 'Son client est dans la corbeille : restaurez le client.' : null,
      protected: isProtected(dossier),
    };
  });

  const loadingMore = search ? sources.searchLoadingMore : sources.loadingMore;
  // Chargement initial ou recherche en attente : indicateur au lieu d'un « aucun élément » prématuré.
  const loading = (page: TrashPage<unknown>) => sources.searching || (!search && !page.loaded);
  return [
    {
      kind: 'assure',
      title: 'Clients',
      rows: clientRows,
      empty: 'Aucun client dans la corbeille.',
      hasMore: search ? search.hasMore.assure : deletedAssures.hasMore,
      loading: loading(deletedAssures),
      loadingMore: loadingMore.assure,
      loadedCount: assures.length,
    },
    {
      kind: 'dossier',
      title: 'Dossiers',
      rows: dossierRows,
      empty: 'Aucun dossier dans la corbeille.',
      hasMore: search ? search.hasMore.dossier : deletedDossiers.hasMore,
      loading: loading(deletedDossiers),
      loadingMore: loadingMore.dossier,
      loadedCount: dossiers.length,
    },
  ];
}

/**
 * Groupes affichés selon les filtres. Résultats Elasticsearch (`fromSearch`) : déjà filtrés par le serveur (fautes de
 * frappe comprises), sauf la période, revue en direct.
 */
export function visibleTrashGroups(groups: TrashGroup[], { query, kind, period }: TrashFilters, fromSearch: boolean): TrashGroup[] {
  const words = normalize(query).split(' ').filter(Boolean);
  const since = period ? daysAgo(period - 1) : 0;
  const keep = (row: TrashRow) => {
    const text = normalize(`${row.title} ${row.detail}`);
    const deletedAt = row.deletedAt?.toMillis() ?? 0;
    return (fromSearch || words.every((word) => text.includes(word))) && deletedAt >= since;
  };
  return groups.filter((group) => kind === 'all' || group.kind === kind).map((group) => ({ ...group, rows: group.rows.filter(keep) }));
}

/** Minuscules, sans accents ni espaces multiples (recherche). */
function normalize(text: string): string {
  return foldText(text).replace(/\s+/g, ' ').trim();
}

/** Minuit local il y a `days` jours (setDate : juste lors d'un changement d'heure, contrairement à 24 h fixes). */
export function daysAgo(days: number): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.getTime();
}
