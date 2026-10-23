import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { isAnalyzableDocumentType, OcrField } from '@shared';
import { catchError, concatMap, EMPTY, exhaustMap, finalize, from, map, of, pipe, switchMap, take, tap } from 'rxjs';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { DOSSIERS_STRUCTURE } from '../components/dossiers.structure';
import { DocumentsService } from '../services/documents.service';
import { boundedSectionIndex, clientPieceAnswers } from '../util/draft.utils';
import { DossierStore } from './dossier.store';

/** Reprise des pièces du client dans un brouillon (fournie par la page du brouillon). */
export const ClientPiecesStore = signalStore(
  /** `reading` : pièces en cours de lecture, un écran couvre le formulaire jusqu'au remplissage. */
  withState({ reading: false }),
  withMethods(
    (store, documents = inject(DocumentsService), dossier = inject(DossierStore), auth = inject(AuthStore), snackBar = inject(MatSnackBar)) => ({
      /**
       * Reprend les pièces du client (une seule fois chacune, côté serveur), lit celles qui ne l'ont pas encore été, puis
       * écrit les valeurs sûres dans les champs encore vides. Une lecture coupée (page rechargée) reprend à l'ouverture
       * suivante. Rien à lire : rien n'est réappliqué (un champ vidé reste vide).
       */
      take: rxMethod<string>(
        pipe(
          exhaustMap((dossierId) => {
            const cabinetId = auth.cabinetId();
            if (!cabinetId) return EMPTY;
            const fields: OcrField[] = [];
            // Écran de lecture affiché tout de suite, sans attendre la reprise des pièces côté serveur.
            patchState(store, { reading: true });
            return documents.takeClientPieces(dossierId).pipe(
              switchMap(() => documents.watchDocuments(cabinetId, dossierId).pipe(take(1))),
              map((all) => all.filter((document) => !!document.sourceAssureDocumentId && isAnalyzableDocumentType(document.type))),
              switchMap((pieces) => {
                const toRead = pieces.filter((document) => document.status === 'uploaded');
                if (!toRead.length) return EMPTY;
                for (const document of pieces) if (document.status === 'analyzed') fields.push(...document.ocrFields);
                return from(toRead).pipe(
                  concatMap((document) =>
                    documents.analyze(dossierId, document.id).pipe(
                      tap(({ status, ocrFields }) => {
                        if (status === 'analyzed') fields.push(...ocrFields);
                      }),
                      catchError(() => of(null)),
                    ),
                  ),
                );
              }),
              catchError(() => EMPTY),
              finalize(() => {
                patchState(store, { reading: false });
                if (dossier.selectedId() !== dossierId || !fields.length) return;
                const toFill = clientPieceAnswers(fields, dossier.answers());
                if (!toFill.length) return;
                for (const field of toFill) dossier.edit(field.canonicalPath, field.value);
                dossier.saveNow({ event: true, sectionIndex: boundedSectionIndex(dossier.sectionIndex(), dossier.schema().length) });
                snackBar.open(`${toFill.length} ${DOSSIERS_STRUCTURE.draft.clientPiecesApplied}`, undefined, { duration: 6000 });
              }),
            );
          }),
        ),
      ),
    }),
  ),
);
