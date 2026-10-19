import { CanonicalData, CanonicalPath, FormMemoryField, isCanonicalPath, DISCOVERED_MAX_FIELDS_PER_REPORT, type DiscoveredFieldInput, isRelevantField } from '@shared';
import { normalize } from './text';
import type { FormField } from './analyzer';
import { isCompatible, Mapping } from './mapping';

/** Mémoire partagée des formulaires, vue par l'extension (lecture directe, écriture par les functions `memoires-*`). */
/**
 * Résultat de `memoires-enregistrer` : `pending` = gardé pour le cabinet, en attente d'un autre cabinet pour la
 * mémoire commune ; `ignored` = rien à retenir (aucun champ partageable).
 */
export type MemorySaveOutcome = 'created' | 'confirmed' | 'kept' | 'pending' | 'relearned' | 'ignored';

export interface MemoryPort {
  /** Mémoire valide (non invalidée) de ce formulaire, ou null. */
  load(origin: string, fingerprint: string): Promise<LoadedMemory | null>;
  /** Apprend le formulaire : appelé APRÈS un remplissage réussi et validé par le courtier. */
  save(origin: string, fingerprint: string, fields: FormMemoryField[]): Promise<MemorySaveOutcome | void>;
  /** La mémoire a servi sans problème. */
  touch(key: string): Promise<void>;
  /** La mémoire a servi et le remplissage a échoué : à invalider (réapprentissage). */
  invalidate(key: string): Promise<void>;
}

export interface LoadedMemory {
  key: string;
  fields: FormMemoryField[];
}

/**
 * Identifiant du document `formMemories` : sha256(`origin|empreinte`) en hexadécimal, 32 premiers caractères.
 * Doit rester identique au calcul de `memoires-enregistrer` côté serveur (vecteur de test commun).
 */
