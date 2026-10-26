import { FORBIDDEN_NAV_LABEL } from '@shared';
import { analyzeForm, customValueOf, isLabelStyledChoice, type FieldOption, type FormField } from './analyzer';
import type { FillValue } from './plan';
import { containsPhrase, normalize, words } from './text';
import { yesNoFromChoice } from './yes-no';

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
  /** Attente maximale d'une liste qui se charge (dépendante d'un autre champ). */
  listTimeoutMs?: number;
  /** Adresse, ville : l'extranet peut proposer des suggestions sous le champ (sans rôle ARIA) ; on choisit la bonne. */
  suggest?: boolean;
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
  // Beaucoup d'extranets (jQuery…) réagissent au clavier : liste des villes chargée au keyup du code postal, etc.
  const key = text.slice(-1);
  for (const type of ['keydown', 'keypress', 'keyup']) {
    element.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key }));
  }
  fire(element, 'change');
}

function blur(element: HTMLElement): void {
  element.blur();
  fire(element, 'blur', { bubbles: false });
  fire(element, 'focusout');
}

// ── Valeurs ─────────────────────────────────────────────────────────────────

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
  // Civilité : « Monsieur / Madame » (Zephir) ↔ « Homme / Femme » (Oyat).
  Monsieur: ['homme', 'masculin', 'monsieur', 'm', 'mr'],
  Madame: ['femme', 'feminin', 'madame', 'mme'],
  non_paiement: ['non paiement', 'defaut de paiement', 'impaye', 'cotisation'],
  sinistres: ['sinistre', 'sinistralite'],
  fausse_declaration: ['fausse declaration', 'declaration inexacte'],
  alcoolemie: ['alcool', 'alcoolemie', 'stupefiants'],
  autre: ['autre', 'autres'],
  // Catégorie socio-professionnelle.
  salarie_prive: ['salarie', 'salarie du prive', 'salarie secteur prive', 'employe', 'salarie non cadre'],
  salarie_public: ['fonctionnaire', 'salarie du public', 'agent public', 'secteur public'],
  cadre: ['cadre', 'cadre superieur', 'profession intermediaire'],
  artisan_commercant: ['artisan', 'commercant', 'artisan commercant', 'chef d entreprise'],
  profession_liberale: ['profession liberale', 'liberal', 'travailleur independant'],
  retraite: ['retraite', 'retraites'],
  etudiant: ['etudiant', 'eleve', 'apprenti'],
  sans_profession: ['sans profession', 'sans emploi', 'demandeur d emploi', 'chomeur', 'au foyer'],
  // Type de sinistre.
  materiel: ['materiel', 'dommages materiels', 'accident materiel', 'dommage materiel'],
  corporel: ['corporel', 'dommages corporels', 'accident corporel', 'dommage corporel'],
  bris_de_glace: ['bris de glace', 'bris de glaces', 'bdg', 'vitrage'],
  vol: ['vol', 'vol du vehicule', 'tentative de vol'],
  incendie: ['incendie', 'feu'],
  // Énergie du véhicule : les extranets reprennent souvent les codes de la carte grise (P.3).
  diesel: ['diesel', 'gazole', 'gasoil', 'go'],
  essence: ['essence', 'es', 'sans plomb', 'super'],
  hybride: ['hybride', 'hybride essence', 'hybride diesel', 'eh', 'gh'],
  hybride_rechargeable: ['hybride rechargeable', 'phev', 'ee', 'gl'],
  electrique: ['electrique', 'el', 'electricite'],
  gpl: ['gpl', 'gaz de petrole liquefie', 'pe'],
  ethanol: ['ethanol', 'e85', 'superethanol', 'fe'],
};

const YES = ['oui','yes', 'true', 'vrai', '1', 'o', 'y'];
const NO = ['non', 'no', 'false', 'faux', '0', 'n'];

/** Intervalle numérique lu dans le libellé d'une option (« moins de 9 mois », « de 9 à 23 mois », « 24 mois et plus »). */
export interface OptionRange {
  min: number;
  max: number;
}

/**
 * Lit un intervalle dans un libellé ; `null` si ce n'en est pas un. Les années sont converties en mois quand le libellé
 * parle d'années (`monthsPerYear`), car l'ancienneté du dossier est en mois. « Non, aucune assurance » vaut 0.
 */
