import type { CapturedGuarantee, CapturedOffer } from '../shared/messages';
import { isVisible } from './analyzer';
import { hasPremium } from './offer';
import { normalize } from './text';

export { hasPremium, sanitizeOffer } from './offer';

/**
 * Capture du tarif (E10) : reconnaître la page de résultat d'un extranet et en lire l'offre (primes, franchises,
 * garanties, plafonds, exclusions, numéro de devis) dans le DOM. Rien n'est inventé : une information introuvable
 * reste `null` (ou absente des listes).
 */

// ── Montants ────────────────────────────────────────────────────────────────

export interface Amount {
  value: number;
  /** Position dans le texte analysé. */
  index: number;
  end: number;
}

const MAX_AMOUNT = 10_000_000;
// « 1 234,56 € », « 1.234 € », « 640€ », « € 53,20 », « 640 EUR » : un montant n'est retenu qu'avec sa devise.
const AMOUNT = /(€\s*)?(\d{1,3}(?:[   .]\d{3})+|\d+)(?:,(\d{1,2})|\.(\d{1,2})(?!\d))?(\s*(?:€|eur(?:os?)?\b))?/gi;

/** Montants en euros d'un texte, dans l'ordre. */
export function parseAmounts(text: string): Amount[] {
  const amounts: Amount[] = [];
  for (const match of text.matchAll(AMOUNT)) {
    if (!match[1] && !match[5]) continue;
    const integer = match[2].replace(/[   .]/g, '');
    const decimals = match[3] ?? match[4] ?? '';
    const value = Number(decimals ? `${integer}.${decimals}` : integer);
    if (Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT) {
      amounts.push({ value, index: match.index, end: match.index + match[0].length });
    }
  }
  return amounts;
}

const firstAmount = (text: string): number | null => parseAmounts(text)[0]?.value ?? null;

/** Montant qui suit un mot-clé (« franchise 150 € », « plafond : 5 000 € ») ; null s'il n'y en a pas. */
function amountAfter(text: string, keyword: RegExp): number | null {
  const match = keyword.exec(text);
  if (!match) return null;
  return firstAmount(text.slice(match.index + match[0].length, match.index + match[0].length + 60));
}

// ── Texte de la page ────────────────────────────────────────────────────────

const SKIPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'BUTTON']);

/** Texte visible d'un élément, mots séparés (le `textContent` colle « Prime</span><b>640 € » en « Prime640 € »). */
export function visibleText(root: Element): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) parts.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (SKIPPED.has(element.tagName.toUpperCase()) || element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return;
    element.childNodes.forEach(walk);
  };
  walk(root);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Comme `normalize`, mais garde la ponctuation utile aux montants et aux numéros (« , », « . », « € », « / », « - »). */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

const HEADINGS = 'h1, h2, h3, h4, h5, h6, [role="heading"], caption, legend, dt, th, strong, b';

/** Le titre qui précède un élément (dans son conteneur ou ses ancêtres), pour savoir de quelle section il fait partie. */
function headingBefore(element: Element): string {
  for (let node: Element | null = element; node && node !== node.ownerDocument.body; node = node.parentElement) {
    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (sibling.matches(HEADINGS)) return visibleText(sibling);
      const nested = [...sibling.querySelectorAll(HEADINGS)].at(-1);
      if (nested && sibling.matches('header, div, section') && sibling.children.length <= 3) return visibleText(nested);
    }
  }
  return '';
}

// ── Garanties ───────────────────────────────────────────────────────────────

