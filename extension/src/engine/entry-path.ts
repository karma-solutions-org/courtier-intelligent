/**
 * Chemin d'accès au formulaire de devis (profil d'extranet, brique 1) : décrire un clic du courtier en mode
 * apprentissage, puis retrouver l'élément à cliquer au rejeu. Structure seulement : texte du bouton, position, page.
 */
import { FORBIDDEN_NAV_LABEL, NAV_LABEL_MAX, NavAction, sanitizeNavAction, urlPatternOf } from '@shared';

/** Éléments qui naviguent : liens, boutons, entrées de menu et onglets. */
const CLICKABLE =
  'a[href], button, input[type="submit"], input[type="button"], [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"]';

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** Texte de l'élément tel que le courtier le voit (ou son libellé accessible pour une icône seule). */
export function labelOf(el: HTMLElement): string {
  const text = el instanceof HTMLInputElement ? el.value : el.textContent;
  return clean(text) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'));
}

const isVisible = (el: HTMLElement) =>
  !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled && el.ownerDocument.defaultView?.getComputedStyle(el).display !== 'none';

/**
 * Sélecteur CSS de l'élément : par son `id` s'il en a un simple (lettres, `-`, `_` ; sans chiffre : un id généré
 * change à chaque visite), sinon la suite des balises et de leur rang depuis l'ancêtre identifié le plus proche.
 */
export function selectorOf(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== node.ownerDocument.documentElement && parts.length < 8) {
    if (/^[A-Za-z_-]+$/.test(node.id)) {
      parts.unshift(`#${node.id}`);
      break;
    }
    const parent: Element | null = node.parentElement;
    const tag = node.tagName.toLowerCase();
    const sameTag = parent ? [...parent.children].filter(child => child.tagName === node!.tagName) : [];
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag);
    node = parent;
  }
  return parts.join(' > ');
}

/** Le clic du courtier, s'il a lieu sur un élément de navigation : sinon null (clic dans un champ, sur du texte…). */
export function describeClick(target: EventTarget | null, url: string): NavAction | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>(CLICKABLE);
  if (!el) return null;
  const label = labelOf(el).slice(0, NAV_LABEL_MAX);
  return sanitizeNavAction({ label, selector: selectorOf(el), urlPattern: urlPatternOf(url) });
}

/**
 * L'élément à cliquer pour rejouer `action` : l'élément visible qui porte exactement ce texte ; s'il y en a plusieurs,
 * celui à la position enregistrée (sinon aucun : dans le doute, on ne clique pas). Jamais un bouton interdit.
 */
export function findActionTarget(doc: Document, action: NavAction): HTMLElement | null {
  if (FORBIDDEN_NAV_LABEL.test(action.label)) return null;
  const wanted = action.label.toLowerCase();
  const found = [...doc.querySelectorAll<HTMLElement>(CLICKABLE)].filter(el => isVisible(el) && labelOf(el).toLowerCase() === wanted);
  // Lien dans une entrée de menu (même texte) : un seul élément, le plus profond.
  const matches = found.filter(el => !found.some(other => other !== el && el.contains(other)));
  if (matches.length <= 1) return matches[0] ?? null;
  let atSelector: HTMLElement | null = null;
  try {
    atSelector = action.selector ? doc.querySelector<HTMLElement>(action.selector) : null;
  } catch {
    atSelector = null; // sélecteur devenu invalide
  }
  return atSelector ? (matches.find(el => el === atSelector || el.contains(atSelector)) ?? null) : null;
}