export function parseRange(label: string, monthsPerYear = 12): OptionRange | null {
  const text = normalize(label);
  if (/^(non|aucun|aucune|jamais)\b/.test(text) && !/\d/.test(text)) return { min: 0, max: 0 };
  const factor = /\bans?\b|\bannees?\b/.test(text) && !/\bmois\b/.test(text) ? monthsPerYear : 1;
  const numbers = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => Number(n.replace(',', '.')) * factor);
  if (numbers.length === 0) return null;
  if (numbers.length >= 2 && /\b(de|entre)\b/.test(text)) return { min: numbers[0], max: numbers[1] };
  if (/\b(moins de|inferieur|jusqu a|max)\b/.test(text)) return { min: 0, max: numbers[0] - (factor === 1 ? 1 : 0.001) };
  if (/\b(et plus|ou plus|plus de|au moins|superieur|minimum|et \+)\b/.test(text) || /\+\s*$/.test(label)) {
    return { min: /plus de|superieur/.test(text) ? numbers[0] + (factor === 1 ? 1 : 0.001) : numbers[0], max: Infinity };
  }
  return null;
}

/** Option dont l'intervalle contient la valeur (une seule, sinon `null`). */
function matchRange(options: FieldOption[], value: number): FieldOption | null {
  const containing = options.filter(option => {
    const range = parseRange(option.label);
    return range !== null && value >= range.min && value <= range.max;
  });
  return containing.length === 1 ? containing[0] : null;
}

/**
 * Option de l'extranet qui correspond à une valeur canonique. Par ordre : valeur identique, libellé identique,
 * synonymes connus, puis recouvrement des mots. `null` si rien ne correspond de façon sûre (aucune option au hasard).
 */