export async function memoryKeyFor(origin: string, fingerprint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${origin}|${fingerprint}`));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 32);
}

/** Part d'un mapping retenue grâce à la mémoire. */
export interface AppliedMemory {
  mappings: Mapping[];
  /** Champs dont le mapping vient de la mémoire (et non des synonymes). */
  fromMemory: Set<string>;
  /** Entrées de la mémoire écartées : chemin hors du dossier, incompatible avec le champ, ou démenti par les synonymes. */
  rejected: string[];
}

/**
 * Applique une mémoire au mapping des synonymes (E8-2) : les champs qu'ils n'ont pas tranchés reçoivent le chemin appris,
 * sans appel à l'IA. La mémoire est partagée par tous les cabinets, donc jamais crue sur parole :
 * - un chemin doit être dans la liste fermée, dans le dossier et compatible avec le type du champ ;
 * - un mapping des synonymes SÛR l'emporte sur la mémoire en cas de désaccord ;
 * - « aucun équivalent » (null) est appris aussi : ces champs ne repartent pas vers l'IA.
 */
export function applyMemory(
  fields: FormField[],
  heuristic: Mapping[],
  memoryFields: readonly FormMemoryField[],
  allowedPaths: readonly CanonicalPath[],
): AppliedMemory {
  const learned = new Map(memoryFields.map(entry => [entry.fieldKey, entry]));
  const fieldByKey = new Map(fields.map(field => [field.key, field]));
  const fromMemory = new Set<string>();
  const rejected: string[] = [];

  const mappings = heuristic.map((mapping): Mapping => {
    const entry = learned.get(mapping.fieldKey);
    const field = fieldByKey.get(mapping.fieldKey);
    if (!entry || !field || mapping.status === 'mapped') {
      if (entry && mapping.status === 'mapped' && entry.canonicalPath !== mapping.canonicalPath) rejected.push(mapping.fieldKey);
      return mapping;
    }
    if (entry.canonicalPath === null) {
      fromMemory.add(mapping.fieldKey);
      return { ...mapping, canonicalPath: null, status: 'unmapped', source: 'memory', confidence: 0 };
    }
    const path = entry.canonicalPath;
    if (!isCanonicalPath(path) || !allowedPaths.includes(path) || !isCompatible(field, path)) {
      rejected.push(mapping.fieldKey);
      return mapping;
    }
    fromMemory.add(mapping.fieldKey);
    return { ...mapping, canonicalPath: path, status: 'mapped', source: 'memory', confidence: Math.min(Math.max(entry.confidence, 0.75), 0.95) };
  });
  return { mappings, fromMemory, rejected };
}

const MAX_LABEL = 120;

/** Un libellé est un texte de formulaire : s'il ressemble à une donnée saisie (e-mail, numéro), il n'est pas conservé. */
export function safeLabel(label: string): string | null {
  const text = label.trim();
  if (!text || text.length > MAX_LABEL) return null;
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text) || /\d{6,}/.test(text.replace(/[\s.\-/]/g, ''))) return null;
  return text;
}

/** Plafonds des textes envoyés dans un signalement de nouveaux champs. */
const MAX_NAME = 80;
const MAX_FIELD_KEY = 120;
const MAX_OPTION = 80;
const MAX_OPTIONS = 40;

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** Plaque d'immatriculation (SIV « AB-123-CD » ou FNI « 1234 AB 75 »). */
const PLATE = /\b[A-Z]{2}[\s-]?\d{3}[\s-]?[A-Z]{2}\b|\b\d{2,4}\s?[A-Z]{2,3}\s?\d{2}\b/;
/** Téléphone français (06 12 34 56 78, +33 6…). */
const PHONE = /(\+33|0033|\b0)\s?[1-9]([\s.-]?\d{2}){4}\b/;
/** Date (12/05/1980, 1980-05-12). */
const DATE = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/;

const normalizeValue = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

/** Valeurs du dossier (texte de 3 caractères et plus) : une option qui les reprend est une donnée client. */
export function clientValues(quoteData: CanonicalData | undefined): Set<string> {
  const values = new Set<string>();
  for (const raw of Object.values(quoteData ?? {})) {
    const plain = raw !== null && typeof raw === 'object' && 'value' in raw ? (raw as { value: unknown }).value : raw;
    if (typeof plain === 'string' || typeof plain === 'number') {
      const text = normalizeValue(String(plain));
      if (text.length >= 3) values.add(text);
    }
  }
  return values;
}

/** Le texte ressemble-t-il à une donnée client (valeur du dossier, e-mail, plaque, téléphone, date, long numéro) ? */
export function looksLikeClientData(text: string, values: Set<string>): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (values.has(normalizeValue(trimmed))) return true;
  return EMAIL.test(trimmed) || PLATE.test(trimmed) || PHONE.test(trimmed) || DATE.test(trimmed) || /\d{6,}/.test(trimmed.replace(/[\s.\-/]/g, ''));
}

/** Texte de structure plafonné, ou null s'il ressemble à une donnée client. */
function safeText(text: string | null, max: number, values: Set<string>): string | null {
  if (!text) return null;
  const trimmed = text.trim().slice(0, max);
  return trimmed && !looksLikeClientData(trimmed, values) ? trimmed : null;
}

/**
 * Champs du formulaire restés sans équivalent (ni synonyme, ni mémoire, ni IA, ni correction du courtier) et qui sont
 * de vraies questions (ni captcha, ni CGU, ni champ caché…) : structure seulement, jamais de valeur saisie.
 * - `productPaths` : TOUTES les questions du produit du dossier (pas seulement celles de quoteData). Un champ reconnu
 *   dont la question n'est pas dans ce produit (ex. « sinistres » Auto sur un extranet Habitation) compte comme nouveau.
 * - un mapping « incertain » vers une question du produit (candidat pas assez sûr) n'est pas signalé : trop de bruit.
 * - `quoteData` : valeurs du client, écartées des libellés et des options (une liste peut être pré-remplie avec elles).
 */
export function toDiscoveredFields(
  fields: FormField[],
  mappings: Mapping[],
  productPaths?: readonly string[],
  quoteData?: CanonicalData,
): DiscoveredFieldInput[] {
  const inProduct = (path: string) => !productPaths || productPaths.includes(path);
  const known = new Set(
    mappings
      // Reconnu (sûr ou incertain) sur une question du produit : pas nouveau. Un candidat incertain hors produit, si.
      .filter(m => (m.status === 'mapped' || m.status === 'uncertain') && m.canonicalPath !== null && inProduct(m.canonicalPath))
      .map(m => m.fieldKey),
  );
  const values = clientValues(quoteData);
  return fields
    .filter(field => !known.has(field.key) && isRelevantField(field))
    .slice(0, DISCOVERED_MAX_FIELDS_PER_REPORT)
    .map(field => ({
      fieldKey: field.key.slice(0, MAX_FIELD_KEY),
      label: safeLabel(field.label) ?? '',
      kind: field.kind,
      inputType: field.inputType,
      name: safeText(field.name, MAX_NAME, values),
      section: field.section ? safeLabel(field.section) : null,
      options: field.options
        .filter(option => !looksLikeClientData(option.value, values) && !looksLikeClientData(option.label, values))
        .slice(0, MAX_OPTIONS)
        .map(option => ({ value: option.value.trim().slice(0, MAX_OPTION), label: option.label.trim().slice(0, MAX_OPTION) })),
      required: field.required,
    }))
    // Libellé illisible ou qui ressemble à une donnée client : le champ n'est pas signalé du tout.
    .filter(field => field.label !== '')
    // Lecture ratée de l'extranet (options identiques, ou qui ne sont que le nom technique du champ) : jamais une question.
    .filter(field => !misreadOptions(field.options, field.name));
}

/** Options lues de travers : libellés en double, ou recopie du nom technique (« oSexe », « oSexe »). */
export function misreadOptions(options: { value: string; label: string }[], name: string | null | undefined): boolean {
  if (options.length < 2) return false;
  const labels = options.map(option => normalize(option.label));
  if (new Set(labels).size < labels.length) return true;
  const technical = name ? normalize(name) : null;
  return labels.some(label => label === '' || (technical !== null && label === technical));
}

/** Chemins des champs obligatoires de l'extranet qui ont un équivalent dans l'application. */
export function toRequiredPaths(fields: FormField[], mappings: Mapping[]): string[] {
  const requiredKeys = new Set(fields.filter(field => field.required).map(field => field.key));
  const paths = mappings
    .filter(m => requiredKeys.has(m.fieldKey) && m.status === 'mapped' && m.canonicalPath !== null)
    .map(m => m.canonicalPath as string);
  return [...new Set(paths)];
}

/**
 * Ce que l'extension retient d'un formulaire : sa STRUCTURE (champs, types, libellés) et le chemin associé, jamais une valeur.
 * Seuls les champs associés à un chemin sont envoyés : un « sans équivalent » (null) n'apprend rien d'utile à la mémoire
 * partagée et ne ferait que du bruit (il pourrait aussi figer une erreur de l'analyse).
 */
export function toMemoryFields(fields: FormField[], mappings: Mapping[]): FormMemoryField[] {
  const byKey = new Map(mappings.map(mapping => [mapping.fieldKey, mapping]));
  return fields.flatMap(field => {
    const mapping = byKey.get(field.key);
    if (mapping?.status !== 'mapped' || mapping.canonicalPath === null) return [];
    return [
      {
        fieldKey: field.key,
        label: safeLabel(field.label),
        type: field.kind,
        order: field.order,
        canonicalPath: mapping.canonicalPath,
        confidence: Math.round(mapping.confidence * 100) / 100,
      },
    ];
  });
}
