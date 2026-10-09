import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { DossierStatus, Offer } from '@shared';
import { catchError, EMPTY, exhaustMap, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { ComparisonColumn } from '../components/comparison-table/comparison-table.component';
import { COMPARISON_STRUCTURE } from '../components/comparison-tab/comparison-tab.structure';
import { ComparisonService } from '../services/comparison.service';
import { PricingService } from '../services/pricing.service';
import { DossierStore } from './dossier.store';

/** Statuts dans lesquels on peut choisir l'offre retenue (le serveur refait le contrôle). */
export const DECISION_DOSSIER_STATUSES: DossierStatus[] = ['tarification', 'comparaison', 'decision'];

interface ComparisonState {
  offers: Offer[];
  busy: boolean;
  error: string | null;
  successMessage: string | null;
}

/** Store de l'onglet Comparatif (fourni par le composant) : offres suivies en temps réel, triées par score. */
export const ComparisonStore = signalStore(
  withState<ComparisonState>({ offers: [], busy: false, error: null, successMessage: null }),
  withComputed((store, dossierStore = inject(DossierStore)) => ({
    columns: computed<ComparisonColumn[]>(() => {
      const names = dossierStore.insurerNames();
      return [...store.offers()]
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .map(offer => ({
          insurerId: offer.id,
          insurerName: names.get(offer.id) ?? offer.id,
          offer,
        }));
    }),
    canDecide: computed(() => {
      const status = dossierStore.dossier()?.status;
      return !!status && DECISION_DOSSIER_STATUSES.includes(status);
    }),
  })),
  withMethods(
    (
      store,
      pricing = inject(PricingService),
      service = inject(ComparisonService),
      authStore = inject(AuthStore),
      dossierStore = inject(DossierStore),
    ) => ({
      clearMessages: () => patchState(store, { error: null, successMessage: null }),

      /** Choix de l'offre retenue ; le dossier (suivi en temps réel) passe en « Décision ». */
      decide: rxMethod<{ insurerId: string; justification: string }>(
        pipe(
          exhaustMap(({ insurerId, justification }) => {
            patchState(store, { busy: true, error: null });
            return service.decide(dossierStore.selectedId()!, insurerId, justification).pipe(
              tap(() => patchState(store, { successMessage: COMPARISON_STRUCTURE.decisionSaved })),
              catchError(error => {
                patchState(store, { error: toBackendErrorMessage(error) });
                return EMPTY;
              }),
              tap({ finalize: () => patchState(store, { busy: false }) }),
            );
          }),
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
    }),
  ),
  withHooks({
    onInit: store => store._listen(inject(DossierStore).selectedId),
  }),
);