export function matchOption(options: FieldOption[], value: FillValue): FieldOption | null {
  const candidates = options.filter(option => option.value !== '' || option.label !== '');
  if (typeof value === 'boolean') {
    const accepted = value ? YES : NO;
    // La valeur interne (« 1 », « 0 ») ne compte que sans libellé lisible : des options numérotées 0, 1, 2… ne sont pas oui / non.
    const exact =
      candidates.find(o => accepted.includes(normalize(o.label))) ??
      candidates.find(o => normalize(o.label) === '' && accepted.includes(normalize(o.value)));
    if (exact) return exact;
    // « Non, aucune assurance » / « Oui, au moins un » : la seule option qui commence par non / oui.
    const phrased = value ? /^(oui|yes)\b/ : /^(non|aucun|aucune|jamais)\b/;
    const starting = candidates.filter(o => phrased.test(normalize(o.label)));
    return starting.length === 1 ? starting[0] : null;
  }
  // Question Oui / Non déduite d'un choix du dossier (« Garage » ← lieu de stationnement « garage privé »).
  const impliedYesNo = typeof value === 'string' ? yesNoFromChoice(value) : undefined;
  if (impliedYesNo !== undefined && candidates.some(o => YES.includes(normalize(o.label)))) {
    return matchOption(candidates, impliedYesNo);
  }
  const wanted = String(value);
  const wantedNorm = normalize(wanted);

  // Le libellé lisible passe avant la valeur interne : un code « 2 » peut désigner l'option « 1 sinistre ».
  const byLabel = candidates.find(o => normalize(o.label) === wantedNorm);
  if (byLabel) return byLabel;
  if (typeof value === 'number' && Number.isInteger(value)) {
    // « 15 000 € », « 2 sinistres » : un seul nombre dans le libellé, comparé chiffres seuls.
    const sameNumber = candidates.filter(o => {
      const numbers = o.label.match(/\d[\d\s\u00a0\u202f.]*\d|\d/g) ?? [];
      return numbers.length === 1 && numbers[0].replace(/\D/g, '') === String(Math.abs(value)) && parseRange(o.label) === null;
    });
    if (sameNumber.length === 1) return sameNumber[0];
  }
  const exact = candidates.find(o => o.value === wanted) ?? candidates.find(o => normalize(o.value) === wantedNorm);
  if (exact) return exact;
  if (typeof value === 'number') {
    const inRange = matchRange(candidates, value);
    if (inRange) return inRange;
  }

  const synonyms = CHOICE_SYNONYMS[wanted] ?? [];
  const bySynonym =
    candidates.find(o => synonyms.some(s => normalize(s) === normalize(o.label))) ??
    candidates.find(o => synonyms.some(s => containsPhrase(o.label, s)));
  if (bySynonym) return bySynonym;

  const wantedWords = words(wanted.replace(/_/g, ' '));
  if (wantedWords.length > 0) {
    const overlapping = candidates.filter(o => wantedWords.every(word => words(o.label).includes(word)));
    if (overlapping.length === 1) return overlapping[0];
    // Dernier recours : l'option qui partage le plus de mots (début de mot, 4 lettres au moins : « prive » ↔ « privé »,
    // « salarie » ↔ « salariés »), si elle est seule en tête.
    const near = (a: string, b: string) => a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
    const scored = candidates
      .map(o => ({ o, score: wantedWords.filter(w => words(o.label).some(l => l === w || near(l, w))).length }))
      .sort((a, b) => b.score - a.score);
    if (scored[0]?.score > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) return scored[0].o;
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

/** Mots d'une désignation, nombres détachés des lettres : « 2.5DCI » → 2, 5, dci ; « 140CH » → 140, ch. */
const versionWords = (text: string) => words(text.replace(/[()]/g, ' ').replace(/(\d)([a-z])/gi, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2'));

/**
 * Version du véhicule (« 2.0 90 ch Gazole Fourgon (FLA0A6) ») face aux désignations d'un extranet (« 2.0 DCI 90 L1H1… ») :
 * on compte les éléments communs, les nombres (cylindrée, puissance) comptant double. Le courtier n'intervient pas :
 * il faut toujours une désignation pour obtenir le tarif. À égalité (la finition n'est pas connue au dossier), la
 * première de la liste l'emporte ; sans aucun nombre en commun, la première option de la liste.
 */
export function matchVersion(options: FieldOption[], value: FillValue): FieldOption | null {
  if (typeof value !== 'string') return null;
  const tokens = new Set(versionWords(value));
  const isNumber = (token: string) => /^\d+$/.test(token);
  const scored = options
    .filter(option => option.value !== '' || option.label !== '')
    .filter(option => !/^(choisir|selectionner|select)/.test(normalize(option.label)))
    .map(option => {
      const label = versionWords(option.label);
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
  return scored[0]?.option ?? null;
}

// ── Remplissage par type de champ ───────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function fail(field: FormField, reason: string): FillResult {
  return { fieldKey: field.key, status: 'failed', reason };
}
const ok = (field: FormField): FillResult => ({ fieldKey: field.key, status: 'filled' });

const SUGGESTION_SELECTOR =
  'li, [role="option"], [class*="suggest" i] > *, [class*="autocomplete" i] > *, [class*="result" i] > *, [class*="item" i], [class*="choice" i]';

function isShown(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return !(style && (style.display === 'none' || style.visibility === 'hidden')) && !element.closest('[hidden]');
}

/** Suggestions visibles qui contiennent tous les mots de la valeur (la plus précise d'abord). */
function suggestionsFor(doc: Document, wanted: string[]): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(SUGGESTION_SELECTOR)]
    .filter(el => !el.querySelector('input, select, textarea') && isShown(el))
    .filter(el => {
      const text = el.textContent ?? '';
      if (!text.trim() || text.length > 200) return false;
      const found = words(text);
      return wanted.every(word => found.includes(word));
    })
    .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length);
}

/**
 * Après la saisie : attend une suggestion de l'extranet (apparue APRÈS la saisie) et la choisit, comme un clic réel.
 * Une liste de suggestions modifie la page : si rien ne bouge peu après la saisie, on n'attend pas plus.
 * Renvoie true si une suggestion a été choisie ; sinon le texte saisi reste tel quel.
 */
async function pickSuggestion(element: HTMLElement, text: string, before: Set<HTMLElement>, timeoutMs: number): Promise<boolean> {
  const wanted = words(text);
  if (!wanted.length) return false;
  let changed = false;
  const observer = new MutationObserver(() => (changed = true));
  observer.observe(element.ownerDocument.body, { childList: true, subtree: true, attributes: true, characterData: true });
  const started = Date.now();
  try {
    while (Date.now() - started < timeoutMs) {
      if (!changed && Date.now() - started > 400) return false;
      const match = suggestionsFor(element.ownerDocument, wanted).find(el => !before.has(el) && !el.contains(element) && !isForbiddenClick(el));
      if (match) {
        match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        match.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        match.click();
        return true;
      }
      await sleep(100);
    }
    return false;
  } finally {
    observer.disconnect();
  }
}

async function fillText(
  field: FormField,
  element: HTMLInputElement | HTMLTextAreaElement,
  value: FillValue,
  options: FillOptions,
): Promise<FillResult> {
  if (typeof value === 'boolean') return fail(field, 'Une réponse oui/non ne se saisit pas dans un champ de texte.');
  const asDate = field.kind === 'date' || options.date === true;
  // Champ numérique : « 12 000 » et « 1,5 » (écriture française) deviennent « 12000 » et « 1.5 ».
  const asNumber = field.kind === 'number' && typeof value === 'string' ? value.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.') : value;
  const text = asDate ? (typeof value === 'string' ? formatDate(value, field) : null) : String(asNumber);
  if (text === null) return fail(field, `Date illisible : ${String(value)}`);
  // Un navigateur ne tronque pas une valeur écrite par script : la longueur maximale se contrôle ici.
  if (field.maxLength !== null && text.length > field.maxLength) {
    return fail(field, `La valeur dépasse la longueur maximale du champ (${field.maxLength} caractères).`);
  }
  if (field.kind === 'number' && typeof value !== 'number' && (text.trim() === '' || Number.isNaN(Number(text)))) return fail(field, `Nombre attendu : ${String(value)}`);

  const before = options.suggest ? new Set(suggestionsFor(element.ownerDocument, words(text))) : new Set<HTMLElement>();
  typeInto(element, text);
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text.slice(-1) }));
  if (options.suggest && (await pickSuggestion(element, text, before, options.suggestionTimeoutMs ?? 1500))) {
    blur(element);
    // La suggestion choisie complète le texte (« 225 Bd Paul Claudel 13010 Marseille ») : il suffit qu'il reste rempli.
    return element.value.trim() ? ok(field) : fail(field, "L'extranet a vidé le champ après le choix de la suggestion.");
  }
  blur(element);
  // Vérifie ce que l'extranet a gardé (longueur maximale, masque de saisie…).
  const kept = element.value;
  // Un masque de saisie ajoute des séparateurs (« 06 12 34 56 78 ») : seuls les caractères utiles comptent.
  const bare = (s: string) => normalize(s).replace(/[\s.\-/]+/g, '');
  if (field.kind === 'date' && field.inputType === 'date' ? kept !== text : bare(kept) !== bare(text)) {
    return fail(field, `L'extranet n'a pas accepté la valeur (« ${kept} »).`);
  }
  return ok(field);
}

