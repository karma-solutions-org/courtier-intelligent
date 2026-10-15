import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { DOSSIER_STATUSES, DossierStatus, isTransitionAllowed, Offer } from '@shared';
import { catchError, EMPTY, exhaustMap, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { ComparisonColumn } from '../components/comparison-table/comparison-table.component';
import { COMPARISON_STRUCTURE } from '../components/comparison-tab/comparison-tab.structure';
import { ComparisonService } from '../services/comparison.service';
import { DossiersService } from '../services/dossiers.service';
import { PricingService } from '../services/pricing.service';
import { DossierStore } from './dossier.store';

/** Statuts dans lesquels on peut choisir l'offre retenue (le serveur refait le contrôle). */
/** Statuts où une offre peut être retenue : déduits de la machine à états (passage en décision, ou nouveau choix). */
export const DECISION_DOSSIER_STATUSES: DossierStatus[] = DOSSIER_STATUSES.filter(
  (status) => status === 'decision' || isTransitionAllowed(status, 'decision'),
);

interface ComparisonState {
  offers: Offer[];
  busy: boolean;
  /** Vrai dès la première réponse (ou erreur) de l'écoute : distingue chargement, liste vide et erreur. */
  loaded: boolean;
  error: string | null;
  successMessage: string | null;
}

/** Store de l'onglet Comparatif (fourni par le composant) : offres suivies en temps réel, triées par score. */
export const ComparisonStore = signalStore(
  withState<ComparisonState>({
    offers: [],
    busy: false,
    loaded: false,
    error: null,
    successMessage: null,
  }),
  withComputed((store, dossierStore = inject(DossierStore)) => ({
    columns: computed<ComparisonColumn[]>(() => {
      const names = dossierStore.insurerNames();
      return [...store.offers()]
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .map((offer) => ({
          insurerId: offer.id,
          insurerName: names.get(offer.id) ?? offer.id,
          offer,
        }));
    }),
    /** Offres à refaire : les données du dossier ont changé depuis leur capture. */
    staleNames: computed(() => {
      const names = dossierStore.insurerNames();
      return store.offers().filter((offer) => offer.stale).map((offer) => names.get(offer.id) ?? offer.id);
    }),
    /** Après la décision (avant l'envoi de la proposition), on peut revenir au comparatif. */
    canReopen: computed(() => {
      const status = dossierStore.dossier()?.status;
      return !!status && status === 'decision' && isTransitionAllowed(status, 'comparaison');
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
      dossiers = inject(DossiersService),
    ) => ({
      /** Annule le choix : le dossier revient en « Comparaison » (permis par la machine à états depuis « Décision »). */
      reopen: rxMethod<void>(
        pipe(
          exhaustMap(() => {
            const dossierId = dossierStore.selectedId();
            if (!dossierId) return EMPTY;
            patchState(store, { busy: true, error: null });
            return dossiers.changeStatus(dossierId, 'comparaison').pipe(
              tap(() => patchState(store, { successMessage: 'Retour au comparatif : vous pouvez retenir une autre offre.' })),
              catchError((error) => {
                patchState(store, { error: toBackendErrorMessage(error) });
                return EMPTY;
              }),
              tap({ finalize: () => patchState(store, { busy: false }) }),
            );
          }),
        ),
      ),
      clearMessages: () => patchState(store, { error: null, successMessage: null }),
      /** Après affichage du snackbar : l'erreur éventuelle reste affichée. */
      clearSuccess: () => patchState(store, { successMessage: null }),

      /** Choix de l'offre retenue ; le dossier (suivi en temps réel) passe en « Décision ». */
      decide: rxMethod<{ insurerId: string; justification: string }>(
        pipe(
          exhaustMap(({ insurerId, justification }) => {
            const dossierId = dossierStore.selectedId();
            if (!dossierId) {
              return EMPTY;
            }
            patchState(store, { busy: true, error: null });
            return service.decide(dossierId, insurerId, justification).pipe(
              tap(() => patchState(store, { successMessage: COMPARISON_STRUCTURE.decisionSaved })),
              catchError((error) => {
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
          tap(() => patchState(store, { offers: [], loaded: false })),
          switchMap((id) => {
            const cabinetId = authStore.cabinetId();
            if (!id || !cabinetId) return EMPTY;
            return pricing.watchOffers(cabinetId, id).pipe(
              tap((offers) => patchState(store, { offers, loaded: true })),
              catchError((error) => {
                patchState(store, { error: toBackendErrorMessage(error), loaded: true });
                return EMPTY;
              }),
            );
          }),
        ),
      ),
    }),
  ),
  withHooks({
    onInit: (store) => store._listen(inject(DossierStore).selectedId),
  }),
);
