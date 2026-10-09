import type { FieldOption, FormField } from './analyzer';
import type { FillValue } from './plan';
import { containsPhrase, normalize, words } from './text';

export type FillStatus = 'filled' | 'failed';

export interface FillResult {
  fieldKey: string;
  status: FillStatus;
  /** Pourquoi le champ n'a pas pu être rempli (affiché dans le side panel). */
  reason?: string;
}

export interface FillOptions {
  /** Attente maximale des suggestions d'un champ à saisie assistée. */
  suggestionTimeoutMs?: number;
  /** La valeur est une date (AAAA-MM-JJ) à écrire dans le format du champ, même si c'est un champ de texte. */
  date?: boolean;
}

// ── Événements : les extranets (React, Angular…) n'écoutent pas la propriété `value`, mais ces événements ──

function fire(element: Element, type: string, init: EventInit = {}): void {
  element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, ...init }));
}

/** Écrit `value` comme le fait un navigateur (le setter natif contourne le suivi de valeur de React), puis notifie. */
function typeInto(element: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  element.focus();
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  if (setter) setter.call(element, text);
  else element.value = text;
  element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
  fire(element, 'change');
}

function blur(element: HTMLElement): void {
  element.blur();
  fire(element, 'blur', { bubbles: false });
  fire(element, 'focusout');
}

// ── Valeurs ─────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** Format de date attendu par un champ texte, déduit de son texte d'aide, de son motif ou de son libellé. */
export function dateFormatOf(field: FormField): 'dd/MM/yyyy' | 'MM/yyyy' | 'yyyy-MM-dd' | 'dd-MM-yyyy' | 'ddMMyyyy' {
  const hint = `${field.placeholder ?? ''} ${field.pattern ?? ''} ${field.label}`.toLowerCase();
  if (/aaaa-mm-jj|yyyy-mm-dd/.test(hint)) return 'yyyy-MM-dd';
  if (/jj-mm-aaaa|dd-mm-yyyy/.test(hint)) return 'dd-MM-yyyy';
  if (/jjmmaaaa|ddmmyyyy/.test(hint)) return 'ddMMyyyy';
  if (/\bmm\/(aaaa|yyyy)\b/.test(hint) && !/jj\/mm|dd\/mm/.test(hint)) return 'MM/yyyy';
  return 'dd/MM/yyyy';
}

/** Date ISO (AAAA-MM-JJ) → texte du champ. `null` si la date est invalide. */
export function formatDate(iso: string, field: FormField): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, year, month, day] = match;
  if (Number.isNaN(Date.parse(iso))) return null;
  if (field.inputType === 'date') return iso;
  if (field.inputType === 'month') return `${year}-${month}`;
  switch (dateFormatOf(field)) {
    case 'yyyy-MM-dd':
      return iso;
    case 'dd-MM-yyyy':
      return `${day}-${month}-${year}`;
    case 'ddMMyyyy':
      return `${day}${month}${year}`;
    case 'MM/yyyy':
      return `${month}/${year}`;
    default:
      return `${day}/${month}/${year}`;
  }
}

// ── Choix (select, radio) : valeurs canoniques → libellés de l'extranet ─────

/** Façons de nommer, chez un assureur, les valeurs canoniques du questionnaire. */
const CHOICE_SYNONYMS: Record<string, string[]> = {
  prive: ['prive', 'personnel', 'loisirs', 'promenade', 'usage prive'],
  prive_trajet: ['trajet', 'trajets', 'domicile travail', 'prive et trajet'],
  professionnel: ['professionnel', 'pro', 'affaires', 'deplacements professionnels', 'tournees'],
  garage_prive: ['garage', 'box', 'garage ferme', 'garage prive'],
  parking_ferme: ['parking ferme', 'parking', 'parking securise', 'parking prive'],
  voie_publique: ['voie publique', 'rue', 'dans la rue', 'sur la voie publique'],
  voiture: ['voiture', 'vp', 'vehicule de tourisme', 'tourisme', 'auto'],
  utilitaire: ['utilitaire', 'vu', 'camionnette', 'vehicule utilitaire'],
  moto: ['moto', 'deux roues', '2 roues', 'motocyclette'],
  AAC: ['aac', 'conduite accompagnee'],
  non_paiement: ['non paiement', 'defaut de paiement', 'impaye', 'cotisation'],
  sinistres: ['sinistre', 'sinistralite'],
  fausse_declaration: ['fausse declaration', 'declaration inexacte'],
  alcoolemie: ['alcool', 'alcoolemie', 'stupefiants'],
  autre: ['autre', 'autres'],
};

