import { cleanLabel, hash, normalize } from './text';

export type FieldKind = 'text' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'textarea' | 'autocomplete';

export interface FieldOption {
  value: string;
  label: string;
}

/** Un champ du formulaire d'un extranet. Ne contient jamais de valeur saisie : seulement la structure. */
export interface FormField {
  /** Identifiant stable dans la page (type + nom/id/libellé), unique. */
  key: string;
  kind: FieldKind;
  /** Type HTML de l'`<input>` (text, email, tel, date…), ou `select` / `textarea`. */
  inputType: string;
  label: string;
  placeholder: string | null;
  name: string | null;
  id: string | null;
  /** Attribut HTML `autocomplete` (family-name, bday, email…). */
  autocomplete: string | null;
  required: boolean;
  /** Titre de la section (fieldset, ou dernier titre qui précède le champ). */
  section: string | null;
  order: number;
  options: FieldOption[];
  pattern: string | null;
  maxLength: number | null;
  /** Valeur saisie en plusieurs cases : nombre de caractères de chaque case (téléphone 2/2/2/2/2, plaque 2/3/2…). */
  segments?: number[] | null;
  /** Rang (1, 2…) de la ligne d'un tableau de saisie à colonnes titrées (ex. une ligne par sinistre) ; absent sinon. */
  row?: number;
}

export interface FormAnalysis {
  fields: FormField[];
  /** Éléments du DOM de chaque champ (plusieurs pour un groupe de boutons radio). */
  elements: Map<string, HTMLElement[]>;
  /** Empreinte de la structure du formulaire : change quand l'extranet change de formulaire. */
  fingerprint: string;
}

const IGNORED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'password', 'range', 'color']);
// Les <legend> ne comptent pas ici : ils ne titrent que les champs de leur propre fieldset.
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]';

/** Un élément est visible s'il ne l'est pas masqué lui-même ni par l'un de ses ancêtres. */
export function isVisible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden')) return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  }
  return true;
}

const textOf = (node: Node | null | undefined): string => cleanLabel((node?.textContent ?? '').replace(/\s+/g, ' ').trim());

/** Texte d'un `<label>` sans celui des champs qu'il contient (ex. `<label>Nom <input></label>`). */
function labelText(label: HTMLLabelElement): string {
  const clone = label.cloneNode(true) as HTMLLabelElement;
  clone.querySelectorAll('input, select, textarea, button').forEach(control => control.remove());
  return textOf(clone);
}

function labelledBy(element: Element): string | null {
  const ids = element.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? [];
  const text = ids
    .map(id => textOf(element.ownerDocument.getElementById(id)))
    .filter(Boolean)
    .join(' ');
  return text || null;
}

/** Libellé d'un champ : aria-labelledby, `<label for>`, `<label>` englobant, aria-label, cellule voisine, placeholder. */
function labelOf(element: HTMLElement): string {
  const doc = element.ownerDocument;
  const fromAria = labelledBy(element);
  if (fromAria) return fromAria;

  if (element.id) {
    const forLabel = [...doc.querySelectorAll<HTMLLabelElement>('label[for]')].find(label => label.htmlFor === element.id);
    if (forLabel) return labelText(forLabel);
  }
  const wrapping = element.closest('label');
  if (wrapping) {
    const text = labelText(wrapping);
    if (text) return text;
  }
  const aria = element.getAttribute('aria-label')?.trim();
  if (aria) return cleanLabel(aria);

  // Tableau à une ligne par élément (sinistres…) : le libellé est le titre de la colonne.
  const column = tableColumnOf(element);
  if (column) return column.header;
  // Tableau de saisie : le libellé est dans la cellule qui précède.
  const cell = element.closest('td');
  const previousCell = cell?.previousElementSibling;
  if (previousCell && /^(td|th)$/i.test(previousCell.tagName)) {
    const text = textOf(previousCell);
    if (text) return text;
  }
  // Libellé écrit juste avant le champ (hors balise <label>).
  const previous = element.previousElementSibling;
  if (previous && !previous.matches('input, select, textarea') && previous.children.length === 0) {
    const text = textOf(previous);
    if (text && text.length < 80) return text;
  }
  // Libellé à côté du bloc qui contient le champ (ex. « Date de naissance » à gauche des cases jour / mois / année).
  const container = element.parentElement;
  const beside = container && container.querySelectorAll('input, select, textarea').length <= 3 ? container.previousElementSibling : null;
  if (beside && !beside.querySelector('input, select, textarea')) {
    const text = textOf(beside);
    if (text && text.length < 80) return text;
  }
  return cleanLabel(element.getAttribute('placeholder') ?? element.getAttribute('title') ?? element.getAttribute('name') ?? '');
}