/** Date en trois cases (jour / mois / année, ou année / mois / jour) : chaque case reçoit sa partie. */
function fillSplitDate(field: FormField, parts: HTMLElement[], value: FillValue): FillResult {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match || parts.length !== 3) return fail(field, `Date illisible : ${String(value)}`);
  const [, year, month, day] = match;
  const texts = field.inputType === 'split-ymd' ? [year, month, day] : [day, month, year];
  for (const [index, part] of parts.entries()) {
    if (part instanceof HTMLSelectElement) {
      // Liste jour / mois / année : l'option du nombre (« 5 », « 05 », ou valeur 5 pour « Mai »).
      const number = Number(texts[index]);
      const options = liveOptions(part);
      const option = matchOption(options, number) ?? options.find(o => o.value !== '' && Number(o.value) === number);
      if (!option) return fail(field, `Aucune option ne correspond à « ${texts[index]} ».`);
      part.focus();
      part.selectedIndex = options.indexOf(option);
      fire(part, 'input');
      fire(part, 'change');
    } else typeInto(part as HTMLInputElement, texts[index]);
    blur(part);
  }
  const kept = parts.map(part => {
    if (!(part instanceof HTMLSelectElement)) return (part as HTMLInputElement).value;
    const label = part.options[part.selectedIndex]?.textContent?.trim() ?? '';
    return /^\d+$/.test(label) ? label : part.value;
  });
  return kept.every((text, index) => Number(text) === Number(texts[index]))
    ? ok(field)
    : fail(field, `L'extranet n'a pas accepté la date (« ${kept.join('/')} »).`);
}

/**
 * Valeur saisie en plusieurs cases (téléphone 2/2/2/2/2, plaque 2/3/2…) : les séparateurs sont retirés, un numéro
 * international français (+33) repasse au format national, puis chaque case reçoit sa part.
 */
