import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { exhaustMap, pipe } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { DossiersService } from '../services/dossiers.service';

interface DossierActionsState {
  /** Classement sans suite en cours. */
  closing: boolean;
  /** Mise à la corbeille en cours. */
  deleting: boolean;
  /** Le courtier a demandé la suppression : confirmation affichée. */
  confirmingDelete: boolean;
}

/** Actions de l'en-tête d'un dossier (fourni par la fiche) : classer sans suite, mettre à la corbeille. */
export const DossierActionsStore = signalStore(
  withState<DossierActionsState>({ closing: false, deleting: false, confirmingDelete: false }),
  withMethods((store, dossiers = inject(DossiersService), snackBar = inject(MatSnackBar), router = inject(Router)) => ({
    askDelete: () => patchState(store, { confirmingDelete: true }),
    cancelDelete: () => patchState(store, { confirmingDelete: false }),

    /** Classe le dossier sans suite (les tarifications en cours sont annulées par le serveur). */
    classerSansSuite: rxMethod<{ dossierId: string; motif: string }>(
      pipe(
        exhaustMap(({ dossierId, motif }) => {
          patchState(store, { closing: true });
          return dossiers.classerSansSuite(dossierId, motif).pipe(
            tapResponse({
              next: ({ cancelledJobs }) => {
                patchState(store, { closing: false });
                const jobs = cancelledJobs ? ` ${cancelledJobs} tarification(s) annulée(s).` : '';
                snackBar.open(`Dossier classé sans suite.${jobs}`, undefined, { duration: 4000 });
              },
              error: (error) => {
                patchState(store, { closing: false });
                snackBar.open(toBackendErrorMessage(error), undefined, { duration: 5000 });
              },
            }),
          );
        }),
      ),
    ),

    /** Met le dossier dans la corbeille, puis revient à `backUrl` (l'espace du client). */
    remove: rxMethod<{ dossierId: string; backUrl: string }>(
      pipe(
        exhaustMap(({ dossierId, backUrl }) => {
          patchState(store, { deleting: true });
          return dossiers.remove(dossierId).pipe(
            tapResponse({
              next: () => {
                snackBar.open('Dossier placé dans la corbeille.', undefined, { duration: 3000 });
                void router.navigateByUrl(backUrl);
              },
              error: (error) => {
                patchState(store, { deleting: false, confirmingDelete: false });
                snackBar.open(toBackendErrorMessage(error), undefined, { duration: 5000 });
              },
            }),
          );
        }),
      ),
    ),
  })),
);