/**
 * Tableau de saisie à colonnes titrées, une ligne par élément (tableau « Sinistres » : type, responsabilité, date…) :
 * titre de la colonne du champ et rang de sa ligne parmi les lignes de saisie (1, 2…). Null hors d'un tel tableau
 * (un tableau « libellé | champ » n'a pas de ligne d'en-têtes).
 */
function tableColumnOf(element: HTMLElement): { header: string; row: number } | null {
  const cell = element.closest('td');
  const row = cell?.parentElement;
  const table = row?.closest('table');
  if (!cell || !row || !table) return null;
  const rows: Element[] = [...table.querySelectorAll('tr')].filter(tr => tr.closest('table') === table);
  const headerRow = rows.find(tr => tr.querySelector('th') && !tr.querySelector(CONTROL_SELECTOR));
  if (!headerRow || rows.indexOf(headerRow) > rows.indexOf(row)) return null;
  const header = textOf(headerRow.children[[...row.children].indexOf(cell)]);
  if (!header) return null;
  const entryRows = rows.filter(tr => tr !== headerRow && tr.querySelector(CONTROL_SELECTOR));
  return { header, row: entryRows.indexOf(row) + 1 };
}

/** Libellé d'un groupe de boutons radio : légende du fieldset, rôle radiogroup, ou titre juste avant. */
function groupLabelOf(first: HTMLElement): string {
  const fieldset = first.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend) return textOf(legend);
  const group = first.closest('[role="radiogroup"], [role="group"]');
  if (group) {
    const aria = labelledBy(group) ?? group.getAttribute('aria-label');
    if (aria) return cleanLabel(aria);
  }
  const column = tableColumnOf(first);
  if (column) return column.header;
  const container = first.closest('div, p, li, td');
  const heading = container
    ? [...container.children].find(child => child.matches('label, span, p, strong') && !child.querySelector('input, select, textarea'))
    : null;
  return textOf(heading) || labelOf(first);
}

function isRequired(element: HTMLElement, label: string): boolean {
  return (
    (element as HTMLInputElement).required === true ||
    element.getAttribute('aria-required') === 'true' ||
    /\*\s*$/.test(label) ||
    element.closest('label')?.textContent?.includes('*') === true
  );
}

/** Dernier titre qui précède l'élément dans le document : sa section. */
function sectionOf(element: HTMLElement, headings: Element[]): string | null {
  const fieldsetLegend = element.closest('fieldset')?.querySelector('legend');
  if (fieldsetLegend) return textOf(fieldsetLegend) || null;
  let section: Element | null = null;
  for (const heading of headings) {
    if (heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) section = heading;
    else break;
  }
  return section ? textOf(section) || null : null;
}

/**
 * Contrôles qui ne sont pas des champs HTML : liste déroulante maison (div ou bouton + liste), boutons radio et
 * interrupteurs dessinés (rôles ARIA). Une liste maison qui contient un vrai <input> est analysée par cet input.
 */
const CUSTOM_CONTROL_SELECTOR =
  '[role="combobox"]:not(input), button[aria-haspopup="listbox"], [role="radio"]:not(input), [role="switch"]:not(input), [role="checkbox"]:not(input)';
const CONTROL_SELECTOR = `input, select, textarea, ${CUSTOM_CONTROL_SELECTOR}`;

const isCustomControl = (element: HTMLElement) =>
  !(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement);

