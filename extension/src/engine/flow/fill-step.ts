import type { CanonicalData, CanonicalPath } from '@shared';
import type { FormAnalysis } from '../analyzer';
import { expectsDate } from '../field-synonyms';
import { fillField, FillResult, parseRange, registrationFor } from '../filler';
import type { Mapping } from '../mapping';
import { FillPlan, FillValue, valueOf } from '../plan';

/** Champs d'adresse : les extranets y proposent souvent des suggestions à choisir (adresse normalisée, commune). */
const SUGGEST_PATHS: ReadonlySet<string> = new Set(['client.address.street', 'client.address.city', 'vehicle.parkingCity']);

/**
 * Corrections du courtier (`manual` : chemin, ou null pour « ne pas remplir »), puis rattachements du serveur,
 * par-dessus le mapping calculé.
 */
export function applyOverrides(mappings: Mapping[], manual: ReadonlyMap<string, CanonicalPath | null>, serverMapped: ReadonlyMap<string, CanonicalPath>): Mapping[] {
  return mappings.map(mapping => {
    const server = manual.has(mapping.fieldKey) ? undefined : serverMapped.get(mapping.fieldKey);
    return server ? { ...mapping, canonicalPath: server, confidence: 1, status: 'mapped' as const } : mapping;
  }).map(mapping =>
    manual.has(mapping.fieldKey)
      ? {
          ...mapping,
          canonicalPath: manual.get(mapping.fieldKey)!,
          confidence: manual.get(mapping.fieldKey) ? 1 : 0,
          status: manual.get(mapping.fieldKey) ? ('mapped' as const) : ('unmapped' as const),
          source: 'manual' as const,
        }
      : mapping,
  );
}

/**
 * Remplit les champs du plan (sans jamais cliquer sur un bouton). `written` garde les valeurs déjà écrites : un champ
 * que le courtier a pu corriger n'est pas réécrit.
 */
export async function fillPlan(plan: FillPlan, analysis: FormAnalysis, written: Map<string, string>, quoteData: CanonicalData): Promise<Map<string, FillResult>> {
  const results = new Map<string, FillResult>();
  for (const { field, value: planned, path } of plan.instructions) {
    const elements = analysis.elements.get(field.key) ?? [];
    const value = path === 'vehicle.registration' ? registrationFor(field, elements[0], planned) : withSeniority(path, field, planned, quoteData);
    const signature = `${String(value)}`;
    if (written.get(field.key) === signature) {
      results.set(field.key, { fieldKey: field.key, status: 'filled' });
      continue;
    }
    const result = await fillField(field, elements, value, {
      date: expectsDate(path, value),
      version: path === 'vehicle.version',
      suggest: SUGGEST_PATHS.has(path),
    });
    results.set(field.key, result);
    if (result.status === 'filled') written.set(field.key, signature);
  }
  return results;
}

/**
 * « Avez-vous été assuré ? » proposé en durées (« moins de 9 mois », « 24 mois et plus ») : un simple « oui » ne
 * choisit pas, l'ancienneté du dossier (en mois) le fait.
 */
function withSeniority(path: CanonicalPath, field: FormAnalysis['fields'][number], planned: FillValue, quoteData: CanonicalData): FillValue {
  if (path !== 'insuranceHistory.currentlyInsured' || planned !== true) return planned;
  if (!field.options.some(option => parseRange(option.label) !== null)) return planned;
  const months = valueOf(quoteData['insuranceHistory.seniority']);
  return typeof months === 'number' ? months : planned;
}
