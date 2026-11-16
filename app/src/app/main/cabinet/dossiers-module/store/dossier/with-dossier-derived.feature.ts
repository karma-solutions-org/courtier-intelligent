import { computed, inject } from '@angular/core';
import { signalStoreFeature, type, withComputed } from '@ngrx/signals';
import {
  buildQuoteData,
  CanonicalPath,
  computeMissing,
  ANSWERS_EDITABLE_DOSSIER_STATUSES,
  EDITABLE_DOSSIER_STATUSES,
  insurersForProduct,
  NeedAnalysis,
  schemaForInsurers,
  suggestNeed,
} from '@shared';
import { CabinetStatusStore } from '../../../../commons/main-module/store/cabinet-status.store';
import { labelsByPath, manualTransitionsFrom } from '../../util/dossiers.utils';
import { DossierStoreState } from './dossier.state';

/** Valeurs calculées du dossier : produit, questionnaire, complétude, besoin, droits d'édition, noms. Aucune écriture. */
export function withDossierDerived() {
  return signalStoreFeature(
    { state: type<DossierStoreState>() },
    withComputed((store, cabinetStatus = inject(CabinetStatusStore)) => {
      const product = computed(() => store.products().find((p) => p.id === store.dossier()?.productId) ?? null);
      /** Assureurs du cabinet qui proposent le produit du dossier : extranets proposés à l'étape « Extranets ». */
      const availableInsurers = computed(() =>
        insurersForProduct(store.insurers(), store.dossier()?.productId ?? '', cabinetStatus.cabinet()?.enabledInsurers ?? []),
      );
      /**
       * Seulement les questions des extranets choisis pour le dossier (leur liste de questions connues et celles
       * découvertes chez eux), à défaut de ceux du cabinet qui proposent le produit.
       */
      const schema = computed(() => {
        const selected = store.selectedInsurers();
        const insurers = selected.length ? store.insurers().filter((insurer) => selected.includes(insurer.id)) : availableInsurers();
        return schemaForInsurers(
          product()?.questionnaireSchema ?? [],
          insurers,
          store.dossier()?.productId ?? '',
          product()?.insurerQuestions ?? {},
        );
      });
      const missing = computed<CanonicalPath[]>(() => computeMissing(schema(), store.answers()));
      return {
        product,
        availableInsurers,
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
            (product()?.guaranteeCatalog ?? []).map((g) => g.code),
          ),
        ),
        editable: computed(() => EDITABLE_DOSSIER_STATUSES.includes(store.dossier()?.status ?? 'souscrit')),
        /** Réponses du questionnaire modifiables : avant la tarification, et pendant (voir ANSWERS_EDITABLE_DOSSIER_STATUSES). */
        answersEditable: computed(() => ANSWERS_EDITABLE_DOSSIER_STATUSES.includes(store.dossier()?.status ?? 'souscrit')),
        /** Modification pendant la tarification : les tarifs déjà obtenus deviendront périmés. */
        editingDuringPricing: computed(() => store.dossier()?.status === 'tarification'),
        transitions: computed(() => {
          const status = store.dossier()?.status;
          return status ? manualTransitionsFrom(status) : [];
        }),
        /** Données envoyées à l'extension pour tarifer : `null` et niveaux de connaissance respectés. */
        quoteData: computed(() => buildQuoteData(schema(), store.answers())),
        memberNames: computed(() => new Map(store.members().map((m) => [m.id, m.displayName || m.email || m.id]))),
        insurerNames: computed(() => new Map(store.insurers().map((i) => [i.id, i.name]))),
        activeMembers: computed(() => store.members().filter((m) => m.status === 'active')),
      };
    }),
  );
}
