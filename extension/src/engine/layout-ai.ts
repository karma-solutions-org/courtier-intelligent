import { LAYOUT_SYSTEM_PROMPT, type CanonicalData } from '@shared';
import type { AskAi, AiRequest } from './ai-fallback';
import type { FieldOption, FormAnalysis, FormField } from './analyzer';
import { clientValues, looksLikeClientData, misreadOptions } from './memory';
import { cleanLabel, normalize } from './text';

/**
 * Lecture d'un formulaire inconnu par l'IA (structure seulement) : quand les règles ont mal lu la page (options en double,
 * libellés techniques, cases sans libellé), l'IA voit chaque champ avec le texte qui l'entoure et dit comment le lire.
 * Le résultat corrige l'analyse ; le mapping (synonymes, mémoire, IA) tourne ensuite sur cette analyse corrigée.
 * Aucune valeur du dossier n'est envoyée : les textes qui ressemblent à une donnée client sont retirés.
 */

/** Ce que l'IA a compris de la mise en page, appliqué à l'analyse (clés des champs de l'analyse d'origine). */
export interface FormLayout {
  /** Libellé corrigé d'un champ. */
  labels: Record<string, string>;
  /** Texte réel des options d'un groupe radio ou d'une liste (même valeurs internes, libellés corrigés). */
  options: Record<string, FieldOption[]>;
  /** Cases qui forment une seule valeur, dans l'ordre de la page. */
  groups: { keys: string[]; type: 'date_dmy' | 'date_ymd' | 'segments' }[];
}

export const EMPTY_LAYOUT: FormLayout = { labels: {}, options: {}, groups: [] };

export { LAYOUT_SYSTEM_PROMPT } from '@shared';

const MAX_FIELDS = 60;
const MAX_CONTEXT = 80;
const MAX_OPTIONS = 15;
const MAX_LABEL = 120;

/** Libellé vide ou nom de code (« oSexe », « nb_mois_v4 », « BZeroSanction ») : sans espace, en camelCase ou avec _ ou chiffres. */
const isTechnical = (label: string) => {
  const text = label.trim();
  if (!text) return true;
  if (/\s/.test(text)) return false;
  return /^[a-z]+[A-Z]/.test(text) || /^[A-Z]{1,2}[a-z]+[A-Z]/.test(text) || /_/.test(text) || /[a-z]\d/i.test(text);
};

const isShortBox = (field: FormField) =>
  field.kind === 'text' && field.inputType !== 'segmented' && field.maxLength !== null && field.maxLength <= 6;

/**
 * La lecture par règles est-elle douteuse ? Options en double ou recopiant le nom technique, libellé technique,
 * ou cases courtes consécutives restées séparées (date, téléphone découpés). Sinon, pas d'appel à l'IA.
 */
export function needsLayoutReading(analysis: FormAnalysis): boolean {
  return analysis.fields.some((field, index) => {
    if (misreadOptions(field.options, field.name)) return true;
    // Une option qui reprend la question (« Civilité » comme 1re option) : le texte de la ligne a été pris pour l'option.
    if (field.options.some(option => normalize(option.label) === normalize(field.label))) return true;
    const previous = analysis.fields[index - 1];
    // Cases voisines avec le même libellé : une valeur découpée (date en trois cases) que les règles n'ont pas regroupée.
    if (previous && previous.kind === 'text' && field.kind === 'text' && normalize(previous.label) === normalize(field.label)) return true;
    if (field.kind !== 'checkbox' && isTechnical(field.label)) return true;
    const next = analysis.fields[index + 1];
    // Cases courtes côte à côte dont la suivante n'a pas de vrai libellé : une valeur découpée que les règles n'ont pas reconnue.
    return !!next && isShortBox(field) && isShortBox(next) && isTechnical(next.label);
  });
}