const GUARANTEE_SECTION = /\b(garanties?|couvertures?|prestations|vos protections)\b/;
const EXCLUSION_SECTION = /\b(exclusions?|non garanti|non couvert|n est pas couvert|ne sont pas couverts)\b/;
const INCLUDED = /(\binclus|\bcompris\b|\boui\b|✓|✔|\bgaranti\b|\bsouscrit|\bactive\b)/;
const NOT_INCLUDED = /(\bnon\b|\bexclu|\ben option\b|\boptionnel|\bnon inclus|✗|✘|^\s*[-–—]\s*$)/;
const LIMIT = /(plafond|limite|capital|jusqu a|jusqu’a|jusqu'a|montant garanti)/;
const DEDUCTIBLE = /franchise/;

const MAX_GUARANTEES = 60;
const MAX_EXCLUSIONS = 30;
const MAX_TEXT = 300;

const clip = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

/** « Incluse » / « Non incluse » : `null` quand la cellule ne dit rien. */
function inclusion(text: string): boolean | null {
  const folded = fold(text);
  if (NOT_INCLUDED.test(folded)) return false;
  if (INCLUDED.test(folded)) return true;
  return null;
}

function guaranteesFromTable(table: HTMLTableElement): CapturedGuarantee[] {
  const rows = [...table.rows].filter(row => isVisible(row));
  if (rows.length < 2) return [];
  const header = [...rows[0].cells].map(cell => fold(visibleText(cell)));
  const headerText = header.join(' ');
  if (!GUARANTEE_SECTION.test(normalize(headerText)) && !GUARANTEE_SECTION.test(normalize(headingBefore(table)))) return [];

  const column = (pattern: RegExp) => header.findIndex((text, i) => i > 0 && pattern.test(text));
  const includedCol = column(/inclus|statut|souscrit|choix|formule/);
  const limitCol = column(LIMIT);
  const deductibleCol = column(DEDUCTIBLE);

  return rows.slice(1).flatMap(row => {
    const cells = [...row.cells].map(cell => visibleText(cell));
    const label = clip(cells[0] ?? '');
    if (!label || parseAmounts(label).length > 0) return [];
    const included = includedCol >= 0 ? inclusion(cells[includedCol] ?? '') : inclusion(cells.slice(1).join(' '));
    return [
      {
        label,
        // Sans colonne ni mention contraire, une garantie listée dans le tableau de l'offre est incluse.
        included: included ?? true,
        limit: limitCol >= 0 ? firstAmount(cells[limitCol] ?? '') : null,
        deductible: deductibleCol >= 0 ? firstAmount(cells[deductibleCol] ?? '') : null,
      },
    ];
  });
}

/** « Bris de glace : incluse, franchise 150 € », « Vol – plafond 10 000 € », « Assistance 0 km (en option) ». */
function guaranteeFromItem(text: string): CapturedGuarantee | null {
  const folded = fold(text);
  const separator = /\s[:–—-]\s|:/.exec(text);
  const firstNumber = parseAmounts(text)[0]?.index ?? text.length;
  const label = clip(text.slice(0, Math.min(separator?.index ?? text.length, firstNumber)));
  if (!label) return null;
  return {
    label,
    included: inclusion(text.slice(label.length)) ?? true,
    limit: amountAfter(folded, LIMIT),
    deductible: amountAfter(folded, DEDUCTIBLE),
  };
}

/** Listes (`ul`, `ol`) qui suivent un titre de section correspondant au motif. */
function listsUnder(doc: Document, section: RegExp, excluded?: RegExp): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>('ul, ol')].filter(list => {
    if (!isVisible(list) || list.closest('nav, header, footer, [role="listbox"]')) return false;
    const heading = normalize(headingBefore(list));
    return section.test(heading) && !(excluded && excluded.test(heading));
  });
}

export function extractGuarantees(doc: Document): CapturedGuarantee[] {
  const fromTables = [...doc.querySelectorAll('table')].flatMap(table => guaranteesFromTable(table));
  const fromLists = listsUnder(doc, GUARANTEE_SECTION, EXCLUSION_SECTION).flatMap(list =>
    [...list.querySelectorAll(':scope > li')].map(item => guaranteeFromItem(visibleText(item))).filter((g): g is CapturedGuarantee => g !== null),
  );
  const seen = new Set<string>();
  return [...fromTables, ...fromLists]
    .filter(g => {
      const key = normalize(g.label);
      return key !== '' && !seen.has(key) && seen.add(key);
    })
    .slice(0, MAX_GUARANTEES);
}

