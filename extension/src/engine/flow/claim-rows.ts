import { MAX_CLAIMS, type CanonicalData } from '@shared';
import type { FormField } from '../analyzer';
import type { ExtranetAdapter } from '../extranets';
import { valueOf } from '../plan';

/** Sinistres déclarés au dossier (0 si inconnu). */
export function declaredClaims(quoteData: CanonicalData): number {
  const claims = valueOf(quoteData['insuranceHistory.claimsCount']);
  return typeof claims === 'number' && claims > 0 ? Math.min(claims, MAX_CLAIMS) : 0;
}

/**
 * Tableau des sinistres d'une étape : une ligne par sinistre du dossier, ajoutée par le bouton de l'extranet
 * (Zephir : « Ajouter un sinistre »). Une seule demande par ligne : si le clic n'ajoute rien, on n'insiste pas.
 */
export class ClaimRows {
  /** Lignes déjà demandées à l'étape affichée. */
  private requested = 0;

  constructor(private readonly adapter: ExtranetAdapter) {}

  /** Nouvelle étape : nouveau tableau. */
  reset(): void {
    this.requested = 0;
  }

  /**
   * Élément à cliquer pour ajouter la ligne suivante, ou `null` (assez de lignes, déjà demandée, pas de bouton).
   * `fields` : champs de l'étape, dont le rang de ligne (`row`) dit combien de lignes le tableau a déjà.
   */
  nextAddButton(doc: Document, fields: readonly FormField[], quoteData: CanonicalData): Element | null {
    const declared = declaredClaims(quoteData);
    const rows = Math.max(0, ...fields.map(f => f.row ?? 0));
    if (rows >= declared || this.requested > rows) return null;
    const button = this.adapter.findAddRowButton(doc, 'claims');
    if (button) this.requested = rows + 1;
    return button;
  }

  /**
   * Le dossier déclare des sinistres et la page a un bouton d'ajout : c'est un tableau de sinistres à remplir, pas une
   * page sans champ à valider (le mot « sinistre » ne suffit pas : le volet « Synthèse » de Zephir l'affiche partout).
   */
  awaitsClaims(doc: Document, quoteData: CanonicalData): boolean {
    return declaredClaims(quoteData) > 0 && this.adapter.findAddRowButton(doc, 'claims') !== null;
  }
}