export function splitIntoSegments(value: string, widths: number[]): string[] | null {
  let compact = value.replace(/[\s.\-/]+/g, '');
  if (/^(\+|00)33\d{9}$/.test(compact)) compact = `0${compact.replace(/^(\+|00)33/, '')}`;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (compact.length !== total) return null;
  const parts: string[] = [];
  let index = 0;
  for (const width of widths) {
    parts.push(compact.slice(index, index + width));
    index += width;
  }
  return parts;
}

function fillSegments(field: FormField, parts: HTMLElement[], value: FillValue): FillResult {
  const widths = field.segments ?? [];
  const texts = typeof value === 'string' || typeof value === 'number' ? splitIntoSegments(String(value), widths) : null;
  if (!texts || texts.length !== parts.length) {
    return fail(field, `La valeur « ${String(value)} » ne correspond pas aux ${parts.length} cases du champ (${widths.join('/')}).`);
  }
  parts.forEach((part, index) => {
    typeInto(part as HTMLInputElement, texts[index]);
    blur(part);
  });
  const kept = parts.map(part => normalize((part as HTMLInputElement).value));
  return kept.every((text, index) => text === normalize(texts[index]))
    ? ok(field)
    : fail(field, `L'extranet n'a pas accepté la valeur (« ${kept.join(' ')} »).`);
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
/** Liste dépendante d'un autre champ (villes du code postal, modèles de la marque) : on attend qu'elle se charge. */
async function waitForOption(element: HTMLSelectElement, find: (options: FieldOption[]) => FieldOption | null, timeoutMs: number): Promise<FieldOption | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = find(liveOptions(element));
    if (found || Date.now() >= deadline) return found;
    await sleep(100);
  }
}

/**
 * Liste qui affiche encore les options du choix précédent (modèles de l'ancienne marque) : si elle change peu après,
 * on attend la nouvelle liste (au plus `timeoutMs`) ; si rien ne bouge, on n'attend pas plus.
 */
async function waitForReload(element: HTMLSelectElement, find: (options: FieldOption[]) => FieldOption | null, timeoutMs: number): Promise<FieldOption | null> {
  let changed = false;
  const observer = new MutationObserver(() => (changed = true));
  observer.observe(element, { childList: true, subtree: true, characterData: true });
  const started = Date.now();
  try {
    while (Date.now() - started < timeoutMs) {
      if (!changed && Date.now() - started > 400) return null;
      await sleep(100);
      const found = find(liveOptions(element));
      if (found) return found;
    }
    return null;
  } finally {
    observer.disconnect();
  }
}

