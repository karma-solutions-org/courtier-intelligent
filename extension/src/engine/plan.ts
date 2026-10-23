import type { CanonicalData, CanonicalPath, CanonicalValue, MissingField, QuestionType } from '@shared';
import type { FormField } from './analyzer';
import type { Mapping } from './mapping';

/** Valeur à écrire dans un champ. */
export type FillValue = string | number | boolean;

export interface FillInstruction {
  field: FormField;
  path: CanonicalPath;
  value: FillValue;
}

export interface FillPlan {
  /** Champs à remplir : mappés et dont le dossier fournit une valeur. */
  instructions: FillInstruction[];
  /** Champs obligatoires de l'extranet que le dossier ne renseigne pas : à demander au courtier (`needs_info`). */
  missing: MissingField[];
  /** Champs que ni les synonymes ni l'IA n'ont reconnus : laissés vides, à traiter à la main. */
  unmapped: FormField[];
}

/**
 * Valeur utilisable d'une donnée du dossier. Rien n'est inventé : `null`, absent et chaîne vide n'ont pas de valeur ;
 * un niveau de connaissance « inconnu » ou « l'assuré ne sait pas » non plus (il ne se remplit pas à la place du courtier).
 */
export function valueOf(raw: CanonicalValue | undefined): FillValue | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'object') return raw.knowledge === 'KNOWN' && raw.value !== null ? raw.value : null;
  if (typeof raw === 'string') return raw.trim() === '' ? null : raw;
  return raw;
}

/** Type de la question à poser au courtier pour un champ manquant, d'après le champ de l'extranet. */
export function questionTypeOf(field: FormField): QuestionType {
  switch (field.kind) {
    case 'date':
      return 'date';
    case 'number':
      return 'number';
    case 'checkbox':
      return 'boolean';
    case 'radio':
    case 'select':
      return isYesNo(field) ? 'boolean' : 'choice';
    default:
      return 'text';
  }
}

const isYesNo = (field: FormField): boolean =>
  field.options.length === 2 && field.options.every(option => /^(oui|non|yes|no)$/i.test(option.label.trim()));

/**
 * Réponse de repli quand le dossier n'a pas la donnée demandée par l'extranet : le véhicule stationne en général à
 * l'adresse du souscripteur, et un véhicule sans date d'achat connue est compté depuis sa mise en circulation.
 * Utilisée même si l'extranet ne marque pas le champ obligatoire (Zephir ne le signale qu'après « Suivant »).
 */
const FALLBACK_PATHS: Partial<Record<CanonicalPath, CanonicalPath>> = {
  'vehicle.parkingPostalCode': 'client.address.postalCode',
  'vehicle.parkingCity': 'client.address.city',
  'vehicle.purchaseDate': 'vehicle.firstRegistrationDate',
};

/**
 * Transforme le mapping en plan : quoi remplir, quoi demander (champs obligatoires absents du dossier), quoi laisser.
 * Un champ facultatif sans donnée reste vide : l'extension ne remplit rien « par défaut ».
 */
export function planFill(fields: FormField[], mappings: Mapping[], quoteData: CanonicalData): FillPlan {
  const mappingByKey = new Map(mappings.map(mapping => [mapping.fieldKey, mapping]));
  const instructions: FillInstruction[] = [];
  const missing = new Map<CanonicalPath, MissingField>();
  const unmapped: FormField[] = [];

  for (const field of fields) {
    const path = mappingByKey.get(field.key)?.canonicalPath ?? null;
    if (!path) {
      unmapped.push(field);
      continue;
    }
    const fallback = FALLBACK_PATHS[path];
    const value = valueOf(quoteData[path]) ?? (fallback ? valueOf(quoteData[fallback]) : null);
    if (value === null) {
      if (field.required && !missing.has(path)) {
        missing.set(path, { canonicalPath: path, label: field.label, type: questionTypeOf(field) });
      }
      continue;
    }
    instructions.push({ field, path, value });
  }
  return { instructions, missing: [...missing.values()], unmapped };
}
