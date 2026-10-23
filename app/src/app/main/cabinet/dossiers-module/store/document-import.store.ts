import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
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
import { catchError, concatMap, exhaustMap, finalize, from, map, Observable, of, pipe, switchMap, tap, toArray } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { DOCUMENT_IMPORT_STRUCTURE } from '../components/document-import/document-import.structure';
import { DocumentsService } from '../services/documents.service';
import { defaultOcrSelection, mergeOcrFields, selectedOcrAnswers } from '../util/documents.utils';
import { DossierStore } from './dossier.store';

/** Type choisi à l'import : « auto » laisse l'IA reconnaître le type de chaque fichier. */
export type PickedType = DossierDocumentType | 'auto';

export interface PickedFile {
  id: number;
  file: File;
  type: PickedType;
}

export interface OcrProposal {
  documentId: string;
  fields: OcrField[];
}

export const willAnalyze = (type: PickedType): boolean => type === 'auto' || isAnalyzableDocumentType(type);

interface DocumentImportState {
  documents: DossierDocument[];
  /** Type du menu, appliqué aux fichiers choisis ensuite. */
  type: PickedType;
  /** Fichiers choisis, chacun avec son type (pré-rempli avec le type du menu au moment du choix). */
  files: PickedFile[];
  nextFileId: number;
  busy: 'upload' | 'analyze' | null;
  /** Import de plusieurs fichiers : position dans la file (affichée « 2/5 »). */
  progress: { done: number; total: number } | null;
  error: string | null;
  message: string | null;
  proposal: OcrProposal | null;
  selection: Partial<Record<CanonicalPath, boolean>>;
}

/** Résultat de l'import d'un fichier : en échec, lu par l'IA (valeurs proposées) ou seulement rangé. */
type FileOutcome = { failed: string } | { documentId: string; fields: OcrField[] } | null;

const text = DOCUMENT_IMPORT_STRUCTURE;

/**
 * Documents d'un dossier (E12), fourni par la carte « Documents » : liste, import (Storage, documents-enregistrer, puis
 * documents-analyser) et valeurs lues proposées champ par champ, écrites seulement sur « Appliquer ».
 */
