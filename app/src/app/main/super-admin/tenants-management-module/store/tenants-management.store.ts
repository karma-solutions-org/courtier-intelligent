import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Tenant } from '@shared';
import { exhaustMap, pipe, switchMap, tap } from 'rxjs';
import {
  setError,
  setFulfilled,
  setPending,
  withRequestStatus,
} from '../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { NewTenantModel } from '../models/new-tenant.model';
import { TenantsManagementService } from '../services/tenants-management.service';

interface TenantsManagementState {
  tenants: Tenant[];
  search: string;
  successMessage: string | null;
}

/** Store de la console super-admin « Cabinets » (fourni par la route). */
export const TenantsManagementStore = signalStore(
  withState<TenantsManagementState>({ tenants: [], search: '', successMessage: null }),
  withRequestStatus(),
  withComputed(({ tenants, search }) => ({
    filteredTenants: computed(() => {
      const query = search().trim().toLowerCase();
      return query
        ? tenants().filter(t => t.name.toLowerCase().includes(query) || (t.orias ?? '').includes(query))
        : tenants();
    }),
  })),
  withMethods((store, service = inject(TenantsManagementService)) => ({
    setSearch: (search: string) => patchState(store, { search }),
    clearMessage: () => patchState(store, { successMessage: null }),
    create: rxMethod<NewTenantModel>(
      pipe(
        tap(() => patchState(store, setPending(), { successMessage: null })),
        exhaustMap(tenant =>
          service.create(tenant).pipe(
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
    setActive: rxMethod<{ tenantId: string; active: boolean }>(
      pipe(
        tap(() => patchState(store, setPending(), { successMessage: null })),
        exhaustMap(({ tenantId, active }) =>
          service.setActive(tenantId, active).pipe(
            tapResponse({
              next: () => patchState(store, setFulfilled(), { successMessage: active ? 'Cabinet activé.' : 'Cabinet désactivé.' }),
              error: error => patchState(store, setError(toBackendErrorMessage(error))),
            }),
          ),
        ),
      ),
    ),
    _listen: rxMethod<void>(
      pipe(switchMap(() => service.watchTenants().pipe(tap(tenants => patchState(store, { tenants }))))),
    ),
  })),
  withHooks({ onInit: store => store._listen() }),
);