export function extractExclusions(doc: Document): string[] {
  const items = listsUnder(doc, EXCLUSION_SECTION).flatMap(list => [...list.querySelectorAll(':scope > li')].map(item => clip(visibleText(item))));
  return [...new Set(items.filter(Boolean))].slice(0, MAX_EXCLUSIONS);
}

// ── Primes, franchise générale ──────────────────────────────────────────────

const PREMIUM = /(prime|cotisation|tarif|prix|total|montant|a payer|vous coute|votre offre|mensualite|echeance)/;
const MONTHLY = /(mensuel|mensualite|par mois|\/ ?mois\b|\bmois\b)/;
const ANNUAL = /(annuel|\bpar an\b|\/ ?an\b|\ban\b|\bannee\b)/;
const NOT_PREMIUM = /(franchise|plafond|limite|capital|valeur|indemnis|jusqu|frais de dossier|economie|remise|reduction)/;
const EMPHASIS = 'h1, h2, h3, strong, b, [class*="price"], [class*="prix"], [class*="tarif"], [class*="montant"], [class*="amount"]';

interface PriceCandidate {
  value: number;
  period: 'annual' | 'monthly' | null;
  score: number;
  order: number;
}

/** Éléments porteurs de texte (au moins un nœud texte direct), hors sections des garanties et exclusions. */
function textBlocks(doc: Document, excluded: Element[]): Element[] {
  const blocks = new Set<Element>();
  for (const element of doc.body.querySelectorAll('*')) {
    if (SKIPPED.has(element.tagName.toUpperCase()) || excluded.some(zone => zone.contains(element))) continue;
    const hasText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (hasText && isVisible(element)) blocks.add(element);
  }
  return [...blocks];
}

/** Libellé qui accompagne un montant isolé : élément précédent (`<dt>`, `<th>`, `<span>`) ou parent court. */
function contextOf(element: Element): string {
  const own = visibleText(element);
  const previous = element.previousElementSibling ? visibleText(element.previousElementSibling) : '';
  const parent = element.parentElement ? visibleText(element.parentElement) : '';
  const around = parent.length <= 160 ? parent : `${previous} ${own}`;
  return around.includes(own) ? around : `${previous} ${own}`;
}

function priceCandidates(doc: Document, excluded: Element[]): { prices: PriceCandidate[]; generalDeductible: number | null } {
  const prices: PriceCandidate[] = [];
  let generalDeductible: number | null = null;
  let order = 0;
  const seen = new Set<string>();

  for (const block of textBlocks(doc, excluded)) {
    const own = visibleText(block);
    if (parseAmounts(own).length === 0) continue;
    const context = fold(contextOf(block));
    if (seen.has(context)) continue;
    seen.add(context);

    const amounts = parseAmounts(context);
    amounts.forEach((amount, i) => {
      // Le contexte d'un montant s'arrête aux montants voisins : « 640 € / an ou 53 € / mois ».
      const before = context.slice(Math.max(amounts[i - 1]?.end ?? 0, amount.index - 45), amount.index);
      const after = context.slice(amount.end, Math.min(amount.end + 25, amounts[i + 1]?.index ?? Infinity));
      if (DEDUCTIBLE.test(before)) {
        generalDeductible ??= amount.value;
        return;
      }
      if (NOT_PREMIUM.test(before)) return;
      const period = MONTHLY.test(after) || /(mensuel|mensualite|par mois)/.test(before) ? 'monthly' : ANNUAL.test(after) || /(annuel|par an)/.test(before) ? 'annual' : null;
      const keyword = PREMIUM.test(normalize(before)) || PREMIUM.test(normalize(context));
      if (!keyword && period === null) return;
      const emphasized = block.matches(EMPHASIS) || !!block.closest(EMPHASIS);
      prices.push({ value: amount.value, period, score: (keyword ? 2 : 0) + (period ? 1 : 0) + (emphasized ? 1 : 0), order: order++ });
    });
  }
  return { prices, generalDeductible };
}

const best = (candidates: PriceCandidate[]) => [...candidates].sort((a, b) => b.score - a.score || a.order - b.order)[0]?.value ?? null;