/** Valeur d'une option dessinée (bouton radio ARIA, option de liste maison) : data-value, sinon son texte. */
export function customValueOf(element: HTMLElement): string {
  return (element.getAttribute('data-value') ?? element.getAttribute('aria-label') ?? textOf(element)).trim();
}

function kindOf(element: HTMLElement): { kind: FieldKind; inputType: string } {
  if (isCustomControl(element)) {
    const role = element.getAttribute('role');
    if (role === 'radio') return { kind: 'radio', inputType: 'aria-radio' };
    if (role === 'switch' || role === 'checkbox') return { kind: 'checkbox', inputType: 'aria-checkbox' };
    return { kind: 'select', inputType: 'custom-select' };
  }
  if (element instanceof HTMLSelectElement) return { kind: 'select', inputType: 'select' };
  if (element instanceof HTMLTextAreaElement) return { kind: 'textarea', inputType: 'textarea' };
  const input = element as HTMLInputElement;
  const type = (input.getAttribute('type') ?? 'text').toLowerCase();
  if (type === 'radio') return { kind: 'radio', inputType: type };
  if (type === 'checkbox') return { kind: 'checkbox', inputType: type };
  if (type === 'date' || type === 'month') return { kind: 'date', inputType: type };
  if (type === 'number') return { kind: 'number', inputType: type };
  const isCombobox =
    input.getAttribute('role') === 'combobox' || input.hasAttribute('list') || input.getAttribute('aria-autocomplete') === 'list';
  return { kind: isCombobox ? 'autocomplete' : 'text', inputType: type };
}

function optionsOf(element: HTMLElement, group: HTMLElement[]): FieldOption[] {
  if (element instanceof HTMLSelectElement) {
    return [...element.options]
      .filter(option => option.value !== '' || option.textContent?.trim())
      .map(option => ({ value: option.value, label: cleanLabel(option.textContent ?? '') }))
      .filter(option => !/^(choisir|selectionner|sélectionner|-+|\.\.\.)/i.test(option.label) || option.value !== '');
  }
  if (element.getAttribute('role') === 'radio' && isCustomControl(element)) {
    return group.map(radio => ({ value: customValueOf(radio), label: customValueOf(radio) }));
  }
  if ((element as HTMLInputElement).type === 'radio') {
    return group.map(radio => ({ value: (radio as HTMLInputElement).value, label: labelOf(radio) || (radio as HTMLInputElement).value }));
  }
  return [];
}

/**
 * Analyse un formulaire : champs visibles et saisissables (jamais les mots de passe), avec libellé, type, options,
 * section, caractère obligatoire, et l'empreinte de sa structure. Les groupes de boutons radio forment UN champ.
 */
/** Mots d'un formulaire de connexion (id, nom, action, classe, bouton). */
const AUTH_WORDS = /(^|[^a-z])(log-?in|sign-?in|connexion|se connecter|authentification)([^a-z]|$)/i;
/** Mots d'un champ de recherche (barre de recherche du site, jamais une question du devis). */
const SEARCH_WORDS = /(^|[^a-z])(search|recherche[rz]?|rechercher|query|keywords?)([^a-z]|$)|^q$/i;

/** Champ de recherche du site : type search, zone role=search, ou nom/id/placeholder « recherche ». */
export function isSearchField(element: HTMLElement): boolean {
  if ((element.getAttribute('type') ?? '').toLowerCase() === 'search') return true;
  if (element.closest('[role="search"], search')) return true;
  const hints = [element.getAttribute('name'), element.id, element.getAttribute('placeholder'), element.getAttribute('aria-label')];
  return hints.some(hint => !!hint && SEARCH_WORDS.test(hint.trim()));
}

/** Champs « à saisir » (ni mot de passe, ni case, ni bouton, ni caché) visibles dans `scope`. */
function visibleEntryFields(scope: ParentNode): number {
  return [...scope.querySelectorAll<HTMLElement>('input, select, textarea')].filter(element => {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    return !(element instanceof HTMLInputElement && (IGNORED_INPUT_TYPES.has(type) || type === 'checkbox' || type === 'radio')) && isVisible(element);
  }).length;
}

