import type { ExtranetAdapter, RepeatableTable } from './adapter';

/** Libellé du bouton d'ajout de ligne, par tableau. */
const ADD_ROW_LABEL: Record<RepeatableTable, RegExp> = {
  claims: /^(\+\s*)?ajouter\s+(un\s+)?sinistre/i,
};

/** Éléments qui peuvent porter un libellé cliquable (bouton, lien, ou texte simple d'un composant). */
const CLICKABLE_TEXT = 'button, a, [role="button"], span, div, p, label';
/** Élément réellement cliquable à côté d'un libellé en texte simple (icône ⊕, bouton). */
const NEAR_CLICKABLE = 'button, a, [role="button"], mat-icon, fa-icon, svg, i';

const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * Bouton d'ajout de ligne trouvé par son libellé : le plus petit élément qui porte le texte (pas ses ancêtres), puis
 * le bouton qui l'englobe, ou l'icône / le bouton voisin, sinon le texte lui-même (le clic remonte jusqu'au bloc).
 */
export function findAddRowByLabel(doc: Document, table: RepeatableTable): Element | null {
  const pattern = ADD_ROW_LABEL[table];
  const candidates = [...doc.querySelectorAll<HTMLElement>(CLICKABLE_TEXT)].filter(
    el =>
      !el.closest('[hidden]') &&
      !(el as HTMLButtonElement).disabled &&
      pattern.test(textOf(el)) &&
      ![...el.children].some(child => pattern.test(textOf(child))),
  );
  if (candidates.length !== 1) return null;
  return nearestClickable(candidates[0]);
}

/** Le bouton qui englobe le texte, sinon l'élément cliquable voisin, sinon le texte. */
export function nearestClickable(text: Element): Element {
  return text.closest('button, a, [role="button"]') ?? text.parentElement?.querySelector(NEAR_CLICKABLE) ?? text;
}

/** Comportement par défaut : rien de propre à un extranet. */
export const genericAdapter: ExtranetAdapter = {
  id: 'generic',
  isRequired: () => false,
  findAddRowButton: findAddRowByLabel,
};