const YES = ['oui', 'yes', 'true', 'vrai', '1', 'o', 'y'];
const NO = ['non', 'no', 'false', 'faux', '0', 'n'];

/**
 * Option de l'extranet qui correspond à une valeur canonique. Par ordre : valeur identique, libellé identique,
 * synonymes connus, puis recouvrement des mots. `null` si rien ne correspond de façon sûre (aucune option au hasard).
 */
export function matchOption(options: FieldOption[], value: FillValue): FieldOption | null {
  const candidates = options.filter(option => option.value !== '' || option.label !== '');
  if (typeof value === 'boolean') {
    const accepted = value ? YES : NO;
    return candidates.find(o => accepted.includes(normalize(o.label)) || accepted.includes(normalize(o.value))) ?? null;
  }
  const wanted = String(value);
  const wantedNorm = normalize(wanted);

  const exact =
    candidates.find(o => o.value === wanted) ??
    candidates.find(o => normalize(o.value) === wantedNorm) ??
    candidates.find(o => normalize(o.label) === wantedNorm);
  if (exact) return exact;

  const synonyms = CHOICE_SYNONYMS[wanted] ?? [];
  const bySynonym =
    candidates.find(o => synonyms.some(s => normalize(s) === normalize(o.label))) ??
    candidates.find(o => synonyms.some(s => containsPhrase(o.label, s)));
  if (bySynonym) return bySynonym;

  const wantedWords = words(wanted.replace(/_/g, ' '));
  if (wantedWords.length > 0) {
    const overlapping = candidates.filter(o => wantedWords.every(word => words(o.label).includes(word)));
    if (overlapping.length === 1) return overlapping[0];
  }
  return null;
}

// ── Remplissage par type de champ ───────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function fail(field: FormField, reason: string): FillResult {
  return { fieldKey: field.key, status: 'failed', reason };
}
const ok = (field: FormField): FillResult => ({ fieldKey: field.key, status: 'filled' });

function fillText(field: FormField, element: HTMLInputElement | HTMLTextAreaElement, value: FillValue, options: FillOptions): FillResult {
  if (typeof value === 'boolean') return fail(field, 'Une réponse oui/non ne se saisit pas dans un champ de texte.');
  const asDate = field.kind === 'date' || options.date === true;
  const text = asDate ? (typeof value === 'string' ? formatDate(value, field) : null) : String(value);
  if (text === null) return fail(field, `Date illisible : ${String(value)}`);
  // Un navigateur ne tronque pas une valeur écrite par script : la longueur maximale se contrôle ici.
  if (field.maxLength !== null && text.length > field.maxLength) {
    return fail(field, `La valeur dépasse la longueur maximale du champ (${field.maxLength} caractères).`);
  }
  if (field.kind === 'number' && typeof value !== 'number' && Number.isNaN(Number(value))) return fail(field, `Nombre attendu : ${String(value)}`);

  typeInto(element, text);
  blur(element);
  // Vérifie ce que l'extranet a gardé (longueur maximale, masque de saisie…).
  const kept = element.value;
  if (field.kind === 'date' && field.inputType === 'date' ? kept !== text : normalize(kept) !== normalize(text)) {
    return fail(field, `L'extranet n'a pas accepté la valeur (« ${kept} »).`);
  }
  return ok(field);
}

