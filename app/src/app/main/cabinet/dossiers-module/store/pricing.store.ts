import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  CanonicalData,
  Insurer,
  insurersForProduct,
  ManualOfferInput,
  Offer,
  PRICING_DOSSIER_STATUSES,
  quoteDocumentsFolder,
  QuoteJob,
} from '@shared';
import { catchError, EMPTY, map, merge, mergeMap, Observable, of, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { CabinetStatusStore } from '../../../commons/main-module/store/cabinet-status.store';
import { PricingService, QuoteDocumentRef } from '../services/pricing.service';
import { DossierStore } from './dossier.store';

/** Une carte de l'onglet Tarification : l'assureur, son job et son offre. */
export interface PricingCard {
  insurer: Insurer;
  job: QuoteJob | null;
  offer: Offer | null;
}

/** Saisie manuelle : l'offre et, éventuellement, le devis à joindre. */
export interface ManualOfferSubmission {
  offer: ManualOfferInput;
  file: File | null;
}

type Action =
  | { kind: 'launch'; insurerId: string; target: Window | null }
  | { kind: 'complete'; insurerId: string; answers: CanonicalData }
  | { kind: 'manual'; insurerId: string; submission: ManualOfferSubmission };

interface PricingState {
  jobs: QuoteJob[];
  offers: Offer[];
  /** Assureurs pour lesquels une écriture est en cours (bouton désactivé). */
  busy: string[];
  error: string | null;
  successMessage: string | null;
}

/** Store de l'onglet Tarification (fourni par le composant) : une carte par assureur, suivie en temps réel. */
export const PricingStore = signalStore(
  withState<PricingState>({ jobs: [], offers: [], busy: [], error: null, successMessage: null }),
  withComputed((store, dossierStore = inject(DossierStore), cabinetStatus = inject(CabinetStatusStore)) => ({
    cards: computed<PricingCard[]>(() => {
      const productId = dossierStore.dossier()?.productId ?? '';
      const enabled = cabinetStatus.cabinet()?.enabledInsurers ?? [];
      return insurersForProduct(dossierStore.insurers(), productId, enabled).map(insurer => ({
        insurer,
        job: store.jobs().find(j => j.id === insurer.id) ?? null,
        offer: store.offers().find(o => o.id === insurer.id) ?? null,
      }));
    }),
    /** On tarifie une fois le besoin validé (le serveur refait le contrôle). */
    canPrice: computed(() => {
      const dossier = dossierStore.dossier();
      return !!dossier && PRICING_DOSSIER_STATUSES.includes(dossier.status) && !!dossier.needAnalysis?.validatedAt;
    }),
  })),
  withMethods((store, service = inject(PricingService), authStore = inject(AuthStore), dossierStore = inject(DossierStore)) => {
    const dossierId = () => dossierStore.selectedId()!;
    const setBusy = (insurerId: string, busy: boolean) =>
      patchState(store, { busy: busy ? [...store.busy(), insurerId] : store.busy().filter(id => id !== insurerId) });

    /** Envoie le devis dans Storage (rangé dans le dossier, nommé d'après l'assureur), avant d'enregistrer l'offre. */
    const upload = (insurerId: string, file: File | null): Observable<QuoteDocumentRef | null> => {
      if (!file) return of(null);
      const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
      const storagePath = `${quoteDocumentsFolder(authStore.cabinetId()!, dossierId())}/${insurerId}-${Date.now()}.${extension}`;
      return service.uploadQuoteDocument(storagePath, file).pipe(map(() => ({ storagePath, fileName: file.name })));
    };

    const perform = (action: Action): Observable<unknown> => {
      switch (action.kind) {
        case 'launch':
          return service.launch(dossierId(), action.insurerId).pipe(
            tap(({ extranetUrl }) => {
              if (action.target && extranetUrl) {
                action.target.location.href = extranetUrl;
              } else {
                action.target?.close();
              }
              patchState(store, { successMessage: 'Tarification lancée : l’extension prend le relais sur l’extranet.' });
            }),
          );
        case 'complete':
          return service
            .complete(dossierId(), action.insurerId, action.answers)
            .pipe(tap(() => patchState(store, { successMessage: 'Informations envoyées : l’extension reprend le remplissage.' })));
        case 'manual':
          return upload(action.insurerId, action.submission.file).pipe(
            switchMap(document => service.saveManualOffer(dossierId(), action.insurerId, action.submission.offer, document)),
            tap(() => patchState(store, { successMessage: 'Offre enregistrée.' })),
          );
      }
    };

    return {
      clearMessages: () => patchState(store, { error: null, successMessage: null }),

      /** Une action par assureur à la fois ; des assureurs différents avancent en parallèle. */
      _act: rxMethod<Action>(
        pipe(
          mergeMap(action => {
            setBusy(action.insurerId, true);
            patchState(store, { error: null });
            return perform(action).pipe(
              catchError(error => {
                if (action.kind === 'launch') action.target?.close();
                patchState(store, { error: toBackendErrorMessage(error) });
                return EMPTY;
              }),
              tap({ finalize: () => setBusy(action.insurerId, false) }),
            );
          }),
        ),
      ),

      _listen: rxMethod<string | null>(
        pipe(
          tap(() => patchState(store, { jobs: [], offers: [] })),
          switchMap(id => {
            const cabinetId = authStore.cabinetId();
            if (!id || !cabinetId) return EMPTY;
            return merge(
              service.watchJobs(cabinetId, id).pipe(tap(jobs => patchState(store, { jobs }))),
              service.watchOffers(cabinetId, id).pipe(tap(offers => patchState(store, { offers }))),
            ).pipe(catchError(() => EMPTY));
          }),
        ),
      ),
    };
  }),
  withMethods(store => ({
    /**
     * « Tarifer » ou « Relancer » : écrit le job puis ouvre l'extranet dans `target`, un onglet ouvert au clic
     * (ouvert après la réponse du serveur, il serait bloqué par le navigateur).
     */
    launch: (insurerId: string, target: Window | null) => store._act({ kind: 'launch', insurerId, target }),
    complete: (insurerId: string, answers: CanonicalData) => store._act({ kind: 'complete', insurerId, answers }),
    saveManualOffer: (insurerId: string, submission: ManualOfferSubmission) => store._act({ kind: 'manual', insurerId, submission }),
  })),
  withHooks({
    onInit: store => store._listen(inject(DossierStore).selectedId),
  }),
);
