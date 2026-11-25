import { effect, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withHooks, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { CanonicalPath, DossierStatus, NeedInput } from '@shared';
import { catchError, concatMap, defer, EMPTY, finalize, map, Observable, of, pipe, switchMap, tap } from 'rxjs';
import { setNotice } from '../../../../../core/store-features/with-notice';
import { toBackendErrorMessage, toBackendErrorReason } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { PRICING_TAB_STRUCTURE } from '../../components/pricing-tab/pricing-tab.structure';
import { AnswerPatch, DossiersService } from '../../services/dossiers.service';
import { DossierStoreState, EVENTS_PAGE_SIZE } from './dossier.state';

/** Délai sans frappe avant d'enregistrer le brouillon. */
const AUTOSAVE_DELAY_MS = 800;

/**
 * Assureurs ajoutés pendant la tarification : la liste complète des assureurs du dossier (les actuels et les nouveaux)
 * et les réponses aux questions que les nouveaux ajoutent au questionnaire figé. Envoyés en un seul enregistrement.
 */
export interface AddInsurersInput {
  insurerIds: string[];
  patch: AnswerPatch;
}

/** Message d'un refus de l'ajout d'assureurs (raisons métier du serveur), toujours en français. */
function addInsurersErrorMessage(error: unknown): string {
  const text = PRICING_TAB_STRUCTURE.addInsurer;
  switch (toBackendErrorReason(error)) {
    case 'pricing_remove':
      return text.removeRefused;
    case 'incomplete': {
      // Le serveur liste les réponses manquantes (« Renseignez : … ») : son message est plus précis.
      const message = ((error ?? {}) as { message?: unknown }).message;
      return typeof message === 'string' && message.trim() ? message : text.incomplete;
    }
    default:
      return toBackendErrorMessage(error);
  }
}

/** Écritures en file : exécutées l'une après l'autre, pour qu'un changement de statut voie toujours les dernières réponses. */
type OperationInput =
  | { kind: 'save'; event?: boolean; sectionIndex?: number; insurerIds?: string[]; verified?: CanonicalPath[]; patch?: AnswerPatch }
  | { kind: 'addInsurers'; input: AddInsurersInput }
  | { kind: 'status'; status: DossierStatus }
  | { kind: 'assign'; uid: string }
  | { kind: 'need'; need: NeedInput }
  | { kind: 'validateNeed' };

/** Le dossier (et son cabinet) est figé à la mise en file : une écriture ne part jamais vers un autre dossier. */
type Operation = OperationInput & { dossierId: string; cabinetId: string };

/**
 * Saisie et écritures du dossier : réponses locales, file d'écritures (une à la fois, toujours vers le dossier figé à la
 * mise en file), changement de dossier, statut, assignation, besoin, et sauvegarde automatique après la frappe.
 */
export function withDossierWrites() {
  return signalStoreFeature(
    { state: type<DossierStoreState>() },
    withMethods((store, service = inject(DossiersService)) => {
      /** Envoie les réponses en attente (rien à faire s'il n'y en a pas). Une erreur les remet en attente. */
      const persist = (
        dossierId: string,
        options: { event?: boolean; sectionIndex?: number; insurerIds?: string[]; verified?: CanonicalPath[] },
        snapshot?: AnswerPatch,
      ): Observable<boolean> =>
        defer(() => {
          // Réponses figées à la mise en file (changement de dossier), sinon celles du dossier encore sélectionné :
          // jamais celles d'un autre dossier.
          const current = store.selectedId() === dossierId;
          const patch = snapshot ?? (current ? store.pending() : {});
          const hasPatch = Object.keys(patch).length > 0;
          if (
            !hasPatch &&
            options.sectionIndex === undefined &&
            options.insurerIds === undefined &&
            options.verified === undefined
          ) {
            return of(true);
          }
          if (current) {
            patchState(store, { ...(snapshot ? {} : { pending: {} }), saveStatus: 'saving', error: null });
          }
          return service.save(dossierId, patch, options).pipe(
            tap(() => {
              if (store.selectedId() === dossierId) {
                patchState(store, { saveStatus: Object.keys(store.pending()).length ? 'dirty' : 'saved' });
              }
            }),
            map(() => true),
            catchError((error) => {
              // Le courtier a changé de dossier entre-temps : ne pas mêler ces réponses au nouveau dossier,
              // mais lui dire que les dernières réponses du dossier précédent n'ont pas été enregistrées.
              if (store.selectedId() === dossierId) {
                patchState(store, {
                  pending: { ...patch, ...store.pending() },
                  saveStatus: 'error',
                  error: toBackendErrorMessage(error),
                });
              } else {
                patchState(store, {
                  error: `Les dernières réponses du dossier précédent n'ont pas pu être enregistrées : ${toBackendErrorMessage(error)}`,
                });
              }
              return of(false);
            }),
          );
        });

      /** Une écriture de la file, avec son message de réussite ; une erreur s'affiche et la file continue. */
      const run = (operation: Operation): Observable<unknown> => {
        const onError = catchError((error) => {
          patchState(store, { error: toBackendErrorMessage(error) });
          return EMPTY;
        });
        switch (operation.kind) {
          case 'save':
            return persist(
              operation.dossierId,
              {
                ...(operation.event !== undefined ? { event: operation.event } : {}),
                ...(operation.sectionIndex !== undefined ? { sectionIndex: operation.sectionIndex } : {}),
                ...(operation.insurerIds !== undefined ? { insurerIds: operation.insurerIds } : {}),
                ...(operation.verified !== undefined ? { verified: operation.verified } : {}),
              },
              operation.patch,
            );
          case 'status':
            return persist(operation.dossierId, {}).pipe(
              switchMap((saved) =>
                saved
                  ? service.changeStatus(operation.dossierId, operation.status).pipe(
                      tap(() => patchState(store, { successMessage: 'Statut mis à jour.' })),
                      onError,
                    )
                  : EMPTY,
              ),
            );
          case 'addInsurers': {
            const { insurerIds, patch } = operation.input;
            // Les réponses en attente partent d'abord ; puis assureurs et réponses ajoutées en un seul appel.
            return persist(operation.dossierId, {}).pipe(
              switchMap((saved) =>
                saved
                  ? service.save(operation.dossierId, patch, { insurerIds }).pipe(
                      tap(() => {
                        if (store.selectedId() === operation.dossierId) {
                          patchState(store, {
                            selectedInsurers: insurerIds,
                            answers: { ...store.answers(), ...patch },
                          });
                        }
                        patchState(store, setNotice(PRICING_TAB_STRUCTURE.addInsurer.added, 5000));
                      }),
                      catchError((error) => {
                        patchState(store, setNotice(addInsurersErrorMessage(error), 8000));
                        return EMPTY;
                      }),
                    )
                  : EMPTY,
              ),
            );
          }
          case 'need':
            return persist(operation.dossierId, {}).pipe(
              switchMap((saved) =>
                saved
                  ? service.saveNeed(operation.dossierId, operation.need).pipe(
                      tap(({ changed }) =>
                        patchState(store, { successMessage: changed.length ? 'Couverture enregistrée.' : 'Aucune modification.' }),
                      ),
                      onError,
                    )
                  : EMPTY,
              ),
            );
          case 'validateNeed':
            return service.validateNeed(operation.dossierId).pipe(
              tap(() => patchState(store, { successMessage: 'Couverture validée.' })),
              onError,
            );
          case 'assign':
            return service.assign(operation.dossierId, operation.uid).pipe(
              tap(() => patchState(store, { successMessage: 'Dossier réassigné.' })),
              onError,
            );
        }
      };

      return {
        // Le store survit à la navigation (fourni par la route) : resélectionner le même dossier ne doit pas
        // vider l'état, car l'écoute Firestore déjà active ne réémettrait pas et la page resterait vide.
        _reset: (selectedId: string | null) =>
          patchState(store, {
            selectedId,
            dossier: null,
            loaded: false,
            events: [],
            eventsLimit: EVENTS_PAGE_SIZE,
            eventsHasMore: false,
            eventsLoadingMore: false,
            assure: null,
            selectedInsurers: [],
            answers: {},
            answersFor: null,
            pending: {},
            saveStatus: 'idle',
            error: null,
            confirmed: [],
          }),
        setAutosave: (autosave: boolean) => patchState(store, { autosave }),
        clearMessages: () => patchState(store, { error: null, successMessage: null }),
        /** Après affichage du snackbar : l'erreur éventuelle reste affichée. */
        clearSuccess: () => patchState(store, { successMessage: null }),

        /** Une réponse du questionnaire : affichée aussitôt, enregistrée après un court délai. */
        edit: (path: CanonicalPath, value: AnswerPatch[CanonicalPath]) =>
          patchState(store, {
            answers: { ...store.answers(), [path]: value },
            pending: { ...store.pending(), [path]: value },
            editTick: store.editTick() + 1,
            saveStatus: 'dirty',
          }),

        /** Toutes les écritures passent par cette file, une à la fois. */
        _run: rxMethod<Operation>(
          pipe(
            concatMap((operation) =>
              run(operation).pipe(
                finalize(() => {
                  if (operation.kind === 'need' || operation.kind === 'validateNeed') {
                    patchState(store, { needPending: Math.max(0, store.needPending() - 1) });
                  }
                  if (operation.kind === 'addInsurers') {
                    patchState(store, { addingInsurers: false });
                  }
                }),
              ),
            ),
          ),
        ),
      };
    }),
    withMethods((store, authStore = inject(AuthStore)) => {
      /** Met l'écriture en file pour le dossier sélectionné ; rien sans dossier ni cabinet. */
      const enqueue = (operation: OperationInput) => {
        const dossierId = store.selectedId();
        const cabinetId = authStore.cabinetId();
        if (dossierId && cabinetId) {
          if (operation.kind === 'need' || operation.kind === 'validateNeed') {
            patchState(store, { needPending: store.needPending() + 1 });
          }
          store._run({ ...operation, dossierId, cabinetId });
        }
      };
      return {
        /**
         * Change de dossier. Les réponses pas encore envoyées partent d'abord vers l'ancien dossier (figées dans l'opération),
         * puis l'état est vidé. Resélectionner le même dossier ne fait rien : l'écoute active ne réémettrait pas.
         */
        select: (selectedId: string | null) => {
          const previous = store.selectedId();
          if (selectedId === previous) {
            return;
          }
          const pending = store.pending();
          const cabinetId = authStore.cabinetId();
          if (previous && cabinetId && Object.keys(pending).length) {
            store._run({ kind: 'save', patch: pending, dossierId: previous, cabinetId });
          }
          store._reset(selectedId);
        },
        /** Enregistre tout de suite (bouton Enregistrer, changement de section, avant de quitter). */
        saveNow: (options: { event?: boolean; sectionIndex?: number } = {}) => enqueue({ kind: 'save', ...options }),
        changeStatus: (status: DossierStatus) => enqueue({ kind: 'status', status }),
        assign: (uid: string) => enqueue({ kind: 'assign', uid }),
        saveNeed: (need: NeedInput) => enqueue({ kind: 'need', need }),
        validateNeed: () => enqueue({ kind: 'validateNeed' }),
        /** Extranets retenus pour le dossier : le questionnaire ne pose que leurs questions, la tarification ne montre qu'eux. */
        selectInsurers: (selectedInsurers: string[]) => {
          patchState(store, { selectedInsurers });
          enqueue({ kind: 'save', insurerIds: selectedInsurers });
        },
        /**
         * Pendant la tarification : ajoute des assureurs au dossier, avec les réponses aux questions qu'ils ajoutent au
         * questionnaire figé, en un seul enregistrement (le serveur refuse un retrait ou une réponse obligatoire manquante).
         */
        addInsurers: (input: AddInsurersInput) => {
          if (!store.selectedId() || !authStore.cabinetId()) return;
          patchState(store, { addingInsurers: true });
          enqueue({ kind: 'addInsurers', input });
        },
        /** Réponse reprise d'un dossier précédent confirmée telle quelle : elle n'est plus « à vérifier ». */
        confirmVerified: (path: CanonicalPath) => {
          patchState(store, { confirmed: [...store.confirmed(), path] });
          enqueue({ kind: 'save', verified: [path] });
        },
        /** Passe à une section et mémorise où le courtier s'est arrêté. */
        goToSection: (sectionIndex: number) => {
          patchState(store, { sectionIndex });
          enqueue({ kind: 'save', sectionIndex });
        },
        /** Des modifications ne sont pas enregistrées (en attente ou en échec). */
        hasPendingEdits: () => store.saveStatus() === 'dirty' || store.saveStatus() === 'error',
      };
    }),
    withHooks((store) => ({
      onInit: () => {
        // Sauvegarde automatique : enregistre le brouillon quand la frappe s'arrête.
        effect((onCleanup) => {
          const tick = store.editTick();
          if (!tick || !store.autosave()) {
            return;
          }
          const timer = setTimeout(() => store.saveNow(), AUTOSAVE_DELAY_MS);
          onCleanup(() => clearTimeout(timer));
        });
      },
    })),
  );
}
