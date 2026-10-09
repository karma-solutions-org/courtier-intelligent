import { computed, effect, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  Assure,
  buildQuoteData,
  CanonicalData,
  CanonicalPath,
  computeMissing,
  Dossier,
  DossierEvent,
  DossierStatus,
  EDITABLE_DOSSIER_STATUSES,
  Insurer,
  Member,
  NeedAnalysis,
  NeedInput,
  Product,
  suggestNeed,
} from '@shared';
import { catchError, concatMap, defer, EMPTY, map, merge, Observable, of, pipe, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { AnswerPatch, DossiersService } from '../services/dossiers.service';
import { labelsByPath, manualTransitionsFrom } from '../util/dossiers.utils';

/** Délai sans frappe avant d'enregistrer le brouillon. */
const AUTOSAVE_DELAY_MS = 800;

/** idle : rien à enregistrer · dirty : modifications en attente · saving · saved · error. */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Écritures en file : exécutées l'une après l'autre, pour qu'un changement de statut voie toujours les dernières réponses. */
type Operation =
  | { kind: 'save'; event?: boolean; sectionIndex?: number }
  | { kind: 'status'; status: DossierStatus }
  | { kind: 'assign'; uid: string }
  | { kind: 'need'; need: NeedInput }
  | { kind: 'validateNeed' };

interface DossierState {
  selectedId: string | null;
  dossier: Dossier | null;
  /** Vrai dès la première réponse de Firestore. */
  loaded: boolean;
  events: DossierEvent[];
  members: Member[];
  products: Product[];
  /** Catalogue des assureurs (onglet Tarification, historique). */
  insurers: Insurer[];
  assure: Assure | null;
  /** Réponses affichées : copie locale du dossier, modifiée à la frappe (l'enregistrement suit). */
  answers: CanonicalData;
  /** Dossier dont les réponses locales ont été initialisées (les mises à jour du serveur n'écrasent pas la saisie). */
  answersFor: string | null;
  /** Modifications pas encore envoyées. */
  pending: AnswerPatch;
  editTick: number;
  /** Section du questionnaire affichée (reprise là où le courtier s'était arrêté). */
  sectionIndex: number;
  /** Sauvegarde automatique : active pendant la saisie du brouillon, désactivée sur l'onglet Infos (bouton Enregistrer). */
  autosave: boolean;
  saveStatus: SaveStatus;
  error: string | null;
  successMessage: string | null;
}

/** Store d'un dossier (fourni par la route) : données, questionnaire, saisie avec sauvegarde automatique, statut, assignation. */
export const DossierStore = signalStore(
  withState<DossierState>({
    selectedId: null,
    dossier: null,
    loaded: false,
    events: [],
    members: [],
    products: [],
    insurers: [],
    assure: null,
    answers: {},
    answersFor: null,
    pending: {},
    editTick: 0,
    sectionIndex: 0,
    autosave: true,
    saveStatus: 'idle',
    error: null,
    successMessage: null,
  }),
  withComputed(store => {
    const product = computed(() => store.products().find(p => p.id === store.dossier()?.productId) ?? null);
    const schema = computed(() => product()?.questionnaireSchema ?? []);
    const missing = computed<CanonicalPath[]>(() => computeMissing(schema(), store.answers()));
    return {
      product,
      schema,
      /** Champs obligatoires manquants, calculés à chaque frappe (le serveur refait le calcul à l'enregistrement). */
      missing,
      isComplete: computed(() => schema().length > 0 && missing().length === 0),
      labels: computed(() => labelsByPath(schema())),
      /** Référentiel des garanties du produit : base des garanties indispensables et souhaitées. */
      guarantees: computed(() => product()?.guaranteeCatalog ?? []),
      need: computed<NeedAnalysis | null>(() => store.dossier()?.needAnalysis ?? null),
      /** Le besoin s'analyse quand le dossier est complet, jusqu'à sa tarification. */
      needEditable: computed(() => ['complet', 'besoin_valide'].includes(store.dossier()?.status ?? '')),
      /** Suggestions de besoin selon les réponses du questionnaire (le courtier les accepte ou les modifie). */
      needSuggestion: computed(() =>
        suggestNeed(
          store.dossier()?.productId ?? '',
          store.answers(),
          (product()?.guaranteeCatalog ?? []).map(g => g.code),
        ),
      ),
      editable: computed(() => EDITABLE_DOSSIER_STATUSES.includes(store.dossier()?.status ?? 'sans_suite')),
      transitions: computed(() => {
        const status = store.dossier()?.status;
        return status ? manualTransitionsFrom(status) : [];
      }),
      /** Données envoyées à l'extension pour tarifer : `null` et niveaux de connaissance respectés. */
      quoteData: computed(() => buildQuoteData(schema(), store.answers())),
      memberNames: computed(() => new Map(store.members().map(m => [m.id, m.displayName || m.email || m.id]))),
      insurerNames: computed(() => new Map(store.insurers().map(i => [i.id, i.name]))),
      activeMembers: computed(() => store.members().filter(m => m.status === 'active')),
    };
  }),
  withMethods((store, service = inject(DossiersService), authStore = inject(AuthStore)) => {
    const cabinetId = () => authStore.cabinetId()!;

    /** Envoie les réponses en attente (rien à faire s'il n'y en a pas). Une erreur les remet en attente. */
    const persist = (options: { event?: boolean; sectionIndex?: number }): Observable<boolean> =>
      defer(() => {
        const patch = store.pending();
        const hasPatch = Object.keys(patch).length > 0;
        if (!hasPatch && options.sectionIndex === undefined) {
          return of(true);
        }
        patchState(store, { pending: {}, saveStatus: 'saving', error: null });
        return service.save(store.selectedId()!, patch, options).pipe(
          tap(() => patchState(store, { saveStatus: Object.keys(store.pending()).length ? 'dirty' : 'saved' })),
          map(() => true),
          catchError(error => {
            patchState(store, { pending: { ...patch, ...store.pending() }, saveStatus: 'error', error: toBackendErrorMessage(error) });
            return of(false);
          }),
        );
      });

    const run = (operation: Operation): Observable<unknown> => {
      switch (operation.kind) {
        case 'save':
          return persist({
            ...(operation.event !== undefined ? { event: operation.event } : {}),
            ...(operation.sectionIndex !== undefined ? { sectionIndex: operation.sectionIndex } : {}),
          });
        case 'status':
          return persist({}).pipe(
            switchMap(saved =>
              saved
                ? service.changeStatus(store.selectedId()!, operation.status).pipe(
                    tap(() => patchState(store, { successMessage: 'Statut mis à jour.' })),
                    catchError(error => {
                      patchState(store, { error: toBackendErrorMessage(error) });
                      return EMPTY;
                    }),
                  )
                : EMPTY,
            ),
          );
        case 'need':
          return persist({}).pipe(
            switchMap(saved =>
              saved
                ? service.saveNeed(store.selectedId()!, operation.need).pipe(
                    tap(({ changed }) => patchState(store, { successMessage: changed.length ? 'Besoin enregistré.' : 'Aucune modification.' })),
                    catchError(error => {
                      patchState(store, { error: toBackendErrorMessage(error) });
                      return EMPTY;
                    }),
                  )
                : EMPTY,
            ),
          );
        case 'validateNeed':
          return service.validateNeed(store.selectedId()!).pipe(
            tap(() => patchState(store, { successMessage: 'Besoin validé.' })),
            catchError(error => {
              patchState(store, { error: toBackendErrorMessage(error) });
              return EMPTY;
            }),
          );
        case 'assign':
          return service.assign(store.selectedId()!, operation.uid).pipe(
            tap(() => patchState(store, { successMessage: 'Dossier réassigné.' })),
            catchError(error => {
              patchState(store, { error: toBackendErrorMessage(error) });
              return EMPTY;
            }),
          );
      }
    };

    return {
      select: (selectedId: string | null) =>
        patchState(store, {
          selectedId,
          dossier: null,
          loaded: false,
          events: [],
          assure: null,
          answers: {},
          answersFor: null,
          pending: {},
          saveStatus: 'idle',
          error: null,
        }),
      setAutosave: (autosave: boolean) => patchState(store, { autosave }),
      clearMessages: () => patchState(store, { error: null, successMessage: null }),

      /** Une réponse du questionnaire : affichée aussitôt, enregistrée après un court délai. */
      edit: (path: CanonicalPath, value: AnswerPatch[CanonicalPath]) =>
        patchState(store, {
          answers: { ...store.answers(), [path]: value },
          pending: { ...store.pending(), [path]: value },
          editTick: store.editTick() + 1,
          saveStatus: 'dirty',
        }),

      /** Toutes les écritures passent par cette file, une à la fois. */
      _run: rxMethod<Operation>(pipe(concatMap(run))),

      _listenAssure: rxMethod<string | null>(
        pipe(
          switchMap(assureId => {
            const cabinet = authStore.cabinetId();
            return assureId && cabinet
              ? service.watchAssure(cabinet, assureId).pipe(tap(assure => patchState(store, { assure })))
              : EMPTY;
          }),
        ),
      ),
      _listen: rxMethod<string | null>(
        pipe(
          switchMap(id => {
            const cabinet = authStore.cabinetId();
            if (!id || !cabinet) {
              return EMPTY;
            }
            return merge(
              service.watchDossier(cabinet, id).pipe(
                tap(dossier => {
                  patchState(store, { dossier, loaded: true });
                  // Première lecture : les réponses locales partent du dossier, et la section de reprise est restaurée.
                  if (dossier && store.answersFor() !== id) {
                    patchState(store, {
                      answers: dossier.data ?? {},
                      answersFor: id,
                      sectionIndex: dossier.draft?.sectionIndex ?? 0,
                    });
                  }
                }),
              ),
              service.watchEvents(cabinet, id).pipe(tap(events => patchState(store, { events }))),
              service.watchProducts().pipe(tap(products => patchState(store, { products }))),
              service.watchInsurers().pipe(tap(insurers => patchState(store, { insurers }))),
              service.watchMembers(cabinet).pipe(tap(members => patchState(store, { members }))),
            );
          }),
        ),
      ),
    };
  }),
  withMethods(store => ({
    /** Enregistre tout de suite (bouton Enregistrer, changement de section, avant de quitter). */
    saveNow: (options: { event?: boolean; sectionIndex?: number } = {}) => store._run({ kind: 'save', ...options }),
    changeStatus: (status: DossierStatus) => store._run({ kind: 'status', status }),
    assign: (uid: string) => store._run({ kind: 'assign', uid }),
    saveNeed: (need: NeedInput) => store._run({ kind: 'need', need }),
    validateNeed: () => store._run({ kind: 'validateNeed' }),
    /** Passe à une section et mémorise où le courtier s'est arrêté. */
    goToSection: (sectionIndex: number) => {
      patchState(store, { sectionIndex });
      store._run({ kind: 'save', sectionIndex });
    },
  })),
  withHooks({
    onInit: store => {
      const authStore = inject(AuthStore);
      store._listen(computed(() => (authStore.cabinetId() ? store.selectedId() : null)));
      store._listenAssure(computed(() => store.dossier()?.assureId ?? null));
      // Sauvegarde automatique : enregistre le brouillon quand la frappe s'arrête.
      effect(onCleanup => {
        const tick = store.editTick();
        if (!tick || !store.autosave()) {
          return;
        }
        const timer = setTimeout(() => store.saveNow(), AUTOSAVE_DELAY_MS);
        onCleanup(() => clearTimeout(timer));
      });
    },
  }),
);
