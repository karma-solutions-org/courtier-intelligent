import { inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { ExtranetReliabilityReport, ReliabilityPeriod } from '@shared';
import { pipe, switchMap, tap } from 'rxjs';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { SettingsService } from '../services/settings.service';

interface ExtranetReliabilityState {
  /** Période du bilan, en jours. */
  period: ReliabilityPeriod;
  /** Dernier bilan reçu pour `period` ; null tant qu'il n'est pas calculé. */
  report: ExtranetReliabilityReport | null;
}

/**
 * Bilan « Fiabilité des extranets » de la page Paramètres (fourni par la page, chargé au premier affichage de l'onglet).
 * Le calcul est fait par le serveur : le store ne garde que la période choisie et le dernier bilan.
 */
export const ExtranetReliabilityStore = signalStore(
  withState<ExtranetReliabilityState>({ period: 30, report: null }),
  withRequestStatus(),
  withMethods((store, service = inject(SettingsService)) => {
    const fetch = rxMethod<ReliabilityPeriod>(
      pipe(
        // Une autre période : l'ancien bilan n'est plus affiché (il ne correspond plus à la sélection).
        tap((period) =>
          patchState(store, setPending(), period === store.period() ? {} : { period, report: null }),
        ),
        switchMap((period) =>
          service.extranetReliability(period).pipe(
            tapResponse({
              next: (report) => patchState(store, { report }, setFulfilled()),
              error: (error) => patchState(store, setError(toReliabilityErrorMessage(error))),
            }),
          ),
        ),
      ),
    );

    return {
      /** Calcule le bilan de la période (la période en cours par défaut : « Actualiser »). */
      load: (period: ReliabilityPeriod = store.period()) => fetch(period),
      /** Premier affichage de l'onglet : calcule le bilan s'il ne l'est pas déjà. */
      ensureLoaded: () => {
        if (!store.report() && !store.isPending()) fetch(store.period());
      },
    };
  }),
);

/** Message français d'un échec du calcul (function absente ou erreur générique comprises). */
function toReliabilityErrorMessage(error: unknown): string {
  const { code } = (error ?? {}) as { code?: string };
  if (code === 'functions/not-found') {
    return "Le bilan de fiabilité n'est pas encore disponible. Réessayez plus tard.";
  }
  return toBackendErrorMessage(error);
}
