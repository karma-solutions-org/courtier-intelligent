import { CANONICAL_PATHS, CanonicalPath, isCanonicalPath } from '@shared';
import type { FormField } from './analyzer';
import { COMPATIBLE_KINDS, FIELD_SYNONYMS, INHERITED_LABELS, PATH_EXPECTED, PREFIX_KEYWORDS } from './field-synonyms';
import { containsPhrase, normalize, words } from './text';

/** Confiance à partir de laquelle un mapping est retenu sans l'IA. */
export const ACCEPT_THRESHOLD = 0.75;
/** En dessous, le champ est considéré comme non trouvé ; entre les deux, il est « incertain » (repli sur l'IA). */
export const UNCERTAIN_THRESHOLD = 0.4;
/** Deux candidats à moins de cet écart : le mapping est ambigu. */
const AMBIGUITY_GAP = 0.05;

export type MappingStatus = 'mapped' | 'uncertain' | 'unmapped';
export type MappingSource = 'heuristic' | 'ai' | 'manual' | 'memory';

export interface Candidate {
  path: CanonicalPath;
  score: number;
}

export interface Mapping {
  fieldKey: string;
  /** Chemin canonique retenu : toujours dans la liste fermée, ou null. */
  canonicalPath: CanonicalPath | null;
  confidence: number;
  status: MappingStatus;
  source: MappingSource;
  /** Meilleurs candidats (pour l'IA et la correction manuelle). */
  candidates: Candidate[];
}

/** Chemins « texte » que les extranets proposent volontiers dans une liste déroulante. */
const SELECTABLE_TEXT_PATHS: ReadonlySet<CanonicalPath> = new Set<CanonicalPath>([
  'vehicle.brand',
  'vehicle.model',
  'vehicle.version',
  'client.address.country',
  'client.address.city',
  'driver.profession',
  'insuranceHistory.previousInsurer',
]);

/** Compatibilité entre le type HTML du champ et ce que le chemin canonique attend. */
export function isCompatible(field: FormField, path: CanonicalPath): boolean {
  if (!COMPATIBLE_KINDS[PATH_EXPECTED[path]].includes(field.kind)) return false;
  // Un champ e-mail ou téléphone ne reçoit que l'e-mail ou le téléphone, et inversement.
  // Une liste déroulante ne porte un texte que pour les valeurs qu'un extranet propose en liste.
  if (field.kind === 'select' && PATH_EXPECTED[path] === 'text' && !SELECTABLE_TEXT_PATHS.has(path)) return false;
  if (field.inputType === 'email' && !path.endsWith('.email')) return false;
  if (field.inputType === 'tel' && !path.endsWith('.phone')) return false;
  return true;
}

/** Mots de « confirmation » retirés avant la comparaison : « Confirmez votre e-mail » se lit comme « votre e-mail ». */
const CONFIRMATION_WORDS = /\b(confirmez|confirmer|confirmation|ressaisissez|ressaisir|repetez|retapez)\b/g;

const camelSplit = (text: string): string => text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

function prefixOf(path: CanonicalPath): string {
  return path.split('.')[0];
}

/** Famille(s) de chemins que le contexte (libellé + section) évoque. */
function contextPrefixes(field: FormField): Set<string> {
  const context = `${field.label} ${field.section ?? ''}`;
  const found = new Set<string>();
  for (const [prefix, keywords] of Object.entries(PREFIX_KEYWORDS)) {
    if (keywords.some(keyword => containsPhrase(context, keyword))) found.add(prefix);
  }
  return found;
}

/**
 * Note de 0 à 1 : ce champ correspond-il à ce chemin canonique ? Libellé (exact, puis contenu), attributs
 * `autocomplete`, noms techniques et texte d'aide, puis ajustement selon le contexte (section « Conducteur »…).
 */
