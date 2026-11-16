import type { JobUpdate, RunField } from '../../shared/messages';
import type { FormAnalysis } from '../analyzer';
import type { FillResult } from '../filler';
import type { Mapping } from '../mapping';
import type { FillPlan } from '../plan';
import type { StepHint } from '../steps';

/** Avancement du job : champs manquants, étape en cours ou prêt à soumettre. */
export function progressUpdate(plan: FillPlan, hint: StepHint, stepCounter: number, finalStep: boolean): JobUpdate {
  const current = hint.current ?? stepCounter;
  if (plan.missing.length > 0) return { status: 'needs_info', currentStep: current, totalSteps: hint.total, missingFields: plan.missing };
  if (finalStep) return { status: 'awaiting_submit', currentStep: current, totalSteps: hint.total ?? current, missingFields: [] };
  return { status: 'filling', currentStep: current, totalSteps: hint.total, missingFields: [] };
}

/** Deux avancements de même signature ne sont écrits qu'une fois. */
export function progressSignature(update: JobUpdate): string {
  return JSON.stringify([update.status, update.currentStep, update.totalSteps, (update.missingFields ?? []).map(m => m.canonicalPath)]);
}

/** Champs de l'étape pour le side panel : chemin visé, confiance et résultat du remplissage. */
export function panelFields(fields: FormAnalysis['fields'], mappings: Mapping[], plan: FillPlan, results: Map<string, FillResult>): RunField[] {
  const missingPaths = new Set(plan.missing.map(m => m.canonicalPath));
  return fields.map(field => {
    const mapping = mappings.find(m => m.fieldKey === field.key);
    const result = results.get(field.key);
    let status: RunField['status'] = 'unmapped';
    if (result) status = result.status;
    else if (mapping?.canonicalPath && missingPaths.has(mapping.canonicalPath)) status = 'missing';
    else if (mapping?.status === 'uncertain') status = 'uncertain';
    return {
      key: field.key,
      label: field.label,
      required: field.required,
      section: field.section,
      canonicalPath: mapping?.canonicalPath ?? null,
      confidence: mapping?.confidence ?? 0,
      source: mapping?.source ?? 'heuristic',
      status,
      reason: result?.reason ?? null,
    };
  });
}
