import { inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Invitation, Member, MemberStatus, Tenant, TenantRole } from '@shared';
import { EMPTY, exhaustMap, merge, Observable, pipe, switchMap, tap } from 'rxjs';
import {
  setError,
  setFulfilled,
  setPending,
  withRequestStatus,
} from '../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { TenantInfoModel } from '../models/tenant-info.model';
import { SettingsService } from '../services/settings.service';

interface SettingsState {
  tenant: Tenant | null;
  members: Member[];
  invitations: Invitation[];
  /** Message de confirmation de la dernière action réussie. */
  successMessage: string | null;
}

/** Store de la page Paramètres (fourni par la route). */
export const SettingsStore = signalStore(
  withState<SettingsState>({ tenant: null, members: [], invitations: [], successMessage: null }),
  withRequestStatus(),
  withMethods((store, service = inject(SettingsService), authStore = inject(AuthStore)) => {
    const tenantId = () => authStore.tenantId()!;

    /** Exécute une action et met à jour le statut et le message de confirmation. */
    const runAction = <T>(action: (input: T) => Observable<unknown>, successMessage: string) =>
      rxMethod<T>(
        pipe(
          tap(() => patchState(store, setPending(), { successMessage: null })),
          exhaustMap(input =>
            action(input).pipe(
              tapResponse({
                next: () => patchState(store, setFulfilled(), { successMessage }),
                error: error => patchState(store, setError(toBackendErrorMessage(error))),
              }),
            ),
          ),
        ),
      );

    return {
      saveTenant: runAction<TenantInfoModel>(info => service.updateTenant(tenantId(), info), 'Informations enregistrées.'),
      uploadLogo: runAction<File>(file => service.uploadLogo(tenantId(), file), 'Logo mis à jour.'),
      invite: runAction<{ email: string; role: TenantRole }>(
        ({ email, role }) => service.invite(email, role),
        'Invitation envoyée.',
      ),
      setRole: runAction<{ uid: string; role: TenantRole }>(({ uid, role }) => service.setRole(uid, role), 'Rôle modifié.'),
      setStatus: runAction<{ uid: string; status: MemberStatus }>(
        ({ uid, status }) => service.setStatus(uid, status),
        'Statut du membre modifié.',
      ),
      clearMessage: () => patchState(store, { successMessage: null }),
      _listen: rxMethod<string | null>(
        pipe(
          switchMap(id =>
            id
              ? merge(
                  service.watchTenant(id).pipe(tap(tenant => patchState(store, { tenant }))),
                  service.watchMembers(id).pipe(tap(members => patchState(store, { members }))),
                  service.watchPendingInvitations(id).pipe(tap(invitations => patchState(store, { invitations }))),
                )
              : EMPTY,
          ),
        ),
      ),
    };
  }),
  withHooks({
    onInit: store => {
      const authStore = inject(AuthStore);
      store._listen(authStore.tenantId);
    },
  }),
);
