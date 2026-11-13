import { computed, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withHooks, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, merge, Observable, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { DossiersService } from '../../services/dossiers.service';
import { DossierStoreState } from './dossier.state';

/**
 * Lecture en temps réel du dossier sélectionné et de ses référentiels (produits, assureurs, membres, client).
 * Les écritures du serveur (OCR, collègue) sont appliquées aux réponses, sauf sur les champs en cours de saisie.
 */
export function withDossierSync() {
  return signalStoreFeature(
    { state: type<DossierStoreState>() },
    withMethods((store, service = inject(DossiersService), authStore = inject(AuthStore)) => ({
      _listenAssure: rxMethod<string | null>(
        pipe(
          switchMap((assureId) => {
            const cabinet = authStore.cabinetId();
            return assureId && cabinet
              ? service.watchAssure(cabinet, assureId).pipe(
                  tap((assure) => patchState(store, { assure })),
                  catchError((error) => {
                    patchState(store, { error: toBackendErrorMessage(error) });
                    return EMPTY;
                  }),
                )
              : EMPTY;
          }),
        ),
      ),
      _listen: rxMethod<{ cabinet: string | null; id: string | null }>(
        pipe(
          switchMap(({ cabinet, id }) => {
            if (!id || !cabinet) {
              return EMPTY;
            }
            // Chaque écoute a sa propre gestion d'erreur : un refus (droits, réseau) n'arrête pas les autres.
            const guard = <T>(source: Observable<T>) =>
              source.pipe(
                catchError((error) => {
                  patchState(store, { error: toBackendErrorMessage(error), loaded: true });
                  return EMPTY;
                }),
              );
            return merge(
              guard(
                service.watchDossier(cabinet, id).pipe(
                  tap((dossier) => {
                    patchState(store, { dossier, loaded: true });
                    if (!dossier) {
                      return;
                    }
                    if (store.answersFor() !== id) {
                      // Première lecture : les réponses locales partent du dossier, et la section de reprise est restaurée.
                      patchState(store, {
                        answers: dossier.data ?? {},
                        answersFor: id,
                        sectionIndex: dossier.draft?.sectionIndex ?? 0,
                      });
                    } else {
                      // Écritures du serveur (OCR, collègue) : appliquées, sauf sur les champs en cours de saisie.
                      const pending = store.pending();
                      const server = Object.fromEntries(Object.entries(dossier.data ?? {}).filter(([path]) => !(path in pending)));
                      patchState(store, { answers: { ...store.answers(), ...server } });
                    }
                  }),
                ),
              ),
              guard(service.watchProducts(cabinet).pipe(tap((products) => patchState(store, { products })))),
              guard(service.watchInsurers(cabinet).pipe(tap((insurers) => patchState(store, { insurers })))),
              guard(service.watchMembers(cabinet).pipe(tap((members) => patchState(store, { members })))),
            );
          }),
        ),
      ),
    })),
    withHooks((store) => {
      const authStore = inject(AuthStore);
      return {
        onInit: () => {
          store._listen(
            computed(() => ({ cabinet: authStore.cabinetId(), id: store.selectedId() }), {
              equal: (a, b) => a.cabinet === b.cabinet && a.id === b.id,
            }),
          );
          store._listenAssure(computed(() => store.dossier()?.assureId ?? null));
        },
      };
    }),
  );
}