async function fillSelect(field: FormField, element: HTMLSelectElement, value: FillValue, fillOptions: FillOptions = {}): Promise<FillResult> {
  const find = (options: FieldOption[]) => {
    const candidates = options.length > 1 ? options : field.options;
    return matchOption(candidates, value) ?? (fillOptions.version ? matchVersion(candidates, value) : null);
  };
  // Liste encore vide ou en cours de chargement : on lui laisse le temps de se remplir avant de conclure.
  const loading = liveOptions(element).length <= 2; // seulement « Sélectionner… » : la liste n'est pas encore chargée
  const timeoutMs = fillOptions.listTimeoutMs ?? 2500;
  const option =
    find(liveOptions(element)) ?? (loading ? await waitForOption(element, find, timeoutMs) : await waitForReload(element, find, timeoutMs));
  if (!option) return fail(field, `Aucune option ne correspond à « ${String(value)} ».`);
  const options = liveOptions(element);
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

/**
 * Bouton ou lien qui valide l'opération (« Valider », « Souscrire », envoi du formulaire…) : jamais cliqué en
 * remplissant un champ. L'extension ne fait que récupérer le tarif.
 */
function isForbiddenClick(element: HTMLElement): boolean {
  const control = element.closest<HTMLElement>('button, input[type="submit"], input[type="button"], a[href], [role="button"], [role="link"]');
  if (!control) return false;
  if (control instanceof HTMLInputElement && control.type === 'submit') return true;
  if (control instanceof HTMLButtonElement && control.type === 'submit' && control.form) return true;
  const label = control instanceof HTMLInputElement ? control.value : control.textContent;
  return FORBIDDEN_NAV_LABEL.test(`${label ?? ''} ${control.getAttribute('aria-label') ?? ''}`);
}

/** Clic comme un vrai pointeur (les composants maison écoutent souvent mousedown / pointerdown, pas seulement click). */
function realClick(element: HTMLElement): void {
  if (isForbiddenClick(element)) return;
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
  element.click();
}

/** Boutons radio dessinés (role="radio") : on clique celui qui correspond, puis on vérifie aria-checked. */
function fillAriaRadio(field: FormField, radios: HTMLElement[], value: FillValue): FillResult {
  const option = matchOption(field.options, value);
  if (!option) return fail(field, `Aucune option ne correspond à « ${String(value)} ».`);
  const radio = radios.find(el => customValueOf(el) === option.value);
  if (!radio) return fail(field, 'Le bouton radio est introuvable.');
  // Bouton radio ARIA (aria-checked) ou bouton bascule (aria-pressed).
  const checked = () => radio.getAttribute('aria-checked') === 'true' || radio.getAttribute('aria-pressed') === 'true';
  if (!checked()) realClick(radio);
  return checked() ? ok(field) : fail(field, "Le choix n'a pas pu être coché.");
}

/** Interrupteur ou case dessinés (role="switch" / "checkbox") : état lu dans aria-checked. */
function fillAriaCheckbox(field: FormField, element: HTMLElement, value: FillValue): FillResult {
  if (typeof value !== 'boolean') return fail(field, 'Réponse oui/non attendue pour une case à cocher.');
  if ((element.getAttribute('aria-checked') === 'true') !== value) realClick(element);
  return (element.getAttribute('aria-checked') === 'true') === value ? ok(field) : fail(field, "La case n'a pas pu être modifiée.");
}

/** Options visibles d'une liste maison ouverte (dans la liste qu'elle contrôle, sinon dans la page). */
function openOptions(element: HTMLElement): HTMLElement[] {
  const doc = element.ownerDocument;
  const controlled = element.getAttribute('aria-controls') ?? element.getAttribute('aria-owns');
  const root: ParentNode = (controlled && doc.getElementById(controlled)) || doc;
  return [...root.querySelectorAll<HTMLElement>('[role="option"]')].filter(option => {
    const style = doc.defaultView?.getComputedStyle(option);
    return !(style && (style.display === 'none' || style.visibility === 'hidden')) && !option.closest('[hidden]');
  });
}

/**
 * Liste déroulante maison : on l'ouvre (clic), on attend ses options, on choisit celle qui correspond (même règles que
 * pour un <select>), puis on vérifie que la liste affiche bien le choix.
 */
async function fillCustomSelect(field: FormField, element: HTMLElement, value: FillValue, options: FillOptions): Promise<FillResult> {
  realClick(element);
  const deadline = Date.now() + (options.suggestionTimeoutMs ?? 1500);
  let shown: HTMLElement[] = [];
  while (Date.now() < deadline) {
    shown = openOptions(element);
    if (shown.length) break;
    await sleep(50);
  }
  if (!shown.length) return fail(field, "La liste ne s'est pas ouverte.");
  const candidates = shown.map(option => ({ value: customValueOf(option), label: customValueOf(option) }));
  const option = matchOption(candidates, value) ?? (options.version ? matchVersion(candidates, value) : null);
  if (!option) {
    element.ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    return fail(field, `Aucune option ne correspond à « ${String(value)} ».`);
  }
  realClick(shown[candidates.indexOf(option)]);
  await sleep(0);
  const display = normalize(`${element.textContent ?? ''} ${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('data-value') ?? ''}`);
  return display.includes(normalize(option.label)) ? ok(field) : fail(field, "L'option n'a pas pu être sélectionnée.");
}

function fillRadio(field: FormField, radios: HTMLElement[], value: FillValue): FillResult {
  if (field.inputType === 'aria-radio') return fillAriaRadio(field, radios, value);
  const option = matchOption(field.options, value);
  if (!option) return fail(field, `Aucune option ne correspond à « ${String(value)} ».`);
  const radio = radios.find(el => (el as HTMLInputElement).value === option.value) as HTMLInputElement | undefined;
  if (!radio) return fail(field, "Le bouton radio est introuvable.");
  if (!radio.checked) clickChoice(radio); // `click()` coche et émet input + change, comme un clic réel
  return radio.checked ? ok(field) : fail(field, "Le choix n'a pas pu être coché.");
}

/** Coche un radio / une case. Masqué et dessiné par son libellé : on clique le libellé, comme l'utilisateur. */
function clickChoice(input: HTMLInputElement): void {
  const before = input.checked;
  if (isLabelStyledChoice(input)) {
    const label = input.labels?.[0] ?? input.closest('label');
    if (label) realClick(label);
  }
  if (input.checked === before) input.click();
}

function fillCheckbox(field: FormField, element: HTMLInputElement, value: FillValue): FillResult {
  if (typeof value !== 'boolean') return fail(field, 'Réponse oui/non attendue pour une case à cocher.');
  if (element.checked !== value) clickChoice(element);
  return element.checked === value ? ok(field) : fail(field, "La case n'a pas pu être modifiée.");
}

/** Champ à saisie assistée : on saisit, on attend les suggestions, on choisit celle qui correspond. */
async function fillAutocomplete(field: FormField, element: HTMLInputElement, value: FillValue, options: FillOptions): Promise<FillResult> {
  if (typeof value === 'boolean') return fail(field, 'Une réponse oui/non ne se saisit pas dans un champ de texte.');
  const text = String(value);
  typeInto(element, text);
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text.slice(-1) }));

  // Liste de suggestions HTML5 (datalist) : la valeur saisie doit être l'une des suggestions.
  if (element.hasAttribute('list') && element.list) {
    blur(element);
    const wantedText = normalize(text);
    const known = [...element.list.querySelectorAll('option')].some(o => normalize(o.value) === wantedText || normalize(o.textContent) === wantedText);
    return known ? ok(field) : fail(field, `Aucune suggestion ne correspond à « ${text} » : valeur saisie à vérifier.`);
  }
  const doc = element.ownerDocument;
  const controlled = element.getAttribute('aria-controls');
  const deadline = Date.now() + (options.suggestionTimeoutMs ?? 1500);
  const wanted = normalize(text);
  while (Date.now() < deadline) {
    const root: ParentNode = (controlled && doc.getElementById(controlled)) || doc;
    const suggestions = [...root.querySelectorAll<HTMLElement>('[role="option"], [role="listbox"] li')].filter(s => !isForbiddenClick(s));
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
  // Pas de suggestion : le texte saisi reste, mais rien ne dit que l'extranet l'accepte → à vérifier par le courtier.
  blur(element);
  return fail(field, `Aucune suggestion ne correspond à « ${text} » : valeur saisie à vérifier.`);
}

