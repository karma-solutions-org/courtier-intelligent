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
  /** Version du véhicule : si aucune option ne correspond exactement, choisir la désignation la plus proche (`matchVersion`). */
  version?: boolean;
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
  // Énergie du véhicule : les extranets reprennent souvent les codes de la carte grise (P.3).
  diesel: ['diesel', 'gazole', 'gasoil', 'go'],
  essence: ['essence', 'es', 'sans plomb', 'super'],
  hybride: ['hybride', 'hybride essence', 'hybride diesel', 'eh', 'gh'],
  hybride_rechargeable: ['hybride rechargeable', 'phev', 'ee', 'gl'],
  electrique: ['electrique', 'el', 'electricite'],
  gpl: ['gpl', 'gaz de petrole liquefie', 'pe'],
  ethanol: ['ethanol', 'e85', 'superethanol', 'fe'],
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

// ── Immatriculation : avec ou sans séparateurs, selon ce que demande l'extranet ──

/** Texte affiché autour du champ (consigne « sans espace et sans tiret », exemple « AA001AA »…). */
function nearbyText(element: HTMLElement): string {
  // On remonte tant que le bloc reste petit (le cadre « Par immatriculation »), sans aller jusqu'à la page entière.
  let text = '';
  let node: HTMLElement | null = element.parentElement;
  for (let level = 0; level < 8 && node; level++, node = node.parentElement) {
    const content = node.textContent ?? '';
    if (content.length > 1500) break;
    text = content;
  }
  return text;
}

/**
 * Plaque à saisir : « CM-359-VC » devient « CM359VC » quand l'extranet la veut collée (consigne affichée près du champ,
 * exemple sans séparateur, ou champ trop court pour les tirets). Sinon, la plaque est saisie telle qu'au dossier.
 */
export function registrationFor(field: FormField, element: HTMLElement | undefined, value: FillValue): FillValue {
  if (typeof value !== 'string') return value;
  const compact = value.replace(/[\s-]+/g, '').toUpperCase();
  if (compact === value) return value;
  const around = normalize(`${field.label} ${field.placeholder ?? ''} ${element ? nearbyText(element) : ''}`);
  const wantsCompact =
    /sans (espace|tiret)/.test(around) ||
    /\b[a-z]{2}\d{3}[a-z]{2}\b/.test(around) ||
    (field.maxLength !== null && field.maxLength < value.length);
  return wantsCompact ? compact : value;
}

/**
 * Version du véhicule (« 2.0 90 ch Gazole Fourgon (FLA0A6) ») face aux désignations d'un extranet (« 2.0 DCI 90 L1H1… ») :
 * on compte les éléments communs, les nombres (cylindrée, puissance) comptant double. L'option retenue doit avoir au moins
 * un nombre en commun et devancer nettement les autres ; sinon `null` (le courtier choisit).
 */
export function matchVersion(options: FieldOption[], value: FillValue): FieldOption | null {
  if (typeof value !== 'string') return null;
  const tokens = new Set(words(value.replace(/[()]/g, ' ')));
  const isNumber = (token: string) => /^\d+(\.\d+)?$/.test(token);
  // « 2.0 » s'écrit aussi « 2,0 » ou « 2l » : la virgule est déjà un séparateur pour `words`, on garde aussi « 2 0 ».
  const scored = options
    .filter(option => option.value !== '' || option.label !== '')
    .map(option => {
      const label = words(option.label.replace(/(\d),(\d)/g, '$1.$2'));
      let score = 0;
      let numbers = 0;
      for (const token of new Set(label)) {
        if (!tokens.has(token)) continue;
        if (isNumber(token)) {
          score += 2;
          numbers += 1;
        } else score += 1;
      }
      return { option, score, numbers };
    })
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.numbers === 0 || best.score < 3) return null;
  return !second || best.score > second.score ? best.option : null;
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

/** Options actuelles de la liste : elle a pu être rechargée depuis l'analyse (liste dépendante d'une autre). */
function liveOptions(element: HTMLSelectElement): FieldOption[] {
  return [...element.options].map(option => ({ value: option.value, label: (option.textContent ?? '').trim() }));
}

/**
 * Choisit l'option qui correspond, d'après la liste ACTUELLE (pas celle de l'analyse). Déjà choisie : rien n'est touché,
 * car rechoisir la même marque relance chez certains extranets le chargement des modèles (et vide le modèle choisi).
 * Vérifie ensuite le libellé gardé (la valeur interne d'une option peut changer quand la liste est reconstruite).
 */
function fillSelect(field: FormField, element: HTMLSelectElement, value: FillValue, fillOptions: FillOptions = {}): FillResult {
  const options = liveOptions(element);
  const candidates = options.length > 1 ? options : field.options;
  const option = matchOption(candidates, value) ?? (fillOptions.version ? matchVersion(candidates, value) : null);
  if (!option) return fail(field, `Aucune option ne correspond à « ${String(value)} ».`);
  const index = options.findIndex(o => o.value === option.value && o.label === option.label);
  const selected = () => normalize(element.options[element.selectedIndex]?.textContent) === normalize(option.label);
  if (index >= 0 && element.selectedIndex === index) return ok(field);
  element.focus();
  if (index >= 0) element.selectedIndex = index;
  else element.value = option.value;
  fire(element, 'input');
  fire(element, 'change');
  blur(element);
  return selected() ? ok(field) : fail(field, "L'option n'a pas pu être sélectionnée.");
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
        return fillSelect(field, element as HTMLSelectElement, value, options);
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