/**
 * Page de connexion (ou d'authentification). L'extension n'y remplit RIEN :
 * - un champ mot de passe visible accompagné d'au plus 2 champs à saisir (identifiant, code) : formulaire de connexion
 *   (un mot de passe au milieu d'un vrai questionnaire, « créez votre espace client », n'en fait pas une page de connexion) ;
 * - ou un formulaire dont l'identité (id, nom, action, classe, bouton d'envoi) dit « login / sign-in / connexion ».
 */
export function isAuthPage(root: Document | HTMLElement = document): boolean {
  const scope = root instanceof Document ? root.body : root;
  if (!scope) return false;
  const passwords = [...scope.querySelectorAll<HTMLInputElement>('input[type="password" i]')].filter(input => isVisible(input));
  if (passwords.some(input => visibleEntryFields(input.closest('form') ?? scope) <= 2)) return true;
  return [...scope.querySelectorAll<HTMLFormElement>('form')].some(form => {
    if (!isVisible(form)) return false;
    const identity = [form.id, form.getAttribute('name'), form.getAttribute('action'), form.className, form.getAttribute('aria-label')];
    const submit = [...form.querySelectorAll<HTMLElement>('button, input[type="submit" i]')].map(
      button => (button instanceof HTMLInputElement ? button.value : button.textContent) ?? '',
    );
    return [...identity, ...submit].some(text => !!text && AUTH_WORDS.test(text.trim()));
  });
}

/** Libellé d'un groupe de cases : celui de la première case, sauf s'il ne nomme que la case (« Jour ») ; alors celui du bloc. */
function segmentGroupLabel(parts: HTMLElement[]): string {
  const column = tableColumnOf(parts[0]);
  if (column) return column.header;
  const own = labelOf(parts[0]);
  if (own.length > 4 && !Object.values(PART_HINTS).some(hint => hint.test(own))) return own;
  for (let node = parts[0].parentElement; node && node !== parts[0].ownerDocument.body; node = node.parentElement) {
    if (!parts.every(part => node!.contains(part))) continue;
    const beside = node.previousElementSibling;
    if (beside && !beside.querySelector('input, select, textarea')) {
      const text = textOf(beside);
      if (text && text.length < 80) return text;
    }
  }
  return own;
}

const radioGroupIds = new WeakMap<HTMLElement, string>();
let nextRadioGroupId = 0;

/** Identifiant d'un groupe de boutons radio ARIA : son id, sinon un identifiant stable pour la page. */
function radioGroupId(group: HTMLElement): string {
  if (group.id) return group.id;
  let id = radioGroupIds.get(group);
  if (!id) radioGroupIds.set(group, (id = `aria-radiogroup-${nextRadioGroupId++}`));
  return id;
}