/**
 * Champ remplacé depuis l'analyse (la page l'a redessiné) : on le retrouve dans une nouvelle analyse de la page, par sa
 * clé (bâtie sur nom / id / libellé). `null` s'il n'y est plus.
 */
function refind(field: FormField, stale: HTMLElement): HTMLElement[] | null {
  const found = analyzeForm(stale.ownerDocument).elements.get(field.key);
  return found?.[0]?.isConnected ? found : null;
}

/**
 * Remplit un champ avec les événements qu'attendent les extranets (focus, input, change, blur).
 * Gère text, textarea, number, date, select, radio, case à cocher et saisie assistée ; vérifie ensuite la valeur gardée.
 */
export async function fillField(field: FormField, elements: HTMLElement[], value: FillValue, options: FillOptions = {}): Promise<FillResult> {
  if (elements[0] && !elements[0].isConnected) elements = refind(field, elements[0]) ?? elements;
  const element = elements[0];
  if (!element?.isConnected) return fail(field, "Le champ n'est plus dans la page.");
  try {
    switch (field.kind) {
      case 'select':
        if (field.inputType === 'custom-select') return await fillCustomSelect(field, element, value, options);
        return await fillSelect(field, element as HTMLSelectElement, value, options);
      case 'radio':
        return fillRadio(field, elements, value);
      case 'checkbox':
        if (field.inputType === 'aria-checkbox') return fillAriaCheckbox(field, element, value);
        return fillCheckbox(field, element as HTMLInputElement, value);
      case 'autocomplete':
        return await fillAutocomplete(field, element as HTMLInputElement, value, options);
      case 'date':
        if (field.inputType.startsWith('split-')) return fillSplitDate(field, elements, value);
        return await fillText(field, element as HTMLInputElement, value, options);
      default:
        if (field.inputType === 'segmented') return fillSegments(field, elements, value);
        return await fillText(field, element as HTMLInputElement | HTMLTextAreaElement, value, options);
    }
  } catch (error) {
    return fail(field, error instanceof Error ? error.message : 'Erreur inattendue.');
  }
}