/** Texte écrit autour d'un élément (avant et après, dans son bloc), sans les autres champs. */
function contextOf(element: HTMLElement): { before: string; after: string } {
  const collect = (start: ChildNode | null, step: (node: ChildNode) => ChildNode | null): string => {
    let text = '';
    for (let node = start; node && text.length < MAX_CONTEXT; node = step(node)) {
      if (node instanceof Element && (node.matches('input, select, textarea, br') || node.querySelector('input, select, textarea'))) break;
      text = step === nextOf ? `${text} ${node.textContent ?? ''}` : `${node.textContent ?? ''} ${text}`;
    }
    return cleanLabel(text.replace(/\s+/g, ' ').trim()).slice(0, MAX_CONTEXT);
  };
  const nextOf = (node: ChildNode) => node.nextSibling;
  const previousOf = (node: ChildNode) => node.previousSibling;
  let before = collect(element.previousSibling, previousOf);
  // Libellé de la ligne écrit dans le bloc voisin (« Civilité * » à gauche des boutons).
  for (let block = element.parentElement, level = 0; !before && block && level < 3; block = block.parentElement, level++) {
    const beside = block.previousElementSibling;
    if (beside && !beside.querySelector('input, select, textarea')) before = cleanLabel((beside.textContent ?? '').replace(/\s+/g, ' ').trim()).slice(0, MAX_CONTEXT);
  }
  return { before, after: collect(element.nextSibling, nextOf) };
}

/** Requête de lecture : structure des champs et texte qui les entoure, sans aucune donnée client. */
export function buildLayoutRequest(analysis: FormAnalysis, quoteData?: CanonicalData): AiRequest {
  const values = clientValues(quoteData);
  // Valeurs du dossier retirées même au milieu d'un texte ; un texte qui garde un numéro, un e-mail, une date… n'est pas envoyé.
  const safe = (text: string | null | undefined): string => {
    if (!text) return '';
    let cleaned = text;
    for (const value of values) {
      cleaned = cleaned.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '…');
    }
    return looksLikeClientData(cleaned, values) ? '' : cleaned;
  };
  const fields = analysis.fields.slice(0, MAX_FIELDS).map(field => {
    const elements = analysis.elements.get(field.key) ?? [];
    const first = elements[0] ? contextOf(elements[0]) : { before: '', after: '' };
    return {
      key: field.key,
      type: field.kind === 'text' ? field.inputType : field.kind,
      name: safe(field.name),
      label: safe(field.label),
      section: safe(field.section),
      maxLength: field.maxLength,
      textBefore: safe(first.before),
      textAfter: field.kind === 'radio' ? '' : safe(first.after),
      options: field.options.slice(0, MAX_OPTIONS).map((option, index) => ({
        value: option.value,
        label: safe(option.label),
        // Texte écrit juste après chaque bouton radio : souvent le vrai libellé de l'option.
        ...(field.kind === 'radio' && elements[index] ? { textAfter: safe(contextOf(elements[index]).after) } : {}),
      })),
    };
  });
  return { purpose: 'layout', system: LAYOUT_SYSTEM_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ fields }) }], maxTokens: 2000 };
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const GROUP_TYPES = new Set(['date_dmy', 'date_ymd', 'segments']);

/**
 * Contrôle la réponse : rien n'est cru sur parole. Une clé inconnue, une valeur d'option absente du champ, un libellé
 * vide ou trop long, ou un groupe qui n'est pas fait de cases de texte consécutives est écarté.
 */