export function scoreCandidate(field: FormField, path: CanonicalPath): number {
  if (!isCompatible(field, path)) return 0;
  const spec = FIELD_SYNONYMS[path];
  const label = normalize(field.label).replace(CONFIRMATION_WORDS, ' ').replace(/\s+/g, ' ').trim();
  const prefixes = contextPrefixes(field);
  let score = 0;
  /** Libellé identique à un synonyme : le contexte ne le contredit pas (« Êtes-vous actuellement assuré ? »). */
  let exactLabel = false;

  if (field.autocomplete && spec.autocomplete?.includes(field.autocomplete)) {
    score = Math.max(score, 0.95);
  }
  if (label) {
    const labelWords = words(label).length;
    for (const synonym of spec.labels) {
      if (label === normalize(synonym)) {
        score = Math.max(score, 0.9);
        exactLabel = true;
      } else if (containsPhrase(label, synonym)) {
        const coverage = Math.min(1, words(synonym).length / labelWords);
        score = Math.max(score, 0.55 + 0.3 * coverage);
      }
    }
  }
  // Dans la section du conducteur, un simple « Nom » ou « Date de naissance » est celui du conducteur.
  const inherited = INHERITED_LABELS[path];
  if (inherited && prefixes.has('driver') && FIELD_SYNONYMS[inherited].labels.some(synonym => label === normalize(synonym))) {
    score = Math.max(score, 0.7);
  }
  const identifier = normalize(camelSplit(field.name ?? field.id ?? ''));
  if (identifier && spec.names) {
    const compact = identifier.replace(/ /g, '');
    for (const token of spec.names) {
      if (containsPhrase(identifier, token) || (token.length >= 4 && compact.includes(token))) score = Math.max(score, 0.6);
    }
  }
  const placeholder = normalize(field.placeholder);
  if (placeholder && spec.labels.some(synonym => normalize(synonym) === placeholder)) {
    score = Math.max(score, 0.5);
  }
  if (score === 0) return 0;

  // Le contexte départage les familles : « Nom » sous « Conducteur » est le nom du conducteur.
  // Dans la section du conducteur, le « Nom » exact du souscripteur n'est pas le bon : celui du conducteur prime.
  const shadowedByDriver = prefixes.has('driver') && Object.values(INHERITED_LABELS).includes(path);
  if (prefixes.size > 0) {
    if (prefixes.has(prefixOf(path))) score += 0.1;
    else if (!exactLabel || shadowedByDriver) score -= 0.25;
  }
  return Math.max(0, Math.min(1, score));
}

/** Les trois meilleurs chemins candidats d'un champ. */
export function rankCandidates(field: FormField): Candidate[] {
  return CANONICAL_PATHS.map(path => ({ path, score: scoreCandidate(field, path) }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** Un champ « confirmation » (ressaisie de l'e-mail…) reçoit la même valeur que le champ d'origine. */
const isConfirmation = (field: FormField): boolean => /confirm|ressaisi|repet|retapez|verification/.test(normalize(field.label));

/**
 * Associe chaque champ du formulaire à un chemin canonique (liste fermée), par synonymes et scoring.
 * - confiance ≥ 0,75 et sans ambiguïté : `mapped` ;
 * - entre 0,4 et 0,75, ou deux candidats à égalité : `uncertain` (repli sur l'IA) ;
 * - sinon `unmapped` : le champ reste vide, jamais de valeur inventée.
 * Deux champs ne visent pas le même chemin (sauf confirmation) : le mieux noté le garde.
 */
export function mapFields(fields: FormField[]): Mapping[] {
  const mappings = fields.map((field): Mapping => {
    const candidates = rankCandidates(field);
    const [best, second] = candidates;
    if (!best || best.score < UNCERTAIN_THRESHOLD) {
      return { fieldKey: field.key, canonicalPath: null, confidence: best?.score ?? 0, status: 'unmapped', source: 'heuristic', candidates };
    }
    const ambiguous = !!second && second.score >= UNCERTAIN_THRESHOLD && best.score - second.score < AMBIGUITY_GAP;
    if (best.score >= ACCEPT_THRESHOLD && !ambiguous) {
      return { fieldKey: field.key, canonicalPath: best.path, confidence: best.score, status: 'mapped', source: 'heuristic', candidates };
    }
    return { fieldKey: field.key, canonicalPath: null, confidence: best.score, status: 'uncertain', source: 'heuristic', candidates };
  });

  // Un chemin n'est visé que par un champ : le mieux noté le garde, les autres redeviennent incertains.
  const byPath = new Map<CanonicalPath, Mapping[]>();
  for (const mapping of mappings) {
    if (mapping.canonicalPath) byPath.set(mapping.canonicalPath, [...(byPath.get(mapping.canonicalPath) ?? []), mapping]);
  }
  const fieldByKey = new Map(fields.map(field => [field.key, field]));
  for (const group of byPath.values()) {
    if (group.length < 2) continue;
    const winner = group.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    for (const mapping of group) {
      if (mapping !== winner && !isConfirmation(fieldByKey.get(mapping.fieldKey)!)) {
        mapping.canonicalPath = null;
        mapping.status = 'uncertain';
      }
    }
  }
  return mappings;
}

/** Contrôle qu'un chemin vient de la liste fermée : ni l'IA, ni la correction manuelle ne peuvent en inventer. */
export function asCanonicalPath(path: unknown): CanonicalPath | null {
  return typeof path === 'string' && isCanonicalPath(path) ? path : null;
}