// ── Numéro de devis ─────────────────────────────────────────────────────────

const QUOTE_NUMBER = [
  /(?:n[°o]|numero|num\.?|reference|ref\.?)\s*(?:de |du |d')?\s*(?:votre )?(?:devis|proposition|projet|offre|simulation|cotation)\s*[:#]?\s*([a-z0-9][a-z0-9\-/_.]{3,30})/i,
  /(?:devis|proposition|offre|cotation|simulation)\s*(?:n[°o]|numero|no\.?|ref\.?)\s*[:#]?\s*([a-z0-9][a-z0-9\-/_.]{3,30})/i,
];

export function extractQuoteNumber(text: string): string | null {
  const folded = text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  for (const pattern of QUOTE_NUMBER) {
    const match = pattern.exec(folded);
    // Un numéro contient au moins un chiffre (« Devis n° gratuit » n'en est pas un).
    const value = match?.[1]?.replace(/[.\-/]+$/, '');
    if (value && /\d/.test(value)) return value;
  }
  return null;
}

// ── Page de résultat ────────────────────────────────────────────────────────

const RESULT_HEADING =
  /\b(votre (tarif|devis|offre|proposition|cotisation|prix)|tarif (obtenu|calcule|personnalise)|resultat|proposition (tarifaire|commerciale)|devis (n|no|numero)\b|recapitulatif de (votre |l )?(offre|devis)|nos (formules|offres)|offre personnalisee)/;

/** Le titre de la page (ou d'une section principale) annonce-t-il un résultat (« Votre tarif », « Votre devis »…) ? */
export function hasResultHeading(doc: Document): boolean {
  const titles = [doc.title, ...[...doc.querySelectorAll('h1, h2, h3, [role="heading"]')].filter(isVisible).map(h => visibleText(h))];
  return titles.some(title => RESULT_HEADING.test(normalize(title)));
}

export interface PageExtraction {
  offer: CapturedOffer;
  /** Indices qu'il s'agit d'une page de résultat (titre, numéro de devis) en plus des montants. */
  resultHeading: boolean;
}

/** Lit l'offre affichée dans le DOM. Ce qui est introuvable reste `null` ou absent. */
export function extractFromDom(doc: Document): PageExtraction {
  const guaranteeZones = [
    ...[...doc.querySelectorAll('table')].filter(table => guaranteesFromTable(table as HTMLTableElement).length > 0),
    ...listsUnder(doc, GUARANTEE_SECTION),
    ...listsUnder(doc, EXCLUSION_SECTION),
  ];
  const { prices, generalDeductible } = priceCandidates(doc, guaranteeZones);
  const pageText = visibleText(doc.body);

  return {
    offer: {
      quoteNumber: extractQuoteNumber(pageText),
      premiumAnnual: best(prices.filter(p => p.period === 'annual')),
      premiumMonthly: best(prices.filter(p => p.period === 'monthly')),
      deductibles: generalDeductible === null ? {} : { general: generalDeductible },
      guarantees: extractGuarantees(doc),
      exclusions: extractExclusions(doc),
    },
    resultHeading: hasResultHeading(doc),
  };
}

/**
 * La page affichée est-elle la page de résultat ? `fillableFields` : champs de la page que l'extension saurait remplir
 * avec le dossier ; une page qui demande encore les informations du client est un formulaire, pas un résultat.
 * - `found` : titre de résultat (ou numéro de devis) et prime lue ;
 * - `likely` : titre de résultat (ou numéro de devis), mais aucune prime lue dans le DOM (l'IA peut aider) ;
 * - `none` : ce n'est pas une page de résultat.
 */
export function detectResultPage(extraction: PageExtraction, fillableFields: number): 'found' | 'likely' | 'none' {
  if (fillableFields >= 3) return 'none';
  const signal = extraction.resultHeading || extraction.offer.quoteNumber !== null;
  if (!signal) return 'none';
  return hasPremium(extraction.offer) ? 'found' : 'likely';
}
