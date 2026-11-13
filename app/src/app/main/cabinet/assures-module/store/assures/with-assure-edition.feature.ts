import { inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, exhaustMap, forkJoin, map, of, pipe, tap } from 'rxjs';
import { resetRequestStatus, setError, setFulfilled, setPending } from '../../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { ReadPiece } from '../../models/assure-document-import.model';
import { AssureFormModel, toAssureData } from '../../models/assure-form.model';
import { AssuresService } from '../../services/assures.service';
import { AssuresStoreState } from './assures.state';

/** Création, modification et mise à la corbeille d'un client, et rangement des pièces lues à sa création. */
export function withAssureEdition() {
  return signalStoreFeature(
    { state: type<AssuresStoreState>() },
    withMethods((store, service = inject(AssuresService), authStore = inject(AuthStore)) => ({
      clearMessage: () => patchState(store, { successMessage: null }),
      resetStatus: () => patchState(store, resetRequestStatus(), { createdId: null, deleted: false, piecesAttachResult: null }),
      /** Range chaque pièce lue avec le client qui vient d'être créé ; un échec n'empêche pas les autres. */
      attachPieces: rxMethod<{ assureId: string; pieces: ReadPiece[] }>(
        pipe(
          exhaustMap(({ assureId, pieces }) =>
            forkJoin(
              pieces.map((piece) =>
                service.attachPiece({ assureId, ...piece }).pipe(
                  map(() => true),
                  catchError(() => of(false)),
                ),
              ),
            ).pipe(tap((results) => patchState(store, { piecesAttachResult: results.includes(false) ? 'partial' : 'ok' }))),
          ),
        ),
      ),
      remove: rxMethod<string>(
        pipe(
          exhaustMap((id) => {
            patchState(store, setPending(), { successMessage: null });
            return service.remove(id).pipe(
              tapResponse({
                next: () => patchState(store, setFulfilled(), { deleted: true, successMessage: 'Client placé dans la corbeille.' }),
                error: (error) => patchState(store, setError(toBackendErrorMessage(error))),
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
                next: (createdId) => patchState(store, setFulfilled(), { createdId, successMessage: 'Client créé.' }),
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
                next: () => patchState(store, setFulfilled(), { successMessage: 'Fiche enregistrée.' }),
                error: (error) => patchState(store, setError(toBackendErrorMessage(error))),
              }),
            );
          }),
        ),
      ),
    })),
  );
}
