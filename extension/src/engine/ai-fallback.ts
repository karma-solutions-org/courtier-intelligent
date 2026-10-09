import type { CanonicalPath } from '@shared';
import type { FormField } from './analyzer';
import { FIELD_SYNONYMS } from './field-synonyms';
import { asCanonicalPath, isCompatible, Mapping } from './mapping';
import { normalize } from './text';

/** Requête envoyée à `ia-proxy` (le modèle et la clé sont choisis par le serveur). */
export interface AiRequest {
  system: string;
  messages: { role: 'user'; content: string }[];
  maxTokens: number;
}

/** Envoie la requête au proxy d'IA et renvoie le texte de la réponse. */
export type AskAi = (request: AiRequest) => Promise<string>;

/** Nombre maximal de champs envoyés en un appel. */
const MAX_FIELDS = 40;
const MAX_OPTIONS = 20;
/** Confiance minimale d'une réponse de l'IA, et plafond : l'IA ne vaut jamais un libellé exact. */
const MIN_AI_CONFIDENCE = 0.6;
const MAX_AI_CONFIDENCE = 0.85;

const SYSTEM_PROMPT =
  "Tu associes des champs d'un formulaire d'assurance auto (extranet d'assureur) à une LISTE FERMÉE de chemins canoniques. " +
  'Réponds UNIQUEMENT par un objet JSON de la forme {"mappings":[{"key":"<clé du champ>","canonicalPath":"<chemin de la liste>"|null,"confidence":<nombre de 0 à 1>}]}. ' +
  "Un chemin absent de la liste est interdit : si aucun chemin ne convient, mets canonicalPath à null. " +
  "Ne réponds pour aucun champ qui n'est pas dans la liste fournie. Aucun texte hors du JSON.";

/**
 * Construit la requête pour les champs incertains. Seule la STRUCTURE du formulaire est envoyée (libellés, types,
 * options) : jamais une valeur du dossier ni une donnée client.
 */
export function buildAiRequest(fields: FormField[], allowedPaths: readonly CanonicalPath[]): AiRequest {
  const payload = {
    allowedPaths: allowedPaths.map(path => ({ path, exampleLabel: FIELD_SYNONYMS[path].labels[0] })),
    fields: fields.slice(0, MAX_FIELDS).map(field => ({
      key: field.key,
      label: field.label,
      type: field.kind === 'select' || field.kind === 'radio' ? `${field.kind} (choix)` : field.inputType,
      section: field.section,
      placeholder: field.placeholder,
      options: field.options.slice(0, MAX_OPTIONS).map(option => option.label),
    })),
  };
  return { system: SYSTEM_PROMPT, messages: [{ role: 'user', content: JSON.stringify(payload) }], maxTokens: 1500 };
}

export interface AiMapping {
  fieldKey: string;
  canonicalPath: CanonicalPath;
  confidence: number;
}

/** Extrait l'objet JSON d'une réponse (le modèle peut l'entourer de ```json … ```). */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Valide la réponse de l'IA : rien n'est cru sur parole. Une entrée est écartée si le champ n'a pas été demandé,
 * si le chemin n'est pas dans la liste fermée (ni parmi ceux du dossier), s'il est incompatible avec le type du champ,
 * si la confiance est insuffisante, ou si le champ ou le chemin est déjà pris.
 */
export function parseAiResponse(
  text: string,
  requested: readonly FormField[],
  allowedPaths: readonly CanonicalPath[],
  alreadyUsedPaths: ReadonlySet<CanonicalPath> = new Set(),
): AiMapping[] {
  const json = extractJson(text) as { mappings?: unknown } | null;
  if (!json || !Array.isArray(json.mappings)) return [];

  const fieldByKey = new Map(requested.map(field => [field.key, field]));
  const accepted = new Map<string, AiMapping>();
  for (const entry of json.mappings as Record<string, unknown>[]) {
    const field = typeof entry?.key === 'string' ? fieldByKey.get(entry.key) : undefined;
    const path = asCanonicalPath(entry?.canonicalPath);
    const confidence = typeof entry?.confidence === 'number' && Number.isFinite(entry.confidence) ? entry.confidence : NaN;
    if (!field || !path || !allowedPaths.includes(path) || alreadyUsedPaths.has(path)) continue;
    if (!isCompatible(field, path) || !(confidence >= MIN_AI_CONFIDENCE) || accepted.has(field.key)) continue;
    accepted.set(field.key, { fieldKey: field.key, canonicalPath: path, confidence: Math.min(confidence, MAX_AI_CONFIDENCE) });
  }

  // Un chemin n'est visé que par un champ : le plus sûr le garde.
  const bestByPath = new Map<CanonicalPath, AiMapping>();
  for (const mapping of accepted.values()) {
    const current = bestByPath.get(mapping.canonicalPath);
    if (!current || mapping.confidence > current.confidence) bestByPath.set(mapping.canonicalPath, mapping);
  }
  return [...bestByPath.values()];
}

/** Champs sans rapport avec un devis (civilité, consentements, marketing) : inutile de les soumettre à l'IA. */
const NOISE_LABEL = /\b(civilite|accepte|conditions generales|cgu|newsletter|offres?|partenaires?|consentement|rgpd|cookies?|captcha|robot|recevoir)\b/;

/** Le champ vaut-il un appel à l'IA ? Pas les cases à cocher ni les libellés sans rapport avec un devis. */
export function isWorthAsking(field: FormField): boolean {
  return field.kind !== 'checkbox' && !NOISE_LABEL.test(normalize(field.label));
}

/**
 * Repli sur l'IA pour les champs que les synonymes n'ont pas tranchés. Une panne ou une réponse inutilisable
 * laisse les champs tels quels (incertains) : le remplissage continue avec ce que les synonymes ont trouvé.
 */
export async function resolveWithAi(
  fields: FormField[],
  mappings: Mapping[],
  allowedPaths: readonly CanonicalPath[],
  ask: AskAi,
): Promise<{ mappings: Mapping[]; used: boolean }> {
  const unresolved = new Set(mappings.filter(m => m.status !== 'mapped' && m.source !== 'manual' && m.source !== 'memory').map(m => m.fieldKey));
  const toAsk = fields.filter(field => unresolved.has(field.key) && isWorthAsking(field));
  if (toAsk.length === 0 || allowedPaths.length === 0) return { mappings, used: false };

  let answer: string;
  try {
    answer = await ask(buildAiRequest(toAsk, allowedPaths));
  } catch {
    return { mappings, used: false };
  }
  const usedPaths = new Set(mappings.filter(m => m.canonicalPath).map(m => m.canonicalPath!));
  const resolved = new Map(parseAiResponse(answer, toAsk.slice(0, MAX_FIELDS), allowedPaths, usedPaths).map(m => [m.fieldKey, m]));

  return {
    used: true,
    mappings: mappings.map(mapping => {
      const ai = resolved.get(mapping.fieldKey);
      return ai
        ? { ...mapping, canonicalPath: ai.canonicalPath, confidence: ai.confidence, status: 'mapped' as const, source: 'ai' as const }
        : mapping;
    }),
  };
}
