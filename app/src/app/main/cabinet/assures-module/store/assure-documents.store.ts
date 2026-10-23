import { computed, inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { AssureDocument } from '@shared';
import { catchError, EMPTY, mergeMap, of, pipe, switchMap, tap } from 'rxjs';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { AssuresService } from '../services/assures.service';
import { AssuresStore } from './assures.store';

/** Pièces rangées avec le client affiché (CIN, Kbis importés à sa création) : fourni par l'espace client. */
export const AssureDocumentsStore = signalStore(
  withState({ documents: [] as AssureDocument[] }),
  withMethods((store, service = inject(AssuresService)) => ({
    /** Ouvre la pièce dans un nouvel onglet (lien de téléchargement temporaire). */
    open: rxMethod<AssureDocument>(
      pipe(
        mergeMap((document) =>
          service.downloadUrl(document.storagePath).pipe(
            tap((url) => window.open(url, '_blank', 'noopener')),
            catchError(() => EMPTY),
          ),
        ),
      ),
    ),
    _listen: rxMethod<{ cabinetId: string | null; assureId: string | null }>(
      pipe(
        switchMap(({ cabinetId, assureId }) =>
          cabinetId && assureId ? service.watchDocuments(cabinetId, assureId).pipe(catchError(() => of([] as AssureDocument[]))) : of([] as AssureDocument[]),
        ),
        tap((documents) => patchState(store, { documents })),
      ),
    ),
  })),
  withHooks((store, auth = inject(AuthStore), assures = inject(AssuresStore)) => ({
    onInit: () =>
      store._listen(
        computed(() => ({ cabinetId: auth.cabinetId(), assureId: assures.selectedId() }), {
          equal: (a, b) => a.cabinetId === b.cabinetId && a.assureId === b.assureId,
        }),
      ),
  })),
);
