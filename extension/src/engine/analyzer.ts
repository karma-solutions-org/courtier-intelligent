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
  return cleanLabel(element.getAttribute('placeholder') ?? element.getAttribute('title') ?? element.getAttribute('name') ?? '');
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

function kindOf(element: HTMLElement): { kind: FieldKind; inputType: string } {
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
  if ((element as HTMLInputElement).type === 'radio') {
    return group.map(radio => ({ value: (radio as HTMLInputElement).value, label: labelOf(radio) || (radio as HTMLInputElement).value }));
  }
  return [];
}

/**
 * Analyse un formulaire : champs visibles et saisissables (jamais les mots de passe), avec libellé, type, options,
 * section, caractère obligatoire, et l'empreinte de sa structure. Les groupes de boutons radio forment UN champ.
 */
export function analyzeForm(root: Document | HTMLElement = document): FormAnalysis {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const scope = root instanceof Document ? root.body : root;
  const headings = [...scope.querySelectorAll(HEADING_SELECTOR)];

  const candidates = [...scope.querySelectorAll<HTMLElement>('input, select, textarea')].filter(element => {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    return (
      !(element instanceof HTMLInputElement && IGNORED_INPUT_TYPES.has(type)) &&
      !(element as HTMLInputElement).disabled &&
      element.getAttribute('aria-hidden') !== 'true' &&
      isVisible(element)
    );
  });

  const fields: FormField[] = [];
  const elements = new Map<string, HTMLElement[]>();
  const usedKeys = new Map<string, number>();
  const radioGroups = new Map<string, HTMLElement[]>();

  const uniqueKey = (base: string): string => {
    const count = (usedKeys.get(base) ?? 0) + 1;
    usedKeys.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  };

  for (const element of candidates) {
    const { kind, inputType } = kindOf(element);
    let group: HTMLElement[] = [element];

    if (kind === 'radio') {
      const name = (element as HTMLInputElement).name || element.id || `radio-${fields.length}`;
      const groupKey = `${name}@${element.closest('form')?.id ?? ''}`;
      const existing = radioGroups.get(groupKey);
      if (existing) {
        existing.push(element);
        continue; // le groupe est déjà un champ
      }
      group = [element];
      radioGroups.set(groupKey, group);
    }

    const label = kind === 'radio' ? groupLabelOf(element) : labelOf(element);
    const name = element.getAttribute('name');
    const base = `${kind}:${normalize(name ?? element.id ?? label).replace(/ /g, '-').slice(0, 80) || fields.length}`;
    const key = uniqueKey(base);

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
      maxLength: (element as HTMLInputElement).maxLength > 0 ? (element as HTMLInputElement).maxLength : null,
    });
  }

  // Les options des groupes radio ne sont connues qu'une fois le groupe complet.
  for (const field of fields) {
    const group = elements.get(field.key)!;
    field.options = optionsOf(group[0], group);
  }

  return { fields, elements, fingerprint: fingerprintOf(fields, doc) };
}

/** Empreinte de la structure (types, noms, libellés, nombre d'options) : jamais de valeurs saisies. */
export function fingerprintOf(fields: FormField[], _doc?: Document): string {
  const structure = fields
    .map(field => [field.kind, field.inputType, normalize(field.name ?? field.id ?? ''), normalize(field.label), field.options.length].join('|'))
    .join('\n');
  return `v1:${hash(structure)}`;
}
