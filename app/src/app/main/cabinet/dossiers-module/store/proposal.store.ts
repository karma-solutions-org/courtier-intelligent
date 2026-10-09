import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Offer } from '@shared';
import { catchError, EMPTY, exhaustMap, Observable, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { PROPOSAL_STRUCTURE } from '../components/proposal-tab/proposal-tab.structure';
import { PricingService } from '../services/pricing.service';
import { ProposalAnswer, ProposalService } from '../services/proposal.service';
import { DossierStore } from './dossier.store';

interface ProposalState {
  offers: Offer[];
  busy: boolean;
  error: string | null;
  successMessage: string | null;
}

/** Store de l'onglet Proposition (fourni par le composant) : offre retenue, envoi et réponse de l'assuré. */
export const ProposalStore = signalStore(
  withState<ProposalState>({ offers: [], busy: false, error: null, successMessage: null }),
  withComputed((store, dossierStore = inject(DossierStore)) => ({
    chosenOffer: computed(() => {
      const insurerId = dossierStore.dossier()?.decision?.insurerId;
      return store.offers().find(offer => offer.id === insurerId) ?? null;
    }),
  })),
  withMethods(
    (
      store,
      pricing = inject(PricingService),
      service = inject(ProposalService),
      authStore = inject(AuthStore),
      dossierStore = inject(DossierStore),
    ) => {
      /** Appel au serveur ; le dossier (suivi en temps réel) reflète le nouveau statut. */
      const run = <T>(request: () => Observable<T>, message: string) => {
        patchState(store, { busy: true, error: null });
        return request().pipe(
          tap(() => patchState(store, { successMessage: message })),
          catchError(error => {
            patchState(store, { error: toBackendErrorMessage(error) });
            return EMPTY;
          }),
          tap({ finalize: () => patchState(store, { busy: false }) }),
        );
      };
      return {
        clearMessages: () => patchState(store, { error: null, successMessage: null }),

        send: rxMethod<{ to: string; message: string }>(
          pipe(
            exhaustMap(({ to, message }) =>
              run(() => service.send(dossierStore.selectedId()!, to, message), PROPOSAL_STRUCTURE.sentMessage),
            ),
          ),
        ),

        recordAnswer: rxMethod<ProposalAnswer>(
          pipe(
            exhaustMap(answer =>
              run(() => service.recordAnswer(dossierStore.selectedId()!, answer), PROPOSAL_STRUCTURE.answerSaved),
            ),
          ),
        ),

        _listen: rxMethod<string | null>(
          pipe(
            tap(() => patchState(store, { offers: [] })),
            switchMap(id => {
              const cabinetId = authStore.cabinetId();
              if (!id || !cabinetId) return EMPTY;
              return pricing.watchOffers(cabinetId, id).pipe(
                tap(offers => patchState(store, { offers })),
                catchError(() => EMPTY),
              );
            }),
          ),
        ),
      };
    },
  ),
  withHooks({
    onInit: store => store._listen(inject(DossierStore).selectedId),
  }),
);
