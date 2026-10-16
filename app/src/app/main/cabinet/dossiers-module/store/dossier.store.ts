import { computed, effect, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
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
  normalizeRegistration,
  prefillAnswers,
  Product,
  schemaForCabinet,
  suggestNeed,
  supportsVehicleLookup,
  vehicleInfoToAnswers,
} from '@shared';
import {
  catchError,
  concatMap,
  defer,
  EMPTY,
  map,
  merge,
  Observable,
  of,
  pipe,
  switchMap,
  tap,
  finalize,
} from 'rxjs';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { CabinetStatusStore } from '../../../commons/main-module/store/cabinet-status.store';
import { AnswerPatch, DossiersService } from '../services/dossiers.service';
import type { VehicleLookupView } from '../components/questionnaire-form/questionnaire-form.component';
import { labelsByPath, manualTransitionsFrom } from '../util/dossiers.utils';

/** Délai sans frappe avant d'enregistrer le brouillon. */
const AUTOSAVE_DELAY_MS = 800;

/** Taille d'une tranche de l'historique (défilement infini). */
const EVENTS_PAGE_SIZE = 20;

/** idle : rien à enregistrer · dirty : modifications en attente · saving · saved · error. */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Écritures en file : exécutées l'une après l'autre, pour qu'un changement de statut voie toujours les dernières réponses. */
type OperationInput =
  | { kind: 'save'; event?: boolean; sectionIndex?: number; patch?: AnswerPatch }
  | { kind: 'status'; status: DossierStatus }
  | { kind: 'assign'; uid: string }
  | { kind: 'need'; need: NeedInput }
  | { kind: 'validateNeed' };

/** Le dossier (et son cabinet) est figé à la mise en file : une écriture ne part jamais vers un autre dossier. */
type Operation = OperationInput & { dossierId: string; cabinetId: string };

interface DossierState {
  /** Écritures de la couverture (enregistrement, validation) en file ou en cours : le bouton reste grisé. */
  needPending: number;
  selectedId: string | null;
  dossier: Dossier | null;
  /** Vrai dès la première réponse de Firestore. */
  loaded: boolean;
  events: DossierEvent[];
  /** Événements demandés à Firestore : grandit d'une tranche à chaque fin de défilement de l'historique. */
  eventsLimit: number;
  eventsHasMore: boolean;
  eventsLoadingMore: boolean;
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
  /** Recherche du véhicule par sa plaque en cours. */
  vehicleLoading: boolean;
  /** Erreur de la recherche (plaque invalide ou inconnue), affichée sous l'immatriculation. */
  vehicleError: string | null;
  /** Dernière plaque recherchée : quitter le champ sans la changer ne relance pas la recherche. */
  vehiclePlate: string | null;
  /** Champs remplis par la recherche et pas encore modifiés par le courtier. */
  prefilled: CanonicalPath[];
}