export const DocumentImportStore = signalStore(
  withState<DocumentImportState>({
    documents: [],
    type: 'auto',
    files: [],
    nextFileId: 0,
    busy: null,
    progress: null,
    error: null,
    message: null,
    proposal: null,
    selection: {},
  }),
  withComputed((store, auth = inject(AuthStore), dossier = inject(DossierStore)) => ({
    anyAnalyzable: computed(() => store.files().some((picked) => willAnalyze(picked.type))),
    selectedCount: computed(() => Object.keys(selectedOcrAnswers(store.proposal()?.fields ?? [], store.selection())).length),
    _key: computed(
      () => {
        const cabinetId = auth.cabinetId();
        const dossierId = dossier.selectedId();
        return cabinetId && dossierId ? { cabinetId, dossierId } : null;
      },
      { equal: (a, b) => a?.cabinetId === b?.cabinetId && a?.dossierId === b?.dossierId },
    ),
  })),
  withMethods((store, service = inject(DocumentsService), dossier = inject(DossierStore)) => {
    const propose = (documentId: string, fields: OcrField[]) => patchState(store, { proposal: { documentId, fields }, selection: defaultOcrSelection(fields) });
    const removeFile = (id: number) => patchState(store, { files: store.files().filter((picked) => picked.id !== id) });

    /** Un fichier : Storage (nom sûr et unique), enregistrement par le serveur, puis lecture par l'IA si le type s'y prête. */
    const importOne = (picked: PickedFile, key: { cabinetId: string; dossierId: string }): Observable<FileOutcome> => {
      // Type inconnu tant que l'IA ne l'a pas reconnu : enregistré comme « autre », corrigé par la lecture.
      const registeredType: DossierDocumentType = picked.type === 'auto' ? 'autre' : picked.type;
      const storagePath = `${dossierDocumentsFolder(key.cabinetId, key.dossierId)}/${registeredType}-${Date.now()}-${safeDocumentFileName(picked.file.name)}`;
      return service.upload(storagePath, picked.file).pipe(
        switchMap(() => service.register(key.dossierId, registeredType, storagePath, picked.file.name)),
        tap(() => removeFile(picked.id)),
        switchMap(({ documentId }): Observable<FileOutcome> => {
          if (!willAnalyze(picked.type)) return of(null);
          patchState(store, { busy: 'analyze' });
          return service
            .analyze(key.dossierId, documentId, picked.type === 'auto')
            .pipe(map(({ status, ocrFields }) => (status === 'failed' ? { failed: picked.file.name } : { documentId, fields: ocrFields })));
        }),
        catchError(() => of({ failed: picked.file.name })),
      );
    };

    const downloadTo = rxMethod<{ document: DossierDocument; target: Window | null }>(
      pipe(
        concatMap(({ document, target }) =>
          service.downloadUrl(document.storagePath).pipe(
            tapResponse({
              next: (url) => {
                if (target) target.location.href = url;
                else window.open(url, '_blank', 'noopener');
              },
              error: (error) => {
                target?.close();
                patchState(store, { error: toBackendErrorMessage(error) });
              },
            }),
          ),
        ),
      ),
    );

    return {
      setType: (type: PickedType) => patchState(store, { type }),
      setFileType: (id: number, type: PickedType) =>
        patchState(store, { files: store.files().map((picked) => (picked.id === id ? { ...picked, type } : picked)) }),
      removeFile,

      /** Ajoute les fichiers choisis à la liste ; les fichiers refusés (format, taille) sont écartés avec un message. */
      pickFiles: (list: FileList | null) => {
        const picked = Array.from(list ?? []);
        const accepted = picked.filter((file) => DOSSIER_DOCUMENT_MIME_TYPES.includes(file.type) && file.size <= DOSSIER_DOCUMENT_MAX_BYTES);
        const first = store.nextFileId();
        patchState(store, {
          message: null,
          error: accepted.length < picked.length ? text.badFile : null,
          files: [...store.files(), ...accepted.map((file, index) => ({ id: first + index, file, type: store.type() }))],
          nextFileId: first + accepted.length,
        });
      },

      /**
       * Envoie les fichiers l'un après l'autre. Les valeurs lues sont regroupées en une seule proposition. Un fichier en
       * échec n'arrête pas les suivants ; il reste dans la liste pour réessayer.
       */
      importFiles: rxMethod<void>(
        pipe(
          exhaustMap(() => {
            const queue = store.files();
            const key = store._key();
            if (!queue.length || !key) return of(null);
            patchState(store, { error: null, message: null, proposal: null });
            return from(queue).pipe(
              concatMap((picked, index) => {
                patchState(store, { progress: queue.length > 1 ? { done: index, total: queue.length } : null, busy: 'upload' });
                return importOne(picked, key);
              }),
              toArray(),
              tap((outcomes) => {
                const failed = outcomes.flatMap((outcome) => (outcome && 'failed' in outcome ? [outcome.failed] : []));
                const analyzed = outcomes.flatMap((outcome) => (outcome && 'documentId' in outcome ? [outcome] : []));
                if (failed.length) patchState(store, { error: `${text.someFailed} ${failed.join(', ')}` });
                const last = analyzed.at(-1);
                if (last) propose(last.documentId, mergeOcrFields(analyzed.flatMap((outcome) => outcome.fields)));
              }),
              finalize(() => patchState(store, { busy: null, progress: null })),
            );
          }),
        ),
      ),

      /** Relance la lecture par l'IA d'un document déjà rangé. */
      analyze: rxMethod<string>(
        pipe(
          exhaustMap((documentId) => {
            const dossierId = dossier.selectedId();
            if (!dossierId) return of(null);
            patchState(store, { error: null, message: null, busy: 'analyze' });
            return service.analyze(dossierId, documentId).pipe(
              tapResponse({
                next: ({ status, ocrFields }) => (status === 'failed' ? patchState(store, { error: text.failed }) : propose(documentId, ocrFields)),
                error: (error) => patchState(store, { error: toBackendErrorMessage(error) }),
              }),
              finalize(() => patchState(store, { busy: null })),
            );
          }),
        ),
      ),

      /** Revoit les valeurs déjà lues d'un document. */
      review: (document: DossierDocument) => {
        patchState(store, { message: null });
        propose(document.id, document.ocrFields ?? []);
      },
      closeProposal: () => patchState(store, { proposal: null }),
      toggle: (path: CanonicalPath, checked: boolean) => patchState(store, { selection: { ...store.selection(), [path]: checked } }),

      /** Seules les valeurs cochées sont écrites, par la sauvegarde habituelle du dossier (dossiers-sauvegarder). */
      apply: () => {
        const answers = selectedOcrAnswers(store.proposal()?.fields ?? [], store.selection());
        for (const [path, value] of Object.entries(answers)) dossier.edit(path as CanonicalPath, value);
        dossier.saveNow({ event: true });
        patchState(store, { proposal: null, message: text.applied });
      },

      /** Télécharge un document. À appeler dans le clic : la fenêtre doit s'ouvrir tout de suite, sinon le navigateur la bloque. */
      download: (document: DossierDocument) => {
        const target = window.open('', '_blank');
        // Coupe le lien vers l'application (équivalent de noopener, qui empêcherait de piloter l'onglet).
        if (target) target.opener = null;
        downloadTo({ document, target });
      },

      /** Documents du dossier, du plus récent au plus ancien (devis des offres saisies à la main compris). */
      _listen: rxMethod<{ cabinetId: string; dossierId: string } | null>(
        pipe(
          switchMap((key) => (key ? service.watchDocuments(key.cabinetId, key.dossierId) : of([] as DossierDocument[]))),
          tap((documents) => patchState(store, { documents: [...documents].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)) })),
        ),
      ),
    };
  }),
  withHooks({ onInit: (store) => store._listen(store._key) }),
);
