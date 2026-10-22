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
import {
  AuditLogEntry,
  Cabinet,
  CabinetRole,
  Insurer,
  Invitation,
  Member,
  MemberStatus,
  Product,
} from '@shared';
import { catchError, EMPTY, exhaustMap, merge, Observable, pipe, switchMap, tap } from 'rxjs';
import {
  setError,
  setFulfilled,
  resetRequestStatus,
  setPending,
  withRequestStatus,
} from '../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { CabinetInfoModel } from '../models/cabinet-info.model';
import { CatalogChoicesModel } from '../models/catalog-choices.model';
import { SettingsService } from '../services/settings.service';

/** Taille d'une tranche du journal (défilement infini). */
const AUDIT_LOG_PAGE_SIZE = 20;

interface SettingsState {
  cabinet: Cabinet | null;
  members: Member[];
  invitations: Invitation[];
  auditLog: AuditLogEntry[];
  /** Entrées du journal demandées à Firestore : grandit d'une tranche à chaque fin de défilement. */
  auditLogLimit: number;
  auditLogHasMore: boolean;
  auditLogLoadingMore: boolean;
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
    auditLogLimit: AUDIT_LOG_PAGE_SIZE,
    auditLogHasMore: false,
    auditLogLoadingMore: false,
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
    /** Écriture sur le cabinet courant ; rien sans cabinet (session en cours de fermeture). */
    const onCabinet = (write: (cabinetId: string) => Observable<unknown>): Observable<unknown> => {
      const cabinetId = authStore.cabinetId();
      if (cabinetId) return write(cabinetId);
      // Écriture ignorée : on retire le statut « en cours » pour ne pas bloquer le formulaire.
      patchState(store, resetRequestStatus());
      return EMPTY;
    };

    /** Exécute une action et met à jour le statut et le message de confirmation. */
    const runAction = <T>(action: (input: T) => Observable<unknown>, successMessage: string) =>
      rxMethod<T>(
        pipe(
          tap(() => patchState(store, setPending(), { successMessage: null })),
          exhaustMap((input) =>
            action(input).pipe(
              tapResponse({
                next: () => patchState(store, setFulfilled(), { successMessage }),
                error: (error) => patchState(store, setError(toBackendErrorMessage(error))),
              }),
            ),
          ),
        ),
      );

    return {
      saveCabinet: runAction<CabinetInfoModel>(
        (info) => onCabinet((id) => service.updateCabinet(id, info)),
        'Informations enregistrées.',
      ),
      uploadLogo: runAction<File>(
        (file) => onCabinet((id) => service.uploadLogo(id, file)),
        'Logo mis à jour.',
      ),
      invite: runAction<{ email: string; role: CabinetRole }>(
        ({ email, role }) => service.invite(email, role),
        'Invitation envoyée.',
      ),
      setRole: runAction<{ uid: string; role: CabinetRole }>(
        ({ uid, role }) => service.setRole(uid, role),
        'Rôle modifié.',
      ),
      cancelInvitation: runAction<string>(
        (invitationId) => service.cancelInvitation(invitationId),
        'Invitation annulée.',
      ),
      setStatus: runAction<{ uid: string; status: MemberStatus }>(
        ({ uid, status }) => service.setStatus(uid, status),
        'Statut du membre modifié.',
      ),
      resetDevice: runAction<string>(
        (uid) => service.resetDevice(uid),
        'Appareil réinitialisé : le membre peut se connecter depuis son nouvel appareil.',
      ),
      saveCatalogChoices: runAction<CatalogChoicesModel>(
        (choices) => onCabinet((id) => service.saveCatalogChoices(id, choices)),
        'Assureurs et produits enregistrés.',
      ),
      clearMessage: () => patchState(store, { successMessage: null }),
      /** Fin du défilement du journal : demande la tranche suivante. */
      loadMoreAuditLog: () => {
        if (store.auditLogHasMore() && !store.auditLogLoadingMore()) {
          patchState(store, { auditLogLimit: store.auditLogLimit() + AUDIT_LOG_PAGE_SIZE, auditLogLoadingMore: true });
        }
      },
      _listenAuditLog: rxMethod<{ cabinetId: string | null; limit: number }>(
        pipe(
          switchMap(({ cabinetId, limit }) =>
            cabinetId
              ? service.watchAuditLog(cabinetId, limit).pipe(
                  tap(({ entries, hasMore }) =>
                    patchState(store, { auditLog: entries, auditLogHasMore: hasMore, auditLogLoadingMore: false }),
                  ),
                  catchError((error) => {
                    patchState(store, setError(toBackendErrorMessage(error)), { auditLogLoadingMore: false });
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),
      _listen: rxMethod<string | null>(
        pipe(
          switchMap((id) =>
            id
              ? merge(
                  service.watchCabinet(id).pipe(tap((cabinet) => patchState(store, { cabinet }))),
                  service.watchMembers(id).pipe(tap((members) => patchState(store, { members }))),
                  // Une invitation expirée reste « pending » en base (aucune tâche planifiée ne la clôt) : on ne l'affiche plus.
                  service
                    .watchPendingInvitations(id)
                    .pipe(
                      tap((invitations) =>
                        patchState(store, {
                          invitations: invitations.filter(
                            (invitation) => invitation.expiresAt.toMillis() > Date.now(),
                          ),
                        }),
                      ),
                    ),
                  service.watchProducts().pipe(tap((products) => patchState(store, { products }))),
                  service.watchInsurers().pipe(tap((insurers) => patchState(store, { insurers }))),
                ).pipe(
                  // Écoute en échec (droits, réseau) : on affiche l'erreur au lieu de l'avaler.
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
      store._listen(authStore.cabinetId);
      store._listenAuditLog(
        computed(
          () => ({ cabinetId: authStore.cabinetId(), limit: store.auditLogLimit() }),
          { equal: (a, b) => a.cabinetId === b.cabinetId && a.limit === b.limit },
        ),
      );
    },
  }),
);
