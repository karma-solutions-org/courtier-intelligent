import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Assure, Dossier } from '@shared';
import { catchError, combineLatest, debounceTime, EMPTY, exhaustMap, forkJoin, map, of, pipe, switchMap, take, tap } from 'rxjs';
import {
  resetRequestStatus,
  setError,
  setFulfilled,
  setPending,
  withRequestStatus,
} from '../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { AssureFormModel, toAssureData } from '../models/assure-form.model';
import { AssuresService } from '../services/assures.service';
import { displayName, DuplicateCandidate, DuplicateMatch, hasDuplicateCriteria, localDuplicates, matchesSearch } from '../util/assures.utils';

/** Taille d'une tranche du défilement infini. */
export const PAGE_SIZE = 20;

/** Pièce lue à l'import, à ranger avec le client (function assures-rattacherPiece). */
type AttachablePiece = Omit<Parameters<AssuresService['attachPiece']>[0], 'assureId'>;

/** Filtres de la liste : type de client et ordre d'affichage. */
export interface AssureFilters {
  type: Assure['type'] | 'all';
  sort: 'name' | 'recent';
}

export const DEFAULT_ASSURE_FILTERS: AssureFilters = { type: 'all', sort: 'name' };

interface AssuresState {
  assures: Assure[];
  /** Vrai dès la première réponse de Firestore (distingue « chargement » de « aucun assuré »). */
  loaded: boolean;
  query: string;
  filters: AssureFilters;
  /** Nombre d'assurés demandés à Firestore : grandit d'une tranche à chaque fin de défilement. */
  limit: number;
  /** Firestore a peut-être d'autres assurés au-delà de la tranche chargée. */
  hasMore: boolean;
  /** Une tranche supplémentaire est demandée et pas encore arrivée. */
  loadingMore: boolean;
  /**
   * Résultats de la recherche Elasticsearch (tout le portefeuille) ; null quand il n'y a pas de recherche ou que
   * le service est indisponible : la recherche se fait alors sur la tranche chargée.
   */
  searchResults: Assure[] | null;
  /** Recherche Elasticsearch en cours. */
  searching: boolean;
  /** Fiche ouverte (lue à part : elle peut être hors de la tranche chargée) et ses dossiers. */
  selectedId: string | null;
  selected: Assure | null;
  dossiers: Dossier[];
  /** Identifiant de l'assuré qui vient d'être créé : la page de création navigue vers sa fiche. */
  createdId: string | null;
  /** Vrai après la suppression du client ouvert : la fiche revient à la liste. */
  deleted: boolean;
  successMessage: string | null;
  /** Doublons possibles de la saisie en cours (création ou modification). */
  duplicates: DuplicateMatch[];
}