export function analyzeForm(root: Document | HTMLElement = document): FormAnalysis {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const scope = root instanceof Document ? root.body : root;
  const headings = [...scope.querySelectorAll(HEADING_SELECTOR)];

  const candidates = [...scope.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].filter(element => {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    return (
      !(element instanceof HTMLInputElement && IGNORED_INPUT_TYPES.has(type)) &&
      !(element as HTMLInputElement).disabled &&
      element.getAttribute('aria-disabled') !== 'true' &&
      !(isCustomControl(element) && element.querySelector('input, select, textarea')) &&
      element.getAttribute('aria-hidden') !== 'true' &&
      !isSearchField(element) &&
      isVisible(element)
    );
  });

  const fields: FormField[] = [];
  const elements = new Map<string, HTMLElement[]>();
  const usedKeys = new Map<string, number>();
  const radioGroups = new Map<string, HTMLElement[]>();
  const segmentGroups = findSegmentGroups(candidates);
  const inSegmentGroup = new Set([...segmentGroups.values()].flatMap(({ parts }) => parts.slice(1)));

  const uniqueKey = (base: string): string => {
    const count = (usedKeys.get(base) ?? 0) + 1;
    usedKeys.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  };

  for (const element of candidates) {
    if (inSegmentGroup.has(element)) continue; // case déjà comptée avec la première de son groupe
    const segments = segmentGroups.get(element);
    const { kind, inputType } = segments
      ? { kind: segments.inputType === 'segmented' ? ('text' as const) : ('date' as const), inputType: segments.inputType }
      : kindOf(element);
    let group: HTMLElement[] = segments ? segments.parts : [element];

    if (kind === 'radio') {
      const name = isCustomControl(element)
        ? radioGroupId(element.closest<HTMLElement>('[role="radiogroup"]') ?? element.parentElement ?? element)
        : (element as HTMLInputElement).name || element.id || `radio-${fields.length}`;
      const groupKey = `${name}@${element.closest('form')?.id ?? ''}`;
      const existing = radioGroups.get(groupKey);
      if (existing) {
        existing.push(element);
        continue; // le groupe est déjà un champ
      }
      group = [element];
      radioGroups.set(groupKey, group);
    }

    const label = kind === 'radio' ? groupLabelOf(element) : segments ? segmentGroupLabel(segments.parts) : labelOf(element);
    const name = element.getAttribute('name');
    const base = `${kind}:${normalize(name ?? element.id ?? label).replace(/ /g, '-').slice(0, 80) || fields.length}`;
    const key = uniqueKey(base);
    const tableRow = tableColumnOf(element)?.row;

    elements.set(key, group);
    fields.push({
      key,
      kind,
      inputType,
      label,
      placeholder: element.getAttribute('placeholder')?.trim() || null,
      name,
      id: element.id || null,
      autocomplete: element.getAttribute('autocomplete')?.trim().toLowerCase() || null,
      required: isRequired(element, label),
      section: sectionOf(element, headings),
      order: fields.length,
      options: [],
      pattern: element.getAttribute('pattern'),
      maxLength: !segments && (element as HTMLInputElement).maxLength > 0 ? (element as HTMLInputElement).maxLength : null,
      segments: segments?.inputType === 'segmented' ? segments.widths : null,
      ...(tableRow ? { row: tableRow } : {}),
    });
  }

  // Les options des groupes radio ne sont connues qu'une fois le groupe complet.
  for (const field of fields) {
    const group = elements.get(field.key)!;
    field.options = optionsOf(group[0], group);
  }

  return { fields, elements, fingerprint: fingerprintOf(fields, doc) };
}

// ── Saisie en plusieurs cases (date, téléphone, plaque, code…) ──────────────

/** Ordre des cases d'une date saisie en trois parties : `split-dmy` (jour, mois, année) ou `split-ymd`. */
export type SplitDateOrder = 'split-dmy' | 'split-ymd';

const PART_HINTS: Record<'d' | 'm' | 'y', RegExp> = {
  d: /(^|[^a-z])(jour|day|jj|dd)([^a-z]|$)|_j$|jour$/i,
  m: /(^|[^a-z])(mois|month|mm)([^a-z]|$)|_m$|mois$/i,
  y: /(^|[^a-z])(annee|année|an|year|aaaa|yyyy)([^a-z]|$)|_a$|annee$/i,
};

/** Une case ne dépasse pas cette taille : au-delà, c'est un champ à part entière (nom, adresse…). */
const MAX_SEGMENT_WIDTH = 6;

/** Rôle d'une case de date d'après son nom / id / placeholder. */
function partOf(element: HTMLElement): 'd' | 'm' | 'y' | null {
  const input = element as HTMLInputElement;
  const hints = [input.name, input.id, input.getAttribute('placeholder'), input.getAttribute('title')].filter(Boolean).join(' ');
  for (const part of ['d', 'm', 'y'] as const) if (PART_HINTS[part].test(hints)) return part;
  return null;
}

function widthOf(element: HTMLElement): number | null {
  const input = element as HTMLInputElement;
  if (input.maxLength > 0) return input.maxLength;
  const size = Number(input.getAttribute('size'));
  return size > 0 ? size : null;
}

const isTextBox = (element: HTMLElement) =>
  element instanceof HTMLInputElement && ['text', 'tel', 'number', ''].includes((element.getAttribute('type') ?? 'text').toLowerCase());

