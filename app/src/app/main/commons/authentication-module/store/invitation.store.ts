import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { exhaustMap, pipe, switchMap, tap } from 'rxjs';
import { CommonRouteContainerModel } from '../../../../core/routing/common-routes/common-route-container.model';
import {
  setError,
  setPending,
  withRequestStatus,
} from '../../../../core/store-features/with-request-status';
import {
  toBackendErrorMessage,
  toBackendErrorReason,
} from '../../../../core/utils/backend-error.utils';
import { AuthService } from '../services/auth.service';
import { InvitationService } from '../services/invitation.service';

/** Acceptation d'une invitation (store de composant). */
export const InvitationStore = signalStore(
  withRequestStatus(),
  // Le compte connecté n'est pas celui qui a reçu l'invitation : la page propose de changer de compte.
  withState({ wrongAccount: false }),
  withMethods(
    (
      store,
      invitationService = inject(InvitationService),
      authService = inject(AuthService),
      router = inject(Router),
    ) => ({
      accept: rxMethod<{ cabinetId: string; invitationId: string }>(
        pipe(
          tap(() => patchState(store, setPending(), { wrongAccount: false })),
          exhaustMap(({ cabinetId, invitationId }) =>
            invitationService.accept(cabinetId, invitationId).pipe(
              // Le cabinet et le rôle viennent d'être posés côté serveur : on recharge le token.
              switchMap(() => authService.refreshToken()),
              tapResponse({
                next: () => router.navigateByUrl(CommonRouteContainerModel.HOME_ROUTE.url),
                error: (error) =>
                  patchState(store, setError(toBackendErrorMessage(error)), {
                    wrongAccount: toBackendErrorReason(error) === 'wrong_email',
                  }),
              }),
            ),
          ),
        ),
      ),
    }),
  ),
);