/** Store des assurés (fourni par la route) : liste, recherche, pagination, création et modification. */
export const AssuresStore = signalStore(
  withState<AssuresState>({
    assures: [],
    loaded: false,
    query: '',
    filters: DEFAULT_ASSURE_FILTERS,
    limit: PAGE_SIZE,
    hasMore: false,
    loadingMore: false,
    searchResults: null,
    searching: false,
    selectedId: null,
    selected: null,
    dossiers: [],
    createdId: null,
    deleted: false,
    successMessage: null,
    duplicates: [],
  }),
  withRequestStatus(),
  withComputed(({ assures, query, filters, searchResults }) => {
    const filtered = computed(() => {
      const text = query();
      const { type } = filters();
      const results = searchResults();
      // Clients déjà chargés qui correspondent : toujours affichés, même si Elasticsearch ne les connaît pas encore
      // (index en retard, client jamais indexé) ou ne répond pas.
      const local = assures().filter((assure) => matchesSearch(assure, text));
      // Recherche : résultats d'Elasticsearch d'abord (ordre de pertinence, tout le portefeuille), puis les correspondances
      // locales qu'il n'a pas renvoyées.
      const ids = new Set(results?.map((assure) => assure.id));
      const source = text.trim() && results ? [...results, ...local.filter((assure) => !ids.has(assure.id))] : local;
      // L'ordre (nom ou plus récents) est appliqué par Firestore hors recherche.
      return source.filter((assure) => type === 'all' || assure.type === type);
    });
    return {
      filtered,
      hasFilters: computed(() => {
        const { type, sort } = filters();
        return !!query() || type !== 'all' || sort !== 'name';
      }),
      total: computed(() => filtered().length),
    };
  }),
  withMethods((store, service = inject(AssuresService), authStore = inject(AuthStore)) => {
    return {
      setQuery: (query: string) => patchState(store, { query }),
      setFilters: (changes: Partial<AssureFilters>) => {
        const filters = { ...store.filters(), ...changes };
        // Changer d'ordre relance la lecture depuis la première tranche.
        const resort = filters.sort !== store.filters().sort;
        patchState(store, { filters, ...(resort ? { limit: PAGE_SIZE, loaded: false } : {}) });
      },
      clearFilters: () => {
        const resort = store.filters().sort !== DEFAULT_ASSURE_FILTERS.sort;
        patchState(store, {
          query: '',
          filters: DEFAULT_ASSURE_FILTERS,
          ...(resort ? { limit: PAGE_SIZE, loaded: false } : {}),
        });
      },
      /** Fin du défilement : demande la tranche suivante (pas pendant une recherche : elle couvre déjà tout). */
      loadMore: () => {
        if (store.hasMore() && !store.loadingMore() && !store.searchResults()) {
          patchState(store, { limit: store.limit() + PAGE_SIZE, loadingMore: true });
        }
      },
      // Même client : on garde ses dossiers. L'écoute Firestore reste ouverte et n'émettrait rien de nouveau,
      // la liste resterait vide jusqu'au rechargement de la page.
      select: (selectedId: string | null) => {
        if (selectedId !== store.selectedId()) patchState(store, { selectedId, selected: null, dossiers: [] });
      },
      clearMessage: () => patchState(store, { successMessage: null }),
      resetStatus: () => patchState(store, resetRequestStatus(), { createdId: null, deleted: false }),
      remove: rxMethod<string>(
        pipe(
          exhaustMap((id) => {
            patchState(store, setPending(), { successMessage: null });
            return service.remove(id).pipe(
              tapResponse({
                next: () =>
                  patchState(store, setFulfilled(), { deleted: true, successMessage: 'Client placé dans la corbeille.' }),
                error: (error) => patchState(store, setError(toBackendErrorMessage(error))),
              }),
            );
          }),
        ),
      ),
      /** Ouvre une pièce du client dans un nouvel onglet (lien de téléchargement signé). */
      openDocument: rxMethod<string>(
        pipe(
          switchMap((storagePath) =>
            service.downloadUrl(storagePath).pipe(
              tap((url) => window.open(url, '_blank', 'noopener')),
              // Lien indisponible : rien ne s'ouvre (l'écoute continue pour la pièce suivante).
              catchError(() => EMPTY),
            ),
          ),
        ),
      ),
      /**
       * Range avec le client tout juste créé les pièces lues à l'import ; un échec n'empêche pas les autres.
       * `done` reçoit vrai si toutes ont été rangées.
       */
      attachPieces: rxMethod<{ assureId: string; pieces: AttachablePiece[]; done: (allAttached: boolean) => void }>(
        pipe(
          exhaustMap(({ assureId, pieces, done }) =>
            forkJoin(
              pieces.map((piece) =>
                service.attachPiece({ assureId, ...piece }).pipe(
                  map(() => true),
                  catchError(() => of(false)),
                ),
              ),
            ).pipe(tap((results) => done(!results.includes(false)))),
          ),
        ),
      ),
      clearDuplicates: () => patchState(store, { duplicates: [] }),
      /**
       * Alerte de doublon : vérification serveur sur tout le cabinet (SIRET compris), 400 ms après la dernière frappe.
       * switchMap écarte une réponse dépassée ; serveur injoignable : comparaison avec les clients chargés.
       */
      checkDuplicates: rxMethod<{ candidate: DuplicateCandidate; excludeId?: string }>(
        pipe(
          debounceTime(400),
          switchMap(({ candidate, excludeId }) => {
            const cabinetId = authStore.cabinetId();
            if (!cabinetId || !hasDuplicateCriteria(candidate)) {
              patchState(store, { duplicates: [] });
              return EMPTY;
            }
            const clean = (value: string | null | undefined) => value?.trim() || undefined;
            return service
              .verifyDuplicates({
                firstName: clean(candidate.firstName),
                lastName: clean(candidate.lastName),
                birthDate: clean(candidate.birthDate),
                email: clean(candidate.email),
                siret: clean(candidate.siret),
                companyName: clean(candidate.companyName),
                excludeId,
              })
              .pipe(
                // Nom affiché : client déjà chargé, sinon lu une fois.
                switchMap((found) => {
                  if (!found.length) return of([] as DuplicateMatch[]);
                  const known = new Map(store.assures().map((assure) => [assure.id, assure]));
                  return combineLatest(
                    found.map((match) =>
                      (known.has(match.id) ? of(known.get(match.id)!) : service.watchAssure(cabinetId, match.id).pipe(take(1))).pipe(
                        map((assure): DuplicateMatch => ({ ...match, name: assure ? displayName(assure) : 'Client' })),
                      ),
                    ),
                  );
                }),
                tap((duplicates) => patchState(store, { duplicates })),
                catchError(() => {
                  patchState(store, { duplicates: localDuplicates(candidate, store.assures(), excludeId) });
                  return EMPTY;
                }),
              );
          }),
        ),
      ),

      create: rxMethod<AssureFormModel>(
        pipe(
          // L'état passe en attente dans exhaustMap : un double clic ignoré ne remet pas createdId à null.
          exhaustMap((form) => {
            patchState(store, setPending(), { createdId: null });
            const cabinetId = authStore.cabinetId();
            const uid = authStore.user()?.uid;
            if (!cabinetId || !uid) {
              patchState(store, setError('Aucun cabinet actif : reconnectez-vous ou rejoignez un cabinet pour créer un client.'));
              return EMPTY;
            }
            return service.create(toAssureData(form)).pipe(
              tapResponse({
                next: (createdId) =>
                  patchState(store, setFulfilled(), { createdId, successMessage: 'Client créé.' }),
                error: (error) => patchState(store, setError(toBackendErrorMessage(error))),
              }),
            );
          }),
        ),
      ),
      update: rxMethod<{ id: string; form: AssureFormModel }>(
        pipe(
          exhaustMap(({ id, form }) => {
            patchState(store, setPending(), { successMessage: null });
            const cabinetId = authStore.cabinetId();
            if (!cabinetId) {
              patchState(store, setError('Aucun cabinet actif : reconnectez-vous ou rejoignez un cabinet pour modifier ce client.'));
              return EMPTY;
            }
            return service.update(id, toAssureData(form)).pipe(
              tapResponse({
                next: () =>
                  patchState(store, setFulfilled(), { successMessage: 'Fiche enregistrée.' }),
                error: (error) => patchState(store, setError(toBackendErrorMessage(error))),
              }),
            );
          }),
        ),
      ),

      _listen: rxMethod<{ cabinetId: string | null; limit: number; sort: AssureFilters['sort'] }>(
        pipe(
          switchMap(({ cabinetId, limit, sort }) =>
            cabinetId
              ? service.watchAssuresPage(cabinetId, limit, sort).pipe(
                  tap(({ assures, hasMore }) =>
                    patchState(store, { assures, hasMore, loaded: true, loadingMore: false }),
                  ),
                  // Une écoute refusée affiche l'erreur sans arrêter l'écoute (changement de cabinet).
                  catchError((error) => {
                    patchState(store, setError(toBackendErrorMessage(error)), { loaded: true, loadingMore: false });
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),
      /** Recherche Elasticsearch, 300 ms après la dernière frappe ; en cas d'échec, recherche sur la tranche chargée. */
      _search: rxMethod<{ cabinetId: string | null; query: string }>(
        pipe(
          debounceTime(300),
          switchMap(({ cabinetId, query }) => {
            const text = query.trim();
            if (!cabinetId || text.length < 2) {
              patchState(store, { searchResults: null, searching: false });
              return EMPTY;
            }
            patchState(store, { searching: true });
            return service.search(text).pipe(
              switchMap((ids) => service.watchAssuresByIds(cabinetId, ids)),
              tap((searchResults) => patchState(store, { searchResults, searching: false })),
              catchError(() => {
                patchState(store, { searchResults: null, searching: false });
                return EMPTY;
              }),
            );
          }),
        ),
      ),
      _listenSelected: rxMethod<{ cabinetId: string | null; assureId: string | null }>(
        pipe(
          switchMap(({ cabinetId, assureId }) =>
            cabinetId && assureId
              ? service.watchAssure(cabinetId, assureId).pipe(
                  tap((assure) => patchState(store, { selected: assure && !assure.deletedAt ? assure : null })),
                  catchError((error) => {
                    patchState(store, setError(toBackendErrorMessage(error)));
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),
      _listenDossiers: rxMethod<{ cabinetId: string | null; assureId: string | null }>(
        pipe(
          switchMap(({ cabinetId: cabinet, assureId }) =>
            cabinet && assureId
              ? service.watchDossiersOf(cabinet, assureId).pipe(
                  tap((dossiers) => patchState(store, { dossiers })),
                  catchError((error) => {
                    patchState(store, setError(toBackendErrorMessage(error)));
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),
    };
  }),
  withHooks({
    onInit: (store) => {
      const authStore = inject(AuthStore);
      store._listen(
        computed(
          () => ({ cabinetId: authStore.cabinetId(), limit: store.limit(), sort: store.filters().sort }),
          { equal: (a, b) => a.cabinetId === b.cabinetId && a.limit === b.limit && a.sort === b.sort },
        ),
      );
      const selection = computed(
        () => ({ cabinetId: authStore.cabinetId(), assureId: store.selectedId() }),
        { equal: (a, b) => a.cabinetId === b.cabinetId && a.assureId === b.assureId },
      );
      store._listenSelected(selection);
      store._search(
        computed(
          () => ({ cabinetId: authStore.cabinetId(), query: store.query() }),
          { equal: (a, b) => a.cabinetId === b.cabinetId && a.query.trim() === b.query.trim() },
        ),
      );
      store._listenDossiers(selection);
    },
  }),
);
