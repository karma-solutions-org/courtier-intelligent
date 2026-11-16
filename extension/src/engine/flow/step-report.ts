import {
  CanonicalData,
  STEP_SNAPSHOT_MAX_BUTTONS,
  STEP_SNAPSHOT_MAX_FIELDS,
  STEP_SNAPSHOT_MAX_OPTIONS,
  type BlockedStepSnapshot,
  type FillFailureCode,
  type StepSnapshotField,
} from '@shared';
import type { FormField } from '../analyzer';
import type { FillResult } from '../filler';
import type { Mapping } from '../mapping';
import { clientValues, looksLikeClientData, safeLabel } from '../memory';
import type { FillPlan } from '../plan';
import { buttonLabels, StepHint } from '../steps';

/**
 * Raison d'un échec en code fermé. Le message du moteur (« Aucune option ne correspond à « Peugeot 208 » ») peut
 * porter une valeur du dossier : il ne quitte jamais le navigateur, seul son code part.
 */
export function failureCode(reason: string | undefined): FillFailureCode {
  const text = reason ?? '';
  if (/aucune (option|suggestion)/i.test(text)) return 'no_option';
  if (/n'a pas accept|a vidé le champ|n'a pas pu être (sélectionnée|cochée?|modifiée)/i.test(text)) return 'rejected';
  if (/illisible|attendue?|dépasse|ne correspond pas aux|ne se saisit pas/i.test(text)) return 'bad_value';
  if (/introuvable|plus dans la page|ne s'est pas ouverte/i.test(text)) return 'not_found';
  return 'other';
}

/**
 * Photo de l'étape bloquée (signalement `step_blocked` / `advance_refused`) : chaque champ avec son état, la donnée du
 * dossier qu'il vise et la raison codée d'un échec, plus les boutons visibles. STRUCTURE seulement : un libellé qui
 * ressemble à une donnée (e-mail, numéro, valeur du dossier) est remplacé par son type.
 */
export function blockedStepSnapshot(
  doc: Document,
  fields: FormField[],
  mappings: Mapping[],
  plan: FillPlan | null,
  results: ReadonlyMap<string, FillResult>,
  hint: StepHint,
  quoteData: CanonicalData,
): BlockedStepSnapshot {
  const values = clientValues(quoteData);
  const safe = (text: string) => {
    const label = safeLabel(text);
    return label && !looksLikeClientData(label, values) ? label : null;
  };
  const missing = new Set<string>(plan?.missing.map(m => m.canonicalPath) ?? []);
  const pathOf = new Map(mappings.map(m => [m.fieldKey, m.canonicalPath]));

  const describe = (field: FormField): StepSnapshotField => {
    const result = results.get(field.key);
    const path = pathOf.get(field.key) ?? null;
    const status: StepSnapshotField['status'] = result
      ? result.status
      : path !== null && missing.has(path)
        ? 'missing'
        : path === null
          ? 'unmapped'
          : 'not_filled';
    return {
      label: safe(field.label) ?? `(${field.kind})`,
      kind: field.kind,
      required: field.required,
      status,
      path,
      ...(result?.status === 'failed' ? { failure: failureCode(result.reason) } : {}),
      ...(field.options.length || field.kind === 'select' ? { optionCount: field.options.length } : {}),
      // Options d'un champ en échec : le libellé tel que lu (une option qui reprend une valeur du dossier est masquée).
      ...(result?.status === 'failed' && field.options.length
        ? { options: field.options.slice(0, STEP_SNAPSHOT_MAX_OPTIONS).map(o => safe(o.label) ?? '(…)') }
        : {}),
    };
  };

  return {
    stepNumber: hint.current,
    fields: fields.slice(0, STEP_SNAPSHOT_MAX_FIELDS).map(describe),
    buttons: [...new Set(buttonLabels(doc).map(safe).filter((label): label is string => !!label))].slice(0, STEP_SNAPSHOT_MAX_BUTTONS),
  };
}
