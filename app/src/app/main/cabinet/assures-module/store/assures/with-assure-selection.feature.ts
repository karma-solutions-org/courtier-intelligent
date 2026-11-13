import { computed, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withHooks, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { AssureDocument } from '@shared';
import { catchError, EMPTY, exhaustMap, of, pipe, switchMap, tap } from 'rxjs';
import { setError } from '../../../../../core/store-features/with-request-status';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { AssuresService } from '../../services/assures.service';
import { AssuresStoreState } from './assures.state';

/** Fiche ouverte : le client (lu à part, il peut être hors de la tranche chargée), ses dossiers et ses pièces. */
export function withAssureSelection() {
  return signalStoreFeature(
    { state: type<AssuresStoreState>() },
    withMethods((store, service = inject(AssuresService)) => ({
      // Même client : on garde ses dossiers. L'écoute Firestore reste ouverte et n'émettrait rien de nouveau,
      // la liste resterait vide jusqu'au rechargement de la page.
      select: (selectedId: string | null) => {
        if (selectedId !== store.selectedId()) patchState(store, { selectedId, selected: null, dossiers: [] });
      },
      /** Écoute les pièces du client (ou les vide sans client). */
      listenDocuments: rxMethod<{ cabinetId: string | null; assureId: string | null }>(
        pipe(
          switchMap(({ cabinetId, assureId }) =>
            cabinetId && assureId ? service.watchDocuments(cabinetId, assureId) : of([] as AssureDocument[]),
          ),
          tap((documents) => patchState(store, { documents })),
        ),
      ),
      /** Ouvre la pièce dans un nouvel onglet (lien de téléchargement signé). */
      openDocument: rxMethod<AssureDocument>(
        pipe(
          exhaustMap((document) =>
            service.downloadUrl(document.storagePath).pipe(
              tap((url) => window.open(url, '_blank', 'noopener')),
              catchError(() => EMPTY),
            ),
          ),
        ),
      ),
      _listenSelected: rxMethod<{ cabinetId: string | null; assureId: string | null }>(
        pipe(
          switchMap(({ cabinetId, assureId }) =>
            cabinetId && assureId
              ? service.watchAssure(cabinetId, assureId).pipe(
                  tap((assure) => patchState(store, { selected: assure && !assure.deletedAt ? assure : null })),
                  catchError((error) => {
                    patchState(store, setError(toBackendErrorMessage(error)));
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),
      _listenDossiers: rxMethod<{ cabinetId: string | null; assureId: string | null }>(
        pipe(
          switchMap(({ cabinetId: cabinet, assureId }) =>
            cabinet && assureId
              ? service.watchDossiersOf(cabinet, assureId).pipe(
                  tap((dossiers) => patchState(store, { dossiers })),
                  catchError((error) => {
                    patchState(store, setError(toBackendErrorMessage(error)));
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),
    })),
    withHooks((store) => {
      const authStore = inject(AuthStore);
      return {
        onInit: () => {
          const selection = computed(() => ({ cabinetId: authStore.cabinetId(), assureId: store.selectedId() }), {
            equal: (a, b) => a.cabinetId === b.cabinetId && a.assureId === b.assureId,
          });
          store._listenSelected(selection);
          store._listenDossiers(selection);
        },
      };
    }),
  );
}
