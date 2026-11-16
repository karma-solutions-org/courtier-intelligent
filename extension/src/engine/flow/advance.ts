import type { FormAnalysis } from '../analyzer';
import { findNextButton, findSearchButton, hasValidationErrors } from '../steps';

/** Empreinte courte du texte d'une page (en-tête et menus compris : seul le contenu fait la différence). */
export function textHash(text: string): string {
  let hash = 0;
  for (const char of text.replace(/\s+/g, ' ').trim()) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return hash.toString(36);
}

/**
 * Clé de l'étape affichée, pour ne cliquer « Suivant » qu'une fois par étape. Les pages sans champ ont toutes la même
 * empreinte : on les distingue par leur texte (« Résumé », « sinistres »…).
 */
export function stepKey(analysis: FormAnalysis, doc: Document): string {
  return analysis.fields.length ? analysis.fingerprint : `${analysis.fingerprint}|${textHash(doc.body.textContent ?? '')}`;
}

/** La page sans champ `key` a-t-elle été remplacée (son texte a changé) ? */
export function leftTextPage(key: string, doc: Document): boolean {
  return key.includes('|') && !key.endsWith(`|${textHash(doc.body.textContent ?? '')}`);
}

/**
 * Bouton qui fait avancer l'étape : « Suivant », sinon (pas de « Suivant ») le « Rechercher » du bloc rempli
 * (véhicule par caractéristique), dont il faudra ensuite choisir un résultat.
 */
export function advanceButton(doc: Document, filled: HTMLElement[]): { button: HTMLElement; search: boolean } | null {
  const next = findNextButton(doc);
  if (next) return { button: next, search: false };
  const search = findSearchButton(doc, filled);
  return search ? { button: search, search: true } : null;
}

/** Message au courtier quand l'extranet n'a pas changé d'étape après « Suivant ». */
export function refusalMessage(doc: Document): string {
  return hasValidationErrors(doc)
    ? 'L’extranet a refusé cette étape : corrigez les champs signalés, puis cliquez vous-même sur « Suivant ».'
    : 'L’extranet n’est pas passé à l’étape suivante : vérifiez la page, puis cliquez vous-même sur « Suivant ».';
}

/**
 * Étapes où « Suivant » a déjà été cliqué : un seul essai, l'extranet peut la refuser. Vidé à chaque nouvelle étape :
 * deux pages de même structure qui se suivent (antécédents du conducteur principal puis du secondaire, sur Zephir)
 * sont deux étapes, chacune son « Suivant ».
 */
export class AdvanceGuard {
  private readonly tried = new Set<string>();

  reset(): void {
    this.tried.clear();
  }

  /** Premier essai sur cette étape ? Le marque essayé. */
  firstTry(key: string): boolean {
    if (this.tried.has(key)) return false;
    this.tried.add(key);
    return true;
  }
}
