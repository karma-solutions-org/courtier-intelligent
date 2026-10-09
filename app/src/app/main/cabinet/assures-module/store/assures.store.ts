import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Assure, Dossier } from '@shared';
import { EMPTY, exhaustMap, pipe, switchMap, tap } from 'rxjs';
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
import { DuplicateCandidate, findDuplicates, matchesSearch } from '../util/assures.utils';

export const PAGE_SIZE_OPTIONS = [10, 25, 50];

interface AssuresState {
  assures: Assure[];
  /** Vrai dès la première réponse de Firestore (distingue « chargement » de « aucun assuré »). */
  loaded: boolean;
  query: string;
  pageIndex: number;
  pageSize: number;
  /** Fiche ouverte et ses dossiers. */
  selectedId: string | null;
  dossiers: Dossier[];
  /** Identifiant de l'assuré qui vient d'être créé : la page de création navigue vers sa fiche. */
  createdId: string | null;
  successMessage: string | null;
}

/** Store des assurés (fourni par la route) : liste, recherche, pagination, création et modification. */
export const AssuresStore = signalStore(
  withState<AssuresState>({
    assures: [],
    loaded: false,
    query: '',
    pageIndex: 0,
    pageSize: PAGE_SIZE_OPTIONS[0],
    selectedId: null,
    dossiers: [],
    createdId: null,
    successMessage: null,
  }),
  withRequestStatus(),
  withComputed(({ assures, query, pageIndex, pageSize, selectedId }) => {
    const filtered = computed(() => {
      const text = query();
      return assures().filter(assure => matchesSearch(assure, text));
    });
    return {
      filtered,
      total: computed(() => filtered().length),
      /** Assurés de la page courante, triés par nom. */
      pageItems: computed(() => {
        const start = pageIndex() * pageSize();
        return filtered().slice(start, start + pageSize());
      }),
      selected: computed(() => assures().find(assure => assure.id === selectedId()) ?? null),
    };
  }),
  withMethods((store, service = inject(AssuresService), authStore = inject(AuthStore)) => {
    const cabinetId = () => authStore.cabinetId()!;

    return {
      setQuery: (query: string) => patchState(store, { query, pageIndex: 0 }),
      setPage: (pageIndex: number, pageSize: number) => patchState(store, { pageIndex, pageSize }),
      select: (selectedId: string | null) => patchState(store, { selectedId, dossiers: [] }),
      clearMessage: () => patchState(store, { successMessage: null }),
      resetStatus: () => patchState(store, resetRequestStatus(), { createdId: null }),
      /** Assurés existants qui ressemblent à la saisie (alerte de doublon). */
      duplicatesOf: (candidate: DuplicateCandidate, excludeId?: string): Assure[] =>
        findDuplicates(candidate, store.assures(), excludeId),

      create: rxMethod<AssureFormModel>(
        pipe(
          tap(() => patchState(store, setPending(), { createdId: null })),
          exhaustMap(form =>
            service.create(cabinetId(), authStore.user()!.uid, toAssureData(form)).pipe(
              tapResponse({
                next: createdId =>
                  patchState(store, setFulfilled(), { createdId, successMessage: 'Assuré créé.' }),
                error: error => patchState(store, setError(toBackendErrorMessage(error))),
              }),
            ),
          ),
        ),
      ),
      update: rxMethod<{ id: string; form: AssureFormModel }>(
        pipe(
          tap(() => patchState(store, setPending(), { successMessage: null })),
          exhaustMap(({ id, form }) =>
            service.update(cabinetId(), id, toAssureData(form)).pipe(
              tapResponse({
                next: () => patchState(store, setFulfilled(), { successMessage: 'Fiche enregistrée.' }),
                error: error => patchState(store, setError(toBackendErrorMessage(error))),
              }),
            ),
          ),
        ),
      ),

      _listen: rxMethod<string | null>(
        pipe(
          switchMap(id =>
            id
              ? service.watchAssures(id).pipe(tap(assures => patchState(store, { assures, loaded: true })))
              : EMPTY,
          ),
        ),
      ),
      _listenDossiers: rxMethod<{ cabinetId: string | null; assureId: string | null }>(
        pipe(
          switchMap(({ cabinetId: cabinet, assureId }) =>
            cabinet && assureId
              ? service.watchDossiersOf(cabinet, assureId).pipe(tap(dossiers => patchState(store, { dossiers })))
              : EMPTY,
          ),
        ),
      ),
    };
  }),
  withHooks({
    onInit: store => {
      const authStore = inject(AuthStore);
      store._listen(authStore.cabinetId);
      store._listenDossiers(computed(() => ({ cabinetId: authStore.cabinetId(), assureId: store.selectedId() })));
    },
  }),
);
