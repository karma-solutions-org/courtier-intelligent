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
import { catchError, EMPTY, filter, map, merge, mergeMap, Observable, of, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { CabinetStatusStore } from '../../../commons/main-module/store/cabinet-status.store';
import { PricingService, QuoteDocumentRef } from '../services/pricing.service';
import { DossierStore } from './dossier.store';

/** Message unique après l'annulation d'une tarification (snackbar et carte de l'assureur). */
export const PRICING_CANCELLED_TEXT = 'Tarification annulée : vous pouvez la relancer.';

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
  | { kind: 'cancel'; insurerId: string }
  | { kind: 'manual'; insurerId: string; submission: ManualOfferSubmission }
  | { kind: 'validate'; insurerId: string };

interface PricingState {
  jobs: QuoteJob[];
  offers: Offer[];
  /** Assureurs pour lesquels une écriture est en cours (bouton désactivé). */
  busy: string[];
  /** Vrai dès la première réponse (ou erreur) de l'écoute : distingue chargement, liste vide et erreur. */
  loaded: boolean;
  error: string | null;
  successMessage: string | null;
}

/** Store de l'onglet Tarification (fourni par le composant) : une carte par assureur, suivie en temps réel. */
export const PricingStore = signalStore(
  withState<PricingState>({
    jobs: [],
    offers: [],
    busy: [],
    loaded: false,
    error: null,
    successMessage: null,
  }),
  withComputed(
    (store, dossierStore = inject(DossierStore), cabinetStatus = inject(CabinetStatusStore)) => ({
      cards: computed<PricingCard[]>(() => {
        const productId = dossierStore.dossier()?.productId ?? '';
        const enabled = cabinetStatus.cabinet()?.enabledInsurers ?? [];
        const replacedProductId = dossierStore.product()?.replaces ?? null;
        return insurersForProduct(dossierStore.insurers(), productId, enabled, replacedProductId).map((insurer) => ({
          insurer,
          job: store.jobs().find((j) => j.id === insurer.id) ?? null,
          offer: store.offers().find((o) => o.id === insurer.id) ?? null,
        }));
      }),
      /** On tarifie une fois le besoin validé (le serveur refait le contrôle). */
      canPrice: computed(() => {
        const dossier = dossierStore.dossier();
        return (
          !!dossier &&
          PRICING_DOSSIER_STATUSES.includes(dossier.status) &&
          !!dossier.needAnalysis?.validatedAt
        );
      }),
    }),
  ),
  withMethods(
    (
      store,
      service = inject(PricingService),
      authStore = inject(AuthStore),
      dossierStore = inject(DossierStore),
    ) => {
      const setBusy = (insurerId: string, busy: boolean) =>
        patchState(store, {
          busy: busy ? [...store.busy(), insurerId] : store.busy().filter((id) => id !== insurerId),
        });

      /** Envoie le devis dans Storage (rangé dans le dossier, nommé d'après l'assureur), avant d'enregistrer l'offre. */
      const upload = (
        dossierId: string,
        insurerId: string,
        file: File | null,
      ): Observable<QuoteDocumentRef | null> => {
        if (!file) return of(null);
        const extension =
          file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
        const storagePath = `${quoteDocumentsFolder(authStore.cabinetId()!, dossierId)}/${insurerId}-${Date.now()}.${extension}`;
        return service
          .uploadQuoteDocument(storagePath, file)
          .pipe(map(() => ({ storagePath, fileName: file.name })));
      };

      const perform = (action: Action): Observable<unknown> => {
        const dossierId = dossierStore.selectedId();
        if (!dossierId) {
          return EMPTY;
        }
        switch (action.kind) {
          case 'launch':
            return service.launch(dossierId, action.insurerId).pipe(
              tap(({ extranetUrl }) => {
                if (action.target && extranetUrl) {
                  action.target.location.href = extranetUrl;
                } else {
                  action.target?.close();
                }
                patchState(store, {
                  successMessage:
                    "Tarification lancée : l'extension prend le relais sur l'extranet.",
                });
              }),
            );
          case 'cancel':
            return service
              .cancel(dossierId, action.insurerId)
              .pipe(tap(() => patchState(store, { successMessage: PRICING_CANCELLED_TEXT })));
          case 'complete':
            return service
              .complete(dossierId, action.insurerId, action.answers)
              .pipe(
                tap(() =>
                  patchState(store, {
                    successMessage: "Informations envoyées : l'extension reprend le remplissage.",
                  }),
                ),
              );
          case 'manual':
            return upload(dossierId, action.insurerId, action.submission.file).pipe(
              switchMap((document) =>
                service.saveManualOffer(dossierId, action.insurerId, action.submission.offer, document),
              ),
              tap(() => patchState(store, { successMessage: 'Offre enregistrée.' })),
            );
          case 'validate': {
            const cabinetId = authStore.cabinetId();
            const uid = authStore.user()?.uid;
            if (!cabinetId || !uid) return EMPTY;
            return service
              .validateOffer(cabinetId, dossierId, action.insurerId, uid)
              .pipe(tap(() => patchState(store, { successMessage: 'Tarif validé.' })));
          }
        }
      };

      return {
        clearMessages: () => patchState(store, { error: null, successMessage: null }),
        /** Après affichage du snackbar : l'erreur éventuelle reste affichée. */
        clearSuccess: () => patchState(store, { successMessage: null }),

        /** Une action par assureur à la fois ; des assureurs différents avancent en parallèle. */
        _act: rxMethod<Action>(
          pipe(
            // Un double clic ne relance pas une action déjà en cours pour cet assureur.
            filter((action) => {
              if (!store.busy().includes(action.insurerId)) return true;
              // L'onglet ouvert par ce clic ne servira pas : on le referme.
              if (action.kind === 'launch') action.target?.close();
              return false;
            }),
            mergeMap((action) => {
              setBusy(action.insurerId, true);
              patchState(store, { error: null });
              return perform(action).pipe(
                catchError((error) => {
                  if (action.kind === 'launch') action.target?.close();
                  patchState(store, { error: toBackendErrorMessage(error) });
                  return EMPTY;
                }),
                tap({ finalize: () => setBusy(action.insurerId, false) }),
              );
            }),
          ),
        ),

        /** Écoute relancée quand le dossier ou le cabinet change (cabinet connu après le dossier au démarrage). */
        _listen: rxMethod<{ id: string | null; cabinetId: string | null }>(
          pipe(
            tap(() => patchState(store, { jobs: [], offers: [], loaded: false })),
            switchMap(({ id, cabinetId }) => {
              if (!id || !cabinetId) {
                patchState(store, { loaded: true });
                return EMPTY;
              }
              return merge(
                service
                  .watchJobs(cabinetId, id)
                  .pipe(tap((jobs) => patchState(store, { jobs, loaded: true }))),
                service
                  .watchOffers(cabinetId, id)
                  .pipe(tap((offers) => patchState(store, { offers }))),
              ).pipe(
                catchError((error) => {
                  patchState(store, { error: toBackendErrorMessage(error), loaded: true });
                  return EMPTY;
                }),
              );
            }),
          ),
        ),
      };
    },
  ),
  withMethods((store) => ({
    /**
     * « Tarifer » ou « Relancer » : écrit le job puis ouvre l'extranet dans `target`, un onglet ouvert au clic
     * (ouvert après la réponse du serveur, il serait bloqué par le navigateur).
     */
    launch: (insurerId: string, target: Window | null) =>
      store._act({ kind: 'launch', insurerId, target }),
    cancel: (insurerId: string) => store._act({ kind: 'cancel', insurerId }),
    complete: (insurerId: string, answers: CanonicalData) =>
      store._act({ kind: 'complete', insurerId, answers }),
    saveManualOffer: (insurerId: string, submission: ManualOfferSubmission) =>
      store._act({ kind: 'manual', insurerId, submission }),
    /** Tarif lu par l'extension, vérifié par le courtier : il entre dans le comparatif. */
    validateOffer: (insurerId: string) => store._act({ kind: 'validate', insurerId }),
  })),
  withHooks({
    onInit: (store) => {
      const dossierStore = inject(DossierStore);
      const authStore = inject(AuthStore);
      store._listen(
        computed(() => ({ id: dossierStore.selectedId(), cabinetId: authStore.cabinetId() }), {
          equal: (a, b) => a.id === b.id && a.cabinetId === b.cabinetId,
        }),
      );
    },
  }),
);
