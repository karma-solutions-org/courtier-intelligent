import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  ASSURE_DOCUMENT_MAX_BYTES,
  ASSURE_DOCUMENT_MIME_TYPES,
  assureImportsFolder,
  AssureDocumentType,
  AssureOcrValues,
  isAssureReadableType,
  safeDocumentFileName,
} from '@shared';
import { catchError, concatMap, exhaustMap, finalize, from, map, mergeMap, Observable, of, pipe, switchMap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { ASSURES_STRUCTURE } from '../components/assures.structure';
import { AssuresService } from '../services/assures.service';

/** Pièce envoyée (et lue si c'est une CIN ou un Kbis), à ranger avec le client à sa création. */
export interface ReadPiece {
  type: AssureDocumentType;
  storagePath: string;
  fileName: string;
  values: AssureOcrValues;
}

export interface PickedFile {
  id: number;
  file: File;
  type: AssureDocumentType;
  /** Envoyé dès le choix, pour que l'IA reconnaisse son type. */
  storagePath: string;
  status: 'recognizing' | 'ready' | 'failed';
}

interface AssurePieceImportState {
  files: PickedFile[];
  busy: boolean;
  error: string | null;
  done: string | null;
  /** Pièces sans information reconnue (verso, autre document…) : simple information, pas une erreur. */
  notice: string | null;
  nextId: number;
}

const TEXT = ASSURES_STRUCTURE.piece;

/** Store de « Pré-remplir depuis une pièce » (fourni par le composant) : envoi, reconnaissance et lecture des pièces. */
export const AssurePieceImportStore = signalStore(
  withState<AssurePieceImportState>({ files: [], busy: false, error: null, done: null, notice: null, nextId: 0 }),
  withComputed(({ files }) => ({
    /** Toutes les pièces sont envoyées et ont un type (aucune en cours de reconnaissance ou en échec). */
    canImport: computed(() => files().length > 0 && files().every((picked) => picked.status === 'ready')),
  })),
  withMethods((store, service = inject(AssuresService), auth = inject(AuthStore)) => {
    const update = (id: number, change: Partial<PickedFile>) =>
      patchState(store, { files: store.files().map((picked) => (picked.id === id ? { ...picked, ...change } : picked)) });
    const remove = (id: number) => patchState(store, { files: store.files().filter((picked) => picked.id !== id) });

    return {
      setType: (id: number, type: AssureDocumentType) => update(id, { type }),
      remove,

      /**
       * Ajoute les fichiers choisis et les envoie aussitôt dans le dépôt provisoire : l'IA reconnaît le type de chacun
       * (pré-sélectionné, à corriger si besoin). Non reconnu : « Autre ». Les fichiers refusés sont écartés.
       */
      pick: rxMethod<File[]>(
        pipe(
          mergeMap((picked) => {
            const cabinetId = auth.cabinetId();
            const uid = auth.user()?.uid;
            if (!cabinetId || !uid) return of(undefined);
            const accepted = picked.filter((file) => ASSURE_DOCUMENT_MIME_TYPES.includes(file.type) && file.size <= ASSURE_DOCUMENT_MAX_BYTES);
            const firstId = store.nextId();
            const added: PickedFile[] = accepted.map((file, index) => {
              const id = firstId + index;
              return {
                id,
                file,
                type: 'autre',
                storagePath: `${assureImportsFolder(cabinetId, uid)}/${Date.now()}-${id}-${safeDocumentFileName(file.name)}`,
                status: 'recognizing',
              };
            });
            patchState(store, {
              files: [...store.files(), ...added],
              nextId: firstId + added.length,
              error: accepted.length < picked.length ? TEXT.badFile : null,
            });
            return from(added).pipe(
              mergeMap(
                (file) =>
                  service.uploadImport(file.storagePath, file.file).pipe(
                    switchMap(() =>
                      service.recognizePiece(file.storagePath).pipe(
                        // IA indisponible ou quota atteint : le fichier est bien envoyé, le courtier choisit le type (raison affichée).
                        catchError((error) => {
                          patchState(store, { error: toBackendErrorMessage(error) });
                          return of({ type: null });
                        }),
                      ),
                    ),
                    map(({ type }) => update(file.id, { type: type ?? 'autre', status: 'ready' })),
                    catchError(() => {
                      update(file.id, { status: 'failed' });
                      return of(undefined);
                    }),
                  ),
                3,
              ),
            );
          }),
        ),
      ),

      /**
       * Pièces déjà envoyées : la CIN et le Kbis sont lus pour pré-remplir le formulaire, l'un après l'autre. Chaque pièce
       * est transmise à `onPiece` (le conteneur la range avec le client à sa création) ; un fichier en échec reste dans la liste.
       */
      read: rxMethod<{ onPiece: (piece: ReadPiece) => void }>(
        pipe(
          exhaustMap(({ onPiece }) => {
            const queue = store.files();
            if (!queue.length) return of(undefined);
            const errors: string[] = [];
            const notRead: string[] = [];
            let filled = 0;
            let readCount = 0;
            let kept = 0;
            patchState(store, { busy: true, done: null, notice: null, error: null });
            return from(queue).pipe(
              concatMap(({ id, file, type, storagePath }) => {
                const values$: Observable<AssureOcrValues> = isAssureReadableType(type)
                  ? service.readPiece(type, storagePath).pipe(
                      map(({ values, readable }) => {
                        readCount++;
                        const count = Object.keys(values).length;
                        if (!readable || !count) notRead.push(file.name);
                        filled += count;
                        return values;
                      }),
                    )
                  : of({});
                return values$.pipe(
                  map((values) => {
                    kept++;
                    remove(id);
                    // Même illisible, la pièce est gardée : elle sera rangée avec le client.
                    onPiece({ type, storagePath, fileName: file.name, values });
                  }),
                  catchError((error) => {
                    errors.push(`${toBackendErrorMessage(error)} (${file.name})`);
                    return of(undefined);
                  }),
                );
              }),
              finalize(() => {
                const messages = [filled ? `${filled} ${TEXT.filled}` : null, kept ? `${kept} ${TEXT.kept}` : null];
                patchState(store, {
                  busy: false,
                  error: errors.length ? errors.join(' · ') : null,
                  done: messages.filter(Boolean).join(' ') || null,
                  // Aucune pièce d'identité lisible : le formulaire est à remplir à la main ; sinon, simple information.
                  ...(notRead.length
                    ? { notice: filled ? `${TEXT.notRead} ${notRead.join(', ')}` : readCount ? TEXT.unreadable : null }
                    : {}),
                });
              }),
            );
          }),
        ),
      ),
    };
  }),
);
