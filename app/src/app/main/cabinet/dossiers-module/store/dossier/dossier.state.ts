import { Assure, CanonicalData, Dossier, DossierEvent, Insurer, Member, Product } from '@shared';
import { NoticeState } from '../../../../../core/store-features/with-notice';
import { AnswerPatch } from '../../services/dossiers.service';

/** Taille d'une tranche de l'historique (défilement infini). */
export const EVENTS_PAGE_SIZE = 20;

/** idle : rien à enregistrer · dirty : modifications en attente · saving · saved · error. */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface DossierState {
  /** Écritures de la couverture (enregistrement, validation) en file ou en cours : le bouton reste grisé. */
  needPending: number;
  selectedId: string | null;
  dossier: Dossier | null;
  /** Vrai dès la première réponse de Firestore. */
  loaded: boolean;
  events: DossierEvent[];
  /** Événements demandés à Firestore : grandit d'une tranche à chaque fin de défilement de l'historique. */
  eventsLimit: number;
  eventsHasMore: boolean;
  eventsLoadingMore: boolean;
  members: Member[];
  products: Product[];
  /** Catalogue des assureurs (onglet Tarification, historique). */
  insurers: Insurer[];
  assure: Assure | null;
  /** Réponses affichées : copie locale du dossier, modifiée à la frappe (l'enregistrement suit). */
  answers: CanonicalData;
  /** Dossier dont les réponses locales ont été initialisées (les mises à jour du serveur n'écrasent pas la saisie). */
  answersFor: string | null;
  /** Modifications pas encore envoyées. */
  pending: AnswerPatch;
  editTick: number;
  /** Section du questionnaire affichée (reprise là où le courtier s'était arrêté). */
  sectionIndex: number;
  /** Sauvegarde automatique : active pendant la saisie du brouillon, désactivée sur l'onglet Infos (bouton Enregistrer). */
  autosave: boolean;
  saveStatus: SaveStatus;
  error: string | null;
  successMessage: string | null;
  /** Classement sans suite en cours. */
  closing: boolean;
  /** Mise à la corbeille : en cours, faite (la fiche revient à l'espace du client) ou en échec. */
  removeStatus: 'idle' | 'pending' | 'done' | 'failed';
}

/** État complet vu par les features du dossier (le message ponctuel vient de `withNotice`). */
export type DossierStoreState = DossierState & NoticeState;

export const initialDossierState: DossierState = {
  needPending: 0,
  selectedId: null,
  dossier: null,
  loaded: false,
  events: [],
  eventsLimit: EVENTS_PAGE_SIZE,
  eventsHasMore: false,
  eventsLoadingMore: false,
  members: [],
  products: [],
  insurers: [],
  assure: null,
  answers: {},
  answersFor: null,
  pending: {},
  editTick: 0,
  sectionIndex: 0,
  autosave: true,
  saveStatus: 'idle',
  error: null,
  successMessage: null,
  closing: false,
  removeStatus: 'idle',
};