/** Store d'un dossier (fourni par la route) : données, questionnaire, saisie avec sauvegarde automatique, statut, assignation. */
export const DossierStore = signalStore(
  withState<DossierState>({
    needPending: 0,
    selectedId: null,
    dossier: null,
    loaded: false,
    events: [],
    eventsLimit: EVENTS_PAGE_SIZE,
    eventsHasMore: false,
    eventsLoadingMore: false,
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
    vehicleLoading: false,
    vehicleError: null,
    vehiclePlate: null,
    prefilled: [],
  }),
  withComputed((store, cabinetStatus = inject(CabinetStatusStore)) => {
    const product = computed(
      () => store.products().find((p) => p.id === store.dossier()?.productId) ?? null,
    );
    /** Sans les questions découvertes sur l'extranet d'un assureur que le cabinet n'utilise pas. */
    const schema = computed(() =>
      schemaForCabinet(product()?.questionnaireSchema ?? [], cabinetStatus.cabinet()?.enabledInsurers ?? []),
    );
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
      needEditable: computed(() =>
        ['complet', 'besoin_valide'].includes(store.dossier()?.status ?? ''),
      ),
      /** Suggestions de besoin selon les réponses du questionnaire (le courtier les accepte ou les modifie). */
      needSuggestion: computed(() =>
        suggestNeed(
          store.dossier()?.productId ?? '',
          store.answers(),
          (product()?.guaranteeCatalog ?? []).map((g) => g.code),
        ),
      ),
      editable: computed(() =>
        EDITABLE_DOSSIER_STATUSES.includes(store.dossier()?.status ?? 'souscrit'),
      ),
      /**
       * Recherche par plaque, pour le produit Auto ou une copie du cabinet : décidé par les questions
       * (plaque, marque…), pas par l'id du produit. `null` : pas de recherche (autre produit, dossier figé).
       */
      vehicleLookup: computed<VehicleLookupView | null>(() =>
        supportsVehicleLookup(schema()) && EDITABLE_DOSSIER_STATUSES.includes(store.dossier()?.status ?? 'souscrit')
          ? { loading: store.vehicleLoading(), error: store.vehicleError(), prefilled: store.prefilled() }
          : null,
      ),
      transitions: computed(() => {
        const status = store.dossier()?.status;
        return status ? manualTransitionsFrom(status) : [];
      }),
      /** Données envoyées à l'extension pour tarifer : `null` et niveaux de connaissance respectés. */
      quoteData: computed(() => buildQuoteData(schema(), store.answers())),
      memberNames: computed(
        () => new Map(store.members().map((m) => [m.id, m.displayName || m.email || m.id])),
      ),
      insurerNames: computed(() => new Map(store.insurers().map((i) => [i.id, i.name]))),
      activeMembers: computed(() => store.members().filter((m) => m.status === 'active')),
    };
  }),
  withMethods((store, service = inject(DossiersService), authStore = inject(AuthStore)) => {
    /** Envoie les réponses en attente (rien à faire s'il n'y en a pas). Une erreur les remet en attente. */
    const persist = (
      dossierId: string,
      options: { event?: boolean; sectionIndex?: number },
      snapshot?: AnswerPatch,
    ): Observable<boolean> =>
      defer(() => {
        // Réponses figées à la mise en file (changement de dossier), sinon celles du dossier encore sélectionné :
        // jamais celles d'un autre dossier.
        const current = store.selectedId() === dossierId;
        const patch = snapshot ?? (current ? store.pending() : {});
        const hasPatch = Object.keys(patch).length > 0;
        if (!hasPatch && options.sectionIndex === undefined) {
          return of(true);
        }
        if (current) {
          patchState(store, {
            ...(snapshot ? {} : { pending: {} }),
            saveStatus: 'saving',
            error: null,
          });
        }
        return service.save(dossierId, patch, options).pipe(
          tap(() => {
            if (store.selectedId() === dossierId) {
              patchState(store, {
                saveStatus: Object.keys(store.pending()).length ? 'dirty' : 'saved',
              });
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

    const run = (operation: Operation): Observable<unknown> => {
      switch (operation.kind) {
        case 'save':
          return persist(
            operation.dossierId,
            {
              ...(operation.event !== undefined ? { event: operation.event } : {}),
              ...(operation.sectionIndex !== undefined
                ? { sectionIndex: operation.sectionIndex }
                : {}),
            },
            operation.patch,
          );
        case 'status':
          return persist(operation.dossierId, {}).pipe(
            switchMap((saved) =>
              saved
                ? service.changeStatus(operation.dossierId, operation.status).pipe(
                    tap(() => patchState(store, { successMessage: 'Statut mis à jour.' })),
                    catchError((error) => {
                      patchState(store, { error: toBackendErrorMessage(error) });
                      return EMPTY;
                    }),
                  )
                : EMPTY,
            ),
          );
        case 'need':
          return persist(operation.dossierId, {}).pipe(
            switchMap((saved) =>
              saved
                ? service.saveNeed(operation.dossierId, operation.need).pipe(
                    tap(({ changed }) =>
                      patchState(store, {
                        successMessage: changed.length
                          ? 'Couverture enregistrée.'
                          : 'Aucune modification.',
                      }),
                    ),
                    catchError((error) => {
                      patchState(store, { error: toBackendErrorMessage(error) });
                      return EMPTY;
                    }),
                  )
                : EMPTY,
            ),
          );
        case 'validateNeed':
          return service.validateNeed(operation.dossierId).pipe(
            tap(() => patchState(store, { successMessage: 'Couverture validée.' })),
            catchError((error) => {
              patchState(store, { error: toBackendErrorMessage(error) });
              return EMPTY;
            }),
          );
        case 'assign':
          return service.assign(operation.dossierId, operation.uid).pipe(
            tap(() => patchState(store, { successMessage: 'Dossier réassigné.' })),
            catchError((error) => {
              patchState(store, { error: toBackendErrorMessage(error) });
              return EMPTY;
            }),
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
          answers: {},
          answersFor: null,
          pending: {},
          saveStatus: 'idle',
          error: null,
          vehicleLoading: false,
          vehicleError: null,
          vehiclePlate: null,
          prefilled: [],
        }),
      setAutosave: (autosave: boolean) => patchState(store, { autosave }),
      /** Fin du défilement de l'historique : demande la tranche suivante. */
      loadMoreEvents: () => {
        if (store.eventsHasMore() && !store.eventsLoadingMore()) {
          patchState(store, { eventsLimit: store.eventsLimit() + EVENTS_PAGE_SIZE, eventsLoadingMore: true });
        }
      },
      _listenEvents: rxMethod<{ cabinet: string | null; id: string | null; limit: number }>(
        pipe(
          switchMap(({ cabinet, id, limit }) =>
            cabinet && id
              ? service.watchEvents(cabinet, id, limit).pipe(
                  tap(({ events, hasMore }) =>
                    patchState(store, { events, eventsHasMore: hasMore, eventsLoadingMore: false }),
                  ),
                  catchError((error) => {
                    patchState(store, { error: toBackendErrorMessage(error), eventsLoadingMore: false });
                    return EMPTY;
                  }),
                )
              : EMPTY,
          ),
        ),
      ),
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
          // Corrigé par le courtier : ce n'est plus une valeur pré-remplie.
          prefilled: store.prefilled().filter((p) => p !== path),
        }),

      /**
       * Recherche le véhicule de la plaque saisie et remplit SEULEMENT les champs vides du questionnaire
       * (une réponse déjà saisie n'est jamais écrasée). `force` : bouton « Rechercher » (sinon, perte de focus).
       */
      lookupVehicle: rxMethod<{ force: boolean }>(
        pipe(
          switchMap(({ force }) => {
            const raw = store.answers()['vehicle.registration'];
            if (typeof raw !== 'string' || !raw.trim()) {
              patchState(store, { vehicleError: force ? "Saisissez d'abord l'immatriculation." : null });
              return EMPTY;
            }
            const normalized = normalizeRegistration(raw);
            if (!normalized) {
              patchState(store, {
                vehicleError: "Plaque d'immatriculation invalide (formats acceptés : AB-123-CD ou 1234 AB 75).",
              });
              return EMPTY;
            }
            if (!force && normalized.plate === store.vehiclePlate()) {
              return EMPTY;
            }
            const dossierId = store.selectedId();
            patchState(store, { vehicleLoading: true, vehicleError: null, vehiclePlate: normalized.plate });
            return service.lookupVehicle(normalized.plate).pipe(
              tap((vehicle) => {
                if (store.selectedId() !== dossierId) return;
                // Calculé à la réponse : ce que le courtier a saisi pendant la recherche est respecté.
                const answers = store.answers();
                const patch: AnswerPatch = prefillAnswers(store.schema(), answers, vehicleInfoToAnswers(vehicle));
                // La plaque est enregistrée sous sa forme normalisée.
                if (raw !== normalized.plate) patch['vehicle.registration'] = normalized.plate;
                const filled = Object.keys(patch).filter((p) => p !== 'vehicle.registration') as CanonicalPath[];
                patchState(store, {
                  answers: { ...answers, ...patch },
                  pending: { ...store.pending(), ...patch },
                  editTick: store.editTick() + 1,
                  saveStatus: 'dirty',
                  prefilled: [...new Set([...store.prefilled(), ...filled])],
                  vehicleError: filled.length
                    ? null
                    : "Véhicule trouvé, mais tous ses champs étaient déjà remplis : rien n'a été modifié.",
                });
              }),
              catchError((error) => {
                // Une nouvelle tentative reste possible sur la même plaque.
                patchState(store, { vehicleError: toBackendErrorMessage(error), vehiclePlate: null });
                return EMPTY;
              }),
              finalize(() => patchState(store, { vehicleLoading: false })),
            );
          }),
        ),
      ),

      /** Toutes les écritures passent par cette file, une à la fois. */
      _run: rxMethod<Operation>(
        pipe(
          concatMap((operation) =>
            run(operation).pipe(
              finalize(() => {
                if (operation.kind === 'need' || operation.kind === 'validateNeed') {
                  patchState(store, { needPending: Math.max(0, store.needPending() - 1) });
                }
              }),
            ),
          ),
        ),
      ),

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
                      const server = Object.fromEntries(
                        Object.entries(dossier.data ?? {}).filter(([path]) => !(path in pending)),
                      );
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
      saveNow: (options: { event?: boolean; sectionIndex?: number } = {}) =>
        enqueue({ kind: 'save', ...options }),
      changeStatus: (status: DossierStatus) => enqueue({ kind: 'status', status }),
      assign: (uid: string) => enqueue({ kind: 'assign', uid }),
      saveNeed: (need: NeedInput) => enqueue({ kind: 'need', need }),
      validateNeed: () => enqueue({ kind: 'validateNeed' }),
      /** Passe à une section et mémorise où le courtier s'est arrêté. */
      goToSection: (sectionIndex: number) => {
        patchState(store, { sectionIndex });
        enqueue({ kind: 'save', sectionIndex });
      },
      /** Des modifications ne sont pas enregistrées (en attente ou en échec). */
      hasPendingEdits: () => store.saveStatus() === 'dirty' || store.saveStatus() === 'error',
    };
  }),
  withHooks((store) => {
    const authStore = inject(AuthStore);
    return {
      onInit: () => {
        store._listen(
          computed(
            () => ({ cabinet: authStore.cabinetId(), id: store.selectedId() }),
            { equal: (a, b) => a.cabinet === b.cabinet && a.id === b.id },
          ),
        );
        store._listenEvents(
          computed(
            () => ({ cabinet: authStore.cabinetId(), id: store.selectedId(), limit: store.eventsLimit() }),
            { equal: (a, b) => a.cabinet === b.cabinet && a.id === b.id && a.limit === b.limit },
          ),
        );
        store._listenAssure(computed(() => store.dossier()?.assureId ?? null));
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
    };
  }),
);