function fillSelect(field: FormField, element: HTMLSelectElement, value: FillValue): FillResult {
  const option = matchOption(field.options, value);
  if (!option) return fail(field, `Aucune option ne correspond à « ${String(value)} ».`);
  element.focus();
  element.value = option.value;
  fire(element, 'input');
  fire(element, 'change');
  blur(element);
  return element.value === option.value ? ok(field) : fail(field, "L'option n'a pas pu être sélectionnée.");
}

function fillRadio(field: FormField, radios: HTMLElement[], value: FillValue): FillResult {
  const option = matchOption(field.options, value);
  if (!option) return fail(field, `Aucune option ne correspond à « ${String(value)} ».`);
  const radio = radios.find(el => (el as HTMLInputElement).value === option.value) as HTMLInputElement | undefined;
  if (!radio) return fail(field, "Le bouton radio est introuvable.");
  if (!radio.checked) radio.click(); // `click()` coche et émet input + change, comme un clic réel
  return radio.checked ? ok(field) : fail(field, "Le choix n'a pas pu être coché.");
}

function fillCheckbox(field: FormField, element: HTMLInputElement, value: FillValue): FillResult {
  if (typeof value !== 'boolean') return fail(field, 'Réponse oui/non attendue pour une case à cocher.');
  if (element.checked !== value) element.click();
  return element.checked === value ? ok(field) : fail(field, "La case n'a pas pu être modifiée.");
}

/** Champ à saisie assistée : on saisit, on attend les suggestions, on choisit celle qui correspond. */
async function fillAutocomplete(field: FormField, element: HTMLInputElement, value: FillValue, options: FillOptions): Promise<FillResult> {
  if (typeof value === 'boolean') return fail(field, 'Une réponse oui/non ne se saisit pas dans un champ de texte.');
  const text = String(value);
  typeInto(element, text);
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text.slice(-1) }));

  // Liste de suggestions HTML5 (datalist) : la valeur saisie suffit.
  if (element.hasAttribute('list') && element.list) {
    blur(element);
    return ok(field);
  }
  const doc = element.ownerDocument;
  const controlled = element.getAttribute('aria-controls');
  const deadline = Date.now() + (options.suggestionTimeoutMs ?? 1500);
  const wanted = normalize(text);
  while (Date.now() < deadline) {
    const root: ParentNode = (controlled && doc.getElementById(controlled)) || doc;
    const suggestions = [...root.querySelectorAll<HTMLElement>('[role="option"], [role="listbox"] li')];
    const match =
      suggestions.find(s => normalize(s.textContent) === wanted) ?? suggestions.find(s => normalize(s.textContent).includes(wanted));
    if (match) {
      match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      match.click();
      blur(element);
      return ok(field);
    }
    await sleep(40);
  }
  // Pas de suggestion : le texte saisi est conservé (certains extranets l'acceptent tel quel).
  blur(element);
  return ok(field);
}

/**
 * Remplit un champ avec les événements qu'attendent les extranets (focus, input, change, blur).
 * Gère text, textarea, number, date, select, radio, case à cocher et saisie assistée ; vérifie ensuite la valeur gardée.
 */
export async function fillField(field: FormField, elements: HTMLElement[], value: FillValue, options: FillOptions = {}): Promise<FillResult> {
  const element = elements[0];
  if (!element?.isConnected) return fail(field, "Le champ n'est plus dans la page.");
  try {
    switch (field.kind) {
      case 'select':
        return fillSelect(field, element as HTMLSelectElement, value);
      case 'radio':
        return fillRadio(field, elements, value);
      case 'checkbox':
        return fillCheckbox(field, element as HTMLInputElement, value);
      case 'autocomplete':
        return await fillAutocomplete(field, element as HTMLInputElement, value, options);
      default:
        return fillText(field, element as HTMLInputElement | HTMLTextAreaElement, value, options);
    }
  } catch (error) {
    return fail(field, error instanceof Error ? error.message : 'Erreur inattendue.');
  }
}
