import { inject, Signal } from '@angular/core';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { CanonicalPath, isAnalyzableDocumentType, OcrField, QuestionnaireSection } from '@shared';
import { catchError, concatMap, EMPTY, finalize, from, map, of, pipe, switchMap, take, tap } from 'rxjs';
import { setNotice } from '../../../../../core/store-features/with-notice';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { DOSSIERS_STRUCTURE } from '../../components/dossiers.structure';
import { AnswerPatch } from '../../services/dossiers.service';
import { DocumentsService } from '../../services/documents.service';
import { mergeOcrFields, needsConfirmation } from '../../util/documents.utils';
import { DossierStoreState } from './dossier.state';

/** Messages de la reprise des pièces du client dans un brouillon. */
const CLIENT_PIECES_TEXT = {
  reading: DOSSIERS_STRUCTURE.draft.clientPiecesReading,
  applied: DOSSIERS_STRUCTURE.draft.clientPiecesApplied,
};

/** Pièces importées à la création du client (carte grise, permis…) : reprises dans le dossier, lues, rangées dans les champs vides. */
export function withClientPieces() {
  return signalStoreFeature(
    {
      state: type<DossierStoreState>(),
      props: type<{ schema: Signal<QuestionnaireSection[]> }>(),
      methods: type<{
        edit: (path: CanonicalPath, value: AnswerPatch[CanonicalPath]) => void;
        saveNow: (options?: { event?: boolean; sectionIndex?: number }) => void;
      }>(),
    },
    withMethods((store, documents = inject(DocumentsService), authStore = inject(AuthStore)) => ({
      /**
       * Reprend les pièces du client (une seule fois chacune, côté serveur), lit celles qui ne l'ont pas encore été, puis
       * écrit les valeurs sûres (confiance suffisante) dans les champs encore VIDES : rien de ce que le courtier a saisi
       * n'est écrasé. Une lecture coupée (page rechargée) reprend à l'ouverture suivante : les pièces non lues sont lues
       * et toutes les valeurs du client sont appliquées. Rien à lire : rien n'est réappliqué (un champ vidé reste vide).
       */
      takeClientPieces: rxMethod<string>(
        pipe(
          concatMap((dossierId) => {
            const cabinetId = authStore.cabinetId();
            if (!cabinetId) return EMPTY;
            const fields: OcrField[] = [];
            return documents.takeClientPieces(dossierId).pipe(
              switchMap(() => documents.watchDocuments(cabinetId, dossierId).pipe(take(1))),
              map((list) => list.filter((document) => !!document.sourceAssureDocumentId && isAnalyzableDocumentType(document.type))),
              switchMap((list) => {
                const toRead = list.filter((document) => document.status === 'uploaded');
                if (!toRead.length) return EMPTY;
                for (const document of list) if (document.status === 'analyzed') fields.push(...document.ocrFields);
                patchState(store, setNotice(CLIENT_PIECES_TEXT.reading, 4000));
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
                if (store.selectedId() !== dossierId || !fields.length) return;
                const answers = store.answers();
                const isEmpty = (path: CanonicalPath) => answers[path] === undefined || answers[path] === null || answers[path] === '';
                const toFill = mergeOcrFields(fields).filter((field) => !needsConfirmation(field) && isEmpty(field.canonicalPath));
                if (!toFill.length) return;
                for (const field of toFill) store.edit(field.canonicalPath, field.value);
                // Section affichée par le brouillon, bornée au questionnaire.
                const sectionIndex = Math.min(store.sectionIndex(), Math.max(0, store.schema().length - 1));
                store.saveNow({ event: true, sectionIndex });
                patchState(store, setNotice(`${toFill.length} ${CLIENT_PIECES_TEXT.applied}`, 6000));
              }),
            );
          }),
        ),
      ),
    })),
  );
}
