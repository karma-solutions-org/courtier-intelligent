import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { exhaustMap, pipe, switchMap, tap } from 'rxjs';
import { CommonRouteContainerModel } from '../../../../core/routing/common-routes/common-route-container.model';
import { setError, setPending, withRequestStatus } from '../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthService } from '../services/auth.service';
import { InvitationService } from '../services/invitation.service';

/** Acceptation d'une invitation (store de composant). */
export const InvitationStore = signalStore(
  withRequestStatus(),
  withMethods(
    (store, invitationService = inject(InvitationService), authService = inject(AuthService), router = inject(Router)) => ({
      accept: rxMethod<{ tenantId: string; invitationId: string }>(
        pipe(
          tap(() => patchState(store, setPending())),
          exhaustMap(({ tenantId, invitationId }) =>
            invitationService.accept(tenantId, invitationId).pipe(
              // Le cabinet et le rôle viennent d'être posés côté serveur : on recharge le token.
              switchMap(() => authService.refreshToken()),
              tapResponse({
                next: () => router.navigateByUrl(CommonRouteContainerModel.HOME_ROUTE.url),
                error: error => patchState(store, setError(toBackendErrorMessage(error))),
              }),
            ),
          ),
        ),
      ),
    }),
  ),
);
