import { CanonicalData, CanonicalPath, CanonicalValue, isKnownValue, OCR_CONFIDENCE_THRESHOLD, OcrField } from '@shared';

/** Valeur lue à confirmer par le courtier : confiance sous le seuil. */
export const needsConfirmation = (field: OcrField): boolean => field.confidence < OCR_CONFIDENCE_THRESHOLD;

/** Sélection par défaut des valeurs lues : cochées si la lecture est sûre, décochées « à confirmer » sinon. */
export function defaultOcrSelection(fields: OcrField[]): Partial<Record<CanonicalPath, boolean>> {
  return Object.fromEntries(fields.map(f => [f.canonicalPath, !needsConfirmation(f)]));
}

/** Réponses à appliquer au dossier : uniquement les valeurs cochées par le courtier. */
export function selectedOcrAnswers(fields: OcrField[], selection: Partial<Record<CanonicalPath, boolean>>): CanonicalData {
  return Object.fromEntries(fields.filter(f => selection[f.canonicalPath]).map(f => [f.canonicalPath, f.value]));
}

/** Valeur affichée (nombre avec niveau de connaissance, oui / non). */
export function formatOcrValue(value: CanonicalValue): string {
  if (isKnownValue(value)) return value.value === null ? '—' : String(value.value);
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return value === null ? '—' : String(value);
}
