import { inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, concatMap, EMPTY, pipe, tap } from 'rxjs';
import { setNotice } from '../../../../../core/store-features/with-notice';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { DossiersService } from '../../services/dossiers.service';
import { DossierStoreState } from './dossier.state';

/** Fin de vie d'un dossier depuis sa fiche : classement sans suite et mise à la corbeille. */
export function withDossierClosing() {
  return signalStoreFeature(
    { state: type<DossierStoreState>() },
    withMethods((store, service = inject(DossiersService)) => ({
      resetRemoveStatus: () => patchState(store, { removeStatus: 'idle' }),
      /** Classe le dossier sans suite avec son motif (les tarifications en cours sont annulées par le serveur). */
      classerSansSuite: rxMethod<{ dossierId: string; motif: string }>(
        pipe(
          tap(() => patchState(store, { closing: true })),
          concatMap(({ dossierId, motif }) =>
            service.classerSansSuite(dossierId, motif).pipe(
              tap(({ cancelledJobs }) => {
                const jobs = cancelledJobs ? ` ${cancelledJobs} tarification(s) annulée(s).` : '';
                patchState(store, { closing: false }, setNotice(`Dossier classé sans suite.${jobs}`, 4000));
              }),
              catchError((error) => {
                patchState(store, { closing: false }, setNotice(toBackendErrorMessage(error), 5000));
                return EMPTY;
              }),
            ),
          ),
        ),
      ),
      /** Met le dossier dans la corbeille. */
      remove: rxMethod<string>(
        pipe(
          tap(() => patchState(store, { removeStatus: 'pending' })),
          concatMap((dossierId) =>
            service.remove(dossierId).pipe(
              tap(() => patchState(store, { removeStatus: 'done' }, setNotice('Dossier placé dans la corbeille.', 3000))),
              catchError((error) => {
                patchState(store, { removeStatus: 'failed' }, setNotice(toBackendErrorMessage(error), 5000));
                return EMPTY;
              }),
            ),
          ),
        ),
      ),
    })),
  );
}