export function parseLayoutResponse(text: string, analysis: FormAnalysis): FormLayout {
  const json = extractJson(text);
  if (!json) return EMPTY_LAYOUT;
  const byKey = new Map(analysis.fields.map(field => [field.key, field]));
  const layout: FormLayout = { labels: {}, options: {}, groups: [] };

  const labels = json['labels'];
  if (labels && typeof labels === 'object') {
    for (const [key, label] of Object.entries(labels as Record<string, unknown>)) {
      if (!byKey.has(key) || typeof label !== 'string') continue;
      const cleaned = cleanLabel(label.trim());
      if (cleaned && cleaned.length <= MAX_LABEL) layout.labels[key] = cleaned;
    }
  }

  const options = json['options'];
  if (options && typeof options === 'object') {
    for (const [key, list] of Object.entries(options as Record<string, unknown>)) {
      const field = byKey.get(key);
      if (!field || !Array.isArray(list) || !field.options.length) continue;
      const known = new Set(field.options.map(option => option.value));
      const relabeled = new Map<string, string>();
      for (const entry of list as Record<string, unknown>[]) {
        if (typeof entry?.value !== 'string' || typeof entry?.label !== 'string' || !known.has(entry.value)) continue;
        const label = cleanLabel(entry.label.trim());
        if (label && label.length <= MAX_LABEL) relabeled.set(entry.value, label);
      }
      const corrected = field.options.map(option => ({ value: option.value, label: relabeled.get(option.value) ?? option.label }));
      // Les options corrigées doivent être lisibles (sinon la correction ne vaut rien).
      if (relabeled.size && !misreadOptions(corrected, field.name)) layout.options[key] = corrected;
    }
  }

  const groups = json['groups'];
  if (Array.isArray(groups)) {
    const order = new Map(analysis.fields.map((field, index) => [field.key, index]));
    const taken = new Set<string>();
    for (const group of groups as Record<string, unknown>[]) {
      const keys = Array.isArray(group?.keys) ? (group.keys as unknown[]).filter((k): k is string => typeof k === 'string') : [];
      const type = typeof group?.type === 'string' ? group.type : '';
      if (keys.length < 2 || !GROUP_TYPES.has(type) || keys.some(key => taken.has(key))) continue;
      const positions = keys.map(key => order.get(key));
      const consecutive = positions.every((position, i) => position !== undefined && (i === 0 || position === positions[i - 1]! + 1));
      const boxes = keys.every(key => byKey.get(key)?.kind === 'text' && byKey.get(key)?.inputType !== 'segmented');
      if (!consecutive || !boxes) continue;
      if (type !== 'segments' && keys.length !== 3) continue;
      if (type === 'segments' && keys.some(key => byKey.get(key)?.maxLength === null)) continue;
      keys.forEach(key => taken.add(key));
      layout.groups.push({ keys, type: type as FormLayout['groups'][number]['type'] });
    }
  }
  return layout;
}

/**
 * Applique la lecture de l'IA à une analyse : libellés et options corrigés, cases regroupées en un seul champ (date en
 * trois cases, valeur découpée). L'empreinte ne change pas : la mémoire et le suivi des étapes restent les mêmes.
 */
export function applyLayout(analysis: FormAnalysis, layout: FormLayout): FormAnalysis {
  if (!Object.keys(layout.labels).length && !Object.keys(layout.options).length && !layout.groups.length) return analysis;
  const grouped = new Map(layout.groups.map(group => [group.keys[0], group]));
  const absorbed = new Set(layout.groups.flatMap(group => group.keys.slice(1)));
  const fields: FormField[] = [];
  const elements = new Map<string, HTMLElement[]>();

  for (const field of analysis.fields) {
    if (absorbed.has(field.key)) continue;
    let next: FormField = {
      ...field,
      label: layout.labels[field.key] ?? field.label,
      options: layout.options[field.key] ?? field.options,
    };
    let own = analysis.elements.get(field.key) ?? [];
    const group = grouped.get(field.key);
    if (group) {
      const parts = group.keys.map(key => analysis.fields.find(f => f.key === key)!);
      own = group.keys.flatMap(key => analysis.elements.get(key) ?? []);
      next =
        group.type === 'segments'
          ? { ...next, inputType: 'segmented', segments: parts.map(part => part.maxLength ?? 0), maxLength: null }
          : { ...next, kind: 'date', inputType: group.type === 'date_dmy' ? 'split-dmy' : 'split-ymd', maxLength: null };
    }
    fields.push({ ...next, order: fields.length });
    elements.set(next.key, own);
  }
  return { fields, elements, fingerprint: analysis.fingerprint };
}

/** Lecture complète : appelle l'IA si besoin et renvoie la mise en page validée (vide en cas de panne). */
export async function readLayoutWithAi(analysis: FormAnalysis, ask: AskAi, quoteData?: CanonicalData): Promise<{ layout: FormLayout; used: boolean }> {
  if (!needsLayoutReading(analysis)) return { layout: EMPTY_LAYOUT, used: false };
  try {
    const answer = await ask(buildLayoutRequest(analysis, quoteData));
    return { layout: parseLayoutResponse(answer, analysis), used: true };
  } catch {
    return { layout: EMPTY_LAYOUT, used: false };
  }
}