/** Les cases sont-elles côte à côte (même parent, ou chacune seule dans des parents frères) ? */
function sideBySide(parts: HTMLElement[]): boolean {
  const parents = parts.map(p => p.parentElement);
  if (parents.every(p => p === parents[0])) return true;
  const grand = parents.map(p => p?.parentElement);
  return !!grand[0] && grand.every(g => g === grand[0]) && parents.every(p => (p?.querySelectorAll('input').length ?? 0) === 1);
}

/**
 * Le champ a-t-il un libellé à lui (label for, label englobant, aria-label, aria-labelledby) ? Un libellé qui ne fait que
 * nommer la case (« Jour », « MM », « AAAA ») ne compte pas : il fait partie du groupe.
 */
function hasOwnLabel(element: HTMLElement): boolean {
  const doc = element.ownerDocument;
  const texts = [
    element.getAttribute('aria-label'),
    labelledBy(element),
    element.closest('label') ? labelText(element.closest('label')!) : null,
    element.id ? ([...doc.querySelectorAll<HTMLLabelElement>('label[for]')].find(label => label.htmlFor === element.id) ?? null) : null,
  ].map(item => (item instanceof HTMLLabelElement ? labelText(item) : (item ?? '').trim()));
  return texts.some(text => !!text && text.length > 4 && !Object.values(PART_HINTS).some(hint => hint.test(text)));
}

/** Ordre d'un trio de cases s'il forme une date (2/2/4 ou 4/2/2 caractères, ou noms jour/mois/année), sinon null. */
function splitDateOrder(parts: HTMLElement[]): SplitDateOrder | null {
  if (parts.length !== 3) return null;
  const widths = parts.map(widthOf).join('/');
  if (widths === '2/2/4') return 'split-dmy';
  if (widths === '4/2/2') return 'split-ymd';
  const roles = parts.map(partOf).join('');
  if (roles === 'dmy') return 'split-dmy';
  if (roles === 'ymd') return 'split-ymd';
  return null;
}

/** Groupe de cases qui forment UNE valeur : date (`split-dmy` / `split-ymd`) ou valeur découpée (`segmented`). */
export interface SegmentGroup {
  parts: HTMLElement[];
  inputType: SplitDateOrder | 'segmented';
  /** Nombre de caractères de chaque case (valeur découpée). */
  widths: number[];
}

/**
 * Cases courtes et côte à côte qui forment une seule valeur : une date en trois cases, un téléphone en cinq, une plaque
 * en trois… Chaque case a une taille connue (maxlength ou size) d'au plus 6 caractères. Première case → groupe.
 */
function findSegmentGroups(candidates: HTMLElement[]): Map<HTMLElement, SegmentGroup> {
  const found = new Map<HTMLElement, SegmentGroup>();
  for (let i = 0; i < candidates.length; i++) {
    const run: HTMLElement[] = [];
    for (let j = i; j < candidates.length; j++) {
      const candidate = candidates[j];
      const width = widthOf(candidate);
      const short = isTextBox(candidate) && ((width !== null && width <= MAX_SEGMENT_WIDTH) || partOf(candidate) !== null);
      // Une case qui a son propre libellé est un champ à part (« Champ A » / « Champ B »), pas la suite du groupe.
      if (!short || (run.length && (hasOwnLabel(candidate) || !sideBySide([...run, candidate])))) break;
      run.push(candidate);
    }
    if (run.length < 2) continue;
    const date = splitDateOrder(run);
    const widths = run.map(widthOf);
    if (date) found.set(run[0], { parts: run, inputType: date, widths: widths.map(w => w ?? 0) });
    else if (widths.every((w): w is number => w !== null)) found.set(run[0], { parts: run, inputType: 'segmented', widths });
    else continue;
    i += run.length - 1;
  }
  return found;
}

/** Empreinte de la structure (types, noms, libellés, nombre d'options) : jamais de valeurs saisies. */
export function fingerprintOf(fields: FormField[], _doc?: Document): string {
  const structure = fields
    .map(field => [field.kind, field.inputType, normalize(field.name ?? field.id ?? ''), normalize(field.label), field.options.length].join('|'))
    .join('\n');
  return `v1:${hash(structure)}`;
}
