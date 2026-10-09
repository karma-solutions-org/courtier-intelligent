import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { AuditLogEntry, Cabinet, CabinetRole, Insurer, Invitation, Member, MemberStatus, Product } from '@shared';
import { EMPTY, exhaustMap, merge, Observable, pipe, switchMap, tap } from 'rxjs';
import {
  setError,
  setFulfilled,
  setPending,
  withRequestStatus,
} from '../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { CabinetInfoModel } from '../models/cabinet-info.model';
import { CatalogChoicesModel } from '../models/catalog-choices.model';
import { SettingsService } from '../services/settings.service';

interface SettingsState {
  cabinet: Cabinet | null;
  members: Member[];
  invitations: Invitation[];
  auditLog: AuditLogEntry[];
  products: Product[];
  insurers: Insurer[];
  /** Message de confirmation de la dernière action réussie. */
  successMessage: string | null;
}

/** Store de la page Paramètres (fourni par la route). */
export const SettingsStore = signalStore(
  withState<SettingsState>({
    cabinet: null,
    members: [],
    invitations: [],
    auditLog: [],
    products: [],
    insurers: [],
    successMessage: null,
  }),
  withRequestStatus(),
  withComputed(({ cabinet }) => ({
    /** Réinitialisations d'appareil consommées ce mois-ci (le quota repart à zéro chaque mois, comme côté serveur). */
    deviceResetsUsed: computed(() => {
      const resets = cabinet()?.deviceResets;
      return resets && resets.month === new Date().toISOString().substring(0, 7) ? resets.count : 0;
    }),
  })),
  withMethods((store, service = inject(SettingsService), authStore = inject(AuthStore)) => {
    const cabinetId = () => authStore.cabinetId()!;

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
      saveCabinet: runAction<CabinetInfoModel>(info => service.updateCabinet(cabinetId(), info), 'Informations enregistrées.'),
      uploadLogo: runAction<File>(file => service.uploadLogo(cabinetId(), file), 'Logo mis à jour.'),
      invite: runAction<{ email: string; role: CabinetRole }>(
        ({ email, role }) => service.invite(email, role),
        'Invitation envoyée.',
      ),
      setRole: runAction<{ uid: string; role: CabinetRole }>(({ uid, role }) => service.setRole(uid, role), 'Rôle modifié.'),
      cancelInvitation: runAction<string>(invitationId => service.cancelInvitation(invitationId), 'Invitation annulée.'),
      setStatus: runAction<{ uid: string; status: MemberStatus }>(
        ({ uid, status }) => service.setStatus(uid, status),
        'Statut du membre modifié.',
      ),
      resetDevice: runAction<string>(uid => service.resetDevice(uid), 'Appareil réinitialisé : le membre peut se connecter depuis son nouvel appareil.'),
      saveCatalogChoices: runAction<CatalogChoicesModel>(
        choices => service.saveCatalogChoices(cabinetId(), choices),
        'Assureurs et produits enregistrés.',
      ),
      clearMessage: () => patchState(store, { successMessage: null }),
      _listen: rxMethod<string | null>(
        pipe(
          switchMap(id =>
            id
              ? merge(
                  service.watchCabinet(id).pipe(tap(cabinet => patchState(store, { cabinet }))),
                  service.watchMembers(id).pipe(tap(members => patchState(store, { members }))),
                  service.watchPendingInvitations(id).pipe(tap(invitations => patchState(store, { invitations }))),
                  service.watchAuditLog(id).pipe(tap(auditLog => patchState(store, { auditLog }))),
                  service.watchProducts().pipe(tap(products => patchState(store, { products }))),
                  service.watchInsurers().pipe(tap(insurers => patchState(store, { insurers }))),
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
      store._listen(authStore.cabinetId);
    },
  }),
);
