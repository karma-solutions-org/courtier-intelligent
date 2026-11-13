import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  CanonicalPath,
  DOSSIER_DOCUMENT_MAX_BYTES,
  DOSSIER_DOCUMENT_MIME_TYPES,
  DossierDocument,
  DossierDocumentType,
  dossierDocumentsFolder,
  isAnalyzableDocumentType,
  OcrField,
  safeDocumentFileName,
} from '@shared';
import { catchError, concatMap, defer, EMPTY, exhaustMap, finalize, from, map, of, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { DOCUMENT_IMPORT_STRUCTURE } from '../components/document-import/document-import.structure';
import { DocumentImportBusy, OcrProposal, PickedDocumentFile } from '../models/document-import.model';
import { DocumentsService } from '../services/documents.service';
import { defaultOcrSelection, mergeOcrFields, selectedOcrAnswers } from '../util/documents.utils';
import { DossierStore } from './dossier.store';

interface DocumentImportState {
  /** Type proposé pour les prochains fichiers choisis. */
  type: DossierDocumentType;
  /** Fichiers choisis, chacun avec son type (pré-rempli avec le type du menu au moment du choix). */
  files: PickedDocumentFile[];
  busy: DocumentImportBusy;
  /** Import de plusieurs fichiers : position dans la file (affichée « 2/5 »). */
  progress: { done: number; total: number } | null;
  error: string | null;
  message: string | null;
  proposal: OcrProposal | null;
  selection: Partial<Record<CanonicalPath, boolean>>;
  /** Documents du dossier, du plus récent au plus ancien (devis des offres saisies à la main compris). */
  documents: DossierDocument[];
}

const TEXT = DOCUMENT_IMPORT_STRUCTURE;

/**
 * Documents d'un dossier (fourni par le composant) : le document est envoyé dans Storage, enregistré
 * (documents-enregistrer) puis lu par l'IA (documents-analyser) ; les valeurs lues sont proposées champ par champ et ne
 * sont écrites qu'au clic sur « Appliquer », via la sauvegarde du dossier (dossiers-sauvegarder).
 */
export const DocumentImportStore = signalStore(
  withState<DocumentImportState>({
    type: 'carte_grise',
    files: [],
    busy: null,
    progress: null,
    error: null,
    message: null,
    proposal: null,
    selection: {},
    documents: [],
  }),
  withComputed(({ files, proposal, selection }, authStore = inject(AuthStore), dossierStore = inject(DossierStore)) => ({
    anyAnalyzable: computed(() => files().some((picked) => isAnalyzableDocumentType(picked.type))),
    selectedCount: computed(() => Object.keys(selectedOcrAnswers(proposal()?.fields ?? [], selection())).length),
    /** Cabinet et dossier ouverts : null tant que l'un manque. */
    _key: computed(() => {
      const cabinetId = authStore.cabinetId();
      const dossierId = dossierStore.selectedId();
      return cabinetId && dossierId ? { cabinetId, dossierId } : null;
    }),
  })),
  withMethods((store, service = inject(DocumentsService), dossierStore = inject(DossierStore)) => {
    let nextFileId = 0;
    const removeFile = (id: number) => patchState(store, { files: store.files().filter((picked) => picked.id !== id) });
    const propose = (documentId: string, fields: OcrField[]) =>
      patchState(store, { proposal: { documentId, fields }, selection: defaultOcrSelection(fields) });

    return {
      setType: (type: DossierDocumentType) => patchState(store, { type }),
      setFileType: (id: number, type: DossierDocumentType) =>
        patchState(store, { files: store.files().map((picked) => (picked.id === id ? { ...picked, type } : picked)) }),
      removeFile,
      dismissProposal: () => patchState(store, { proposal: null }),
      toggle: (path: CanonicalPath, checked: boolean) => patchState(store, { selection: { ...store.selection(), [path]: checked } }),

      /** Ajoute les fichiers choisis à la liste ; les fichiers refusés (format, taille) sont écartés avec un message. */
      pickFiles: (list: FileList | null) => {
        const picked = Array.from(list ?? []);
        const accepted = picked.filter((file) => DOSSIER_DOCUMENT_MIME_TYPES.includes(file.type) && file.size <= DOSSIER_DOCUMENT_MAX_BYTES);
        const type = store.type();
        patchState(store, {
          message: null,
          error: accepted.length < picked.length ? TEXT.badFile : null,
          files: [...store.files(), ...accepted.map((file) => ({ id: nextFileId++, file, type }))],
        });
      },

      /**
       * Envoie les fichiers l'un après l'autre : Storage (nom sûr et unique), enregistrement par le serveur, puis lecture
       * par l'IA si le type s'y prête. Les valeurs lues sont regroupées en une seule proposition. Un fichier en échec
       * n'arrête pas les suivants ; il reste dans la liste pour réessayer.
       */
      importFiles: rxMethod<void>(
        pipe(
          exhaustMap(() =>
            defer(() => {
              const queue = store.files();
              const key = store._key();
              if (!queue.length || !key) return EMPTY;
              patchState(store, { error: null, message: null, proposal: null });
              const fields: OcrField[] = [];
              const failed: string[] = [];
              let lastDocumentId: string | null = null;
              let analyzed = 0;
              return from(queue).pipe(
                concatMap((picked, index) => {
                  patchState(store, { progress: queue.length > 1 ? { done: index, total: queue.length } : null, busy: 'upload' });
                  const storagePath = `${dossierDocumentsFolder(key.cabinetId, key.dossierId)}/${picked.type}-${Date.now()}-${safeDocumentFileName(picked.file.name)}`;
                  return service.upload(storagePath, picked.file).pipe(
                    switchMap(() => service.register(key.dossierId, picked.type, storagePath, picked.file.name)),
                    tap(() => removeFile(picked.id)),
                    switchMap(({ documentId }) => {
                      if (!isAnalyzableDocumentType(picked.type)) return of(null);
                      patchState(store, { busy: 'analyze' });
                      return service.analyze(key.dossierId, documentId).pipe(
                        tap(({ status, ocrFields }) => {
                          if (status === 'failed') {
                            failed.push(picked.file.name);
                            return;
                          }
                          analyzed++;
                          lastDocumentId = documentId;
                          fields.push(...ocrFields);
                        }),
                      );
                    }),
                    catchError(() => {
                      failed.push(picked.file.name);
                      return of(null);
                    }),
                  );
                }),
                finalize(() => patchState(store, { busy: null, progress: null })),
                tap({
                  complete: () => {
                    if (failed.length) patchState(store, { error: `${TEXT.someFailed} ${failed.join(', ')}` });
                    if (analyzed && lastDocumentId) propose(lastDocumentId, mergeOcrFields(fields));
                  },
                }),
              );
            }),
          ),
        ),
      ),

      /** Relance la lecture d'un document déjà enregistré. */
      analyze: rxMethod<string>(
        pipe(
          exhaustMap((documentId) =>
            defer(() => {
              const dossierId = dossierStore.selectedId();
              if (!dossierId) return EMPTY;
              patchState(store, { error: null, message: null, busy: 'analyze' });
              return service.analyze(dossierId, documentId).pipe(
                tap(({ status, ocrFields }) => {
                  if (status === 'failed') {
                    patchState(store, { error: TEXT.failed });
                    return;
                  }
                  propose(documentId, ocrFields);
                }),
                catchError((error) => {
                  patchState(store, { error: toBackendErrorMessage(error) });
                  return EMPTY;
                }),
                finalize(() => patchState(store, { busy: null })),
              );
            }),
          ),
        ),
      ),

      /** Revoit les valeurs déjà lues sur un document. */
      review: (document: DossierDocument) => {
        patchState(store, { message: null });
        propose(document.id, document.ocrFields ?? []);
      },

      /** Seules les valeurs cochées sont écrites, par la sauvegarde habituelle du dossier (dossiers-sauvegarder). */
      apply: () => {
        const answers = selectedOcrAnswers(store.proposal()?.fields ?? [], store.selection());
        for (const [path, value] of Object.entries(answers)) {
          dossierStore.edit(path as CanonicalPath, value);
        }
        dossierStore.saveNow({ event: true });
        patchState(store, { proposal: null, message: TEXT.applied });
      },

      /**
       * Téléchargement : l'onglet est ouvert tout de suite (sinon bloqué par le navigateur, l'appel part du clic), puis
       * dirigé vers le lien de téléchargement.
       */
      download: rxMethod<DossierDocument>(
        pipe(
          map((document) => {
            const target = window.open('', '_blank');
            // Coupe le lien vers l'application (équivalent de noopener, qui empêcherait de piloter l'onglet).
            if (target) target.opener = null;
            return { document, target };
          }),
          concatMap(({ document, target }) =>
            service.downloadUrl(document.storagePath).pipe(
              tap((url) => {
                if (target) target.location.href = url;
                else window.open(url, '_blank', 'noopener');
              }),
              catchError((error) => {
                target?.close();
                patchState(store, { error: toBackendErrorMessage(error) });
                return EMPTY;
              }),
            ),
          ),
        ),
      ),

      _listenDocuments: rxMethod<{ cabinetId: string; dossierId: string } | null>(
        pipe(
          switchMap((key) => (key ? service.watchDocuments(key.cabinetId, key.dossierId) : of([]))),
          map((documents) => [...documents].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))),
          tap((documents) => patchState(store, { documents })),
        ),
      ),
    };
  }),
  withHooks({
    onInit: (store) => store._listenDocuments(store._key),
  }),
);
