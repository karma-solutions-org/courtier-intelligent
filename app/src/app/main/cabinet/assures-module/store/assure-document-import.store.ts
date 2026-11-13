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
import { catchError, concatMap, defer, exhaustMap, finalize, from, map, mergeMap, Observable, of, pipe, switchMap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { ASSURES_STRUCTURE } from '../components/assures.structure';
import { PickedFile, ReadPiece } from '../models/assure-document-import.model';
import { AssuresService } from '../services/assures.service';

interface AssureDocumentImportState {
  files: PickedFile[];
  busy: boolean;
  error: string | null;
  done: string | null;
  /** Pièces sans information reconnue (verso, autre document…) : simple information, pas une erreur. */
  notice: string | null;
  /** Pièces lues, pas encore transmises au formulaire de création (voir `takeReadPieces`). */
  readPieces: ReadPiece[];
}

const TEXT = ASSURES_STRUCTURE.piece;

/**
 * « Pré-remplir depuis une pièce » (fourni par le composant) : envoi des fichiers dans le dépôt provisoire,
 * reconnaissance du type par l'IA, puis lecture de la CIN ou du Kbis pour pré-remplir le formulaire.
 */
export const AssureDocumentImportStore = signalStore(
  withState<AssureDocumentImportState>({ files: [], busy: false, error: null, done: null, notice: null, readPieces: [] }),
  withComputed(({ files }) => ({
    /** Toutes les pièces sont envoyées et ont un type (aucune en cours de reconnaissance ou en échec). */
    canImport: computed(() => files().length > 0 && files().every((picked) => picked.status === 'ready')),
  })),
  withMethods((store, service = inject(AssuresService), auth = inject(AuthStore)) => {
    let nextId = 0;
    const update = (id: number, patch: Partial<PickedFile>) =>
      patchState(store, { files: store.files().map((picked) => (picked.id === id ? { ...picked, ...patch } : picked)) });
    const remove = (id: number) => patchState(store, { files: store.files().filter((picked) => picked.id !== id) });

    return {
      setType: (id: number, type: AssureDocumentType) => update(id, { type }),
      remove,
      /** Pièces lues depuis le dernier appel : le container les transmet une par une au formulaire. */
      takeReadPieces: (): ReadPiece[] => {
        const pieces = store.readPieces();
        if (pieces.length) patchState(store, { readPieces: [] });
        return pieces;
      },

      /**
       * Ajoute les fichiers choisis et les envoie aussitôt dans le dépôt provisoire : l'IA reconnaît le type de chacun
       * (pré-sélectionné, à corriger si besoin). Non reconnu : « Autre ». Les fichiers refusés sont écartés.
       */
      pick: rxMethod<FileList | null>(
        pipe(
          map((list): PickedFile[] => {
            const cabinetId = auth.cabinetId();
            const uid = auth.user()?.uid;
            if (!cabinetId || !uid) return [];
            const picked = Array.from(list ?? []);
            const accepted = picked.filter((file) => ASSURE_DOCUMENT_MIME_TYPES.includes(file.type) && file.size <= ASSURE_DOCUMENT_MAX_BYTES);
            patchState(store, { error: accepted.length < picked.length ? TEXT.badFile : null });
            const added: PickedFile[] = accepted.map((file) => {
              const id = nextId++;
              return {
                id,
                file,
                type: 'autre',
                storagePath: `${assureImportsFolder(cabinetId, uid)}/${Date.now()}-${id}-${safeDocumentFileName(file.name)}`,
                status: 'recognizing',
              };
            });
            patchState(store, { files: [...store.files(), ...added] });
            return added;
          }),
          mergeMap((added) =>
            from(added).pipe(
              mergeMap(
                (picked) =>
                  service.uploadImport(picked.storagePath, picked.file).pipe(
                    switchMap(() =>
                      service.recognizePiece(picked.storagePath).pipe(
                        // IA indisponible ou quota atteint : le fichier est bien envoyé, le courtier choisit le type.
                        catchError(() => of({ type: null })),
                      ),
                    ),
                    map(({ type }) => update(picked.id, { type: type ?? 'autre', status: 'ready' })),
                    catchError(() => {
                      update(picked.id, { status: 'failed' });
                      return of(undefined);
                    }),
                  ),
                3,
              ),
            ),
          ),
        ),
      ),

      /**
       * Pièces déjà envoyées : la CIN et le Kbis sont lus pour pré-remplir le formulaire, l'un après l'autre. Chaque pièce
       * est transmise au formulaire, qui la range avec le client à sa création ; un fichier en échec reste dans la liste.
       */
      read: rxMethod<void>(
        pipe(
          exhaustMap(() =>
            defer(() => {
              const queue = store.files();
              if (!queue.length) return of(undefined);
              patchState(store, { done: null, notice: null, error: null, busy: true });
              const errors: string[] = [];
              const notRead: string[] = [];
              let filled = 0;
              let readCount = 0;
              let kept = 0;
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
                      patchState(store, { readPieces: [...store.readPieces(), { type, storagePath, fileName: file.name, values }] });
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
                  });
                  if (notRead.length) {
                    // Aucune pièce d'identité lisible : le formulaire est à remplir à la main ; sinon, simple information.
                    patchState(store, { notice: filled ? `${TEXT.notRead} ${notRead.join(', ')}` : readCount ? TEXT.unreadable : null });
                  }
                }),
              );
            }),
          ),
        ),
      ),
    };
  }),
);
