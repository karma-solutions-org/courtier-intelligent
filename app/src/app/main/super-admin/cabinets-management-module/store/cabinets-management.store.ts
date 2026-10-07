import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Cabinet } from '@shared';
import { exhaustMap, pipe, switchMap, tap } from 'rxjs';
import {
  setError,
  setFulfilled,
  setPending,
  withRequestStatus,
} from '../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { NewCabinetModel } from '../models/new-cabinet.model';
import { CabinetsManagementService } from '../services/cabinets-management.service';

interface CabinetsManagementState {
  cabinets: Cabinet[];
  search: string;
  successMessage: string | null;
}

/** Store de la console super-admin « Cabinets » (fourni par la route). */
export const CabinetsManagementStore = signalStore(
  withState<CabinetsManagementState>({ cabinets: [], search: '', successMessage: null }),
  withRequestStatus(),
  withComputed(({ cabinets, search }) => ({
    filteredCabinets: computed(() => {
      const query = search().trim().toLowerCase();
      return query
        ? cabinets().filter(t => t.name.toLowerCase().includes(query) || (t.orias ?? '').includes(query))
        : cabinets();
    }),
  })),
  withMethods((store, service = inject(CabinetsManagementService)) => ({
    setSearch: (search: string) => patchState(store, { search }),
    clearMessage: () => patchState(store, { successMessage: null }),
    create: rxMethod<NewCabinetModel>(
      pipe(
        tap(() => patchState(store, setPending(), { successMessage: null })),
        exhaustMap(cabinet =>
          service.create(cabinet).pipe(
            tapResponse({
              next: ({ isNewAccount }) =>
                patchState(store, setFulfilled(), {
                  successMessage: isNewAccount
                    ? "Cabinet créé. L'administrateur a reçu un email pour choisir son mot de passe."
                    : 'Cabinet créé et rattaché au compte existant.',
                }),
              error: error => patchState(store, setError(toBackendErrorMessage(error))),
            }),
          ),
        ),
      ),
    ),
    setActive: rxMethod<{ cabinetId: string; active: boolean }>(
      pipe(
        tap(() => patchState(store, setPending(), { successMessage: null })),
        exhaustMap(({ cabinetId, active }) =>
          service.setActive(cabinetId, active).pipe(
            tapResponse({
              next: () => patchState(store, setFulfilled(), { successMessage: active ? 'Cabinet activé.' : 'Cabinet désactivé.' }),
              error: error => patchState(store, setError(toBackendErrorMessage(error))),
            }),
          ),
        ),
      ),
    ),
    _listen: rxMethod<void>(
      pipe(switchMap(() => service.watchCabinets().pipe(tap(cabinets => patchState(store, { cabinets }))))),
    ),
  })),
  withHooks({ onInit: store => store._listen() }),
);
