import type { ExtranetAdapter } from '../adapter';
import { findAddRowByLabel, nearestClickable } from '../generic';

/**
 * Zephir (zeole.zephir.fr, Angular Material) :
 * - formulaires « template » (ngModel, sans formcontrolname) : un champ obligatoire encore vide porte « ng-invalid »
 *   sur son groupe Material (Oui / Non des « Déclarations complémentaires », boutons radio, listes) ;
 * - « Ajouter un sinistre » est un `<span>` suivi d'une icône ⊕ (`<svg>`) dans `div.btnAjoutTable`.
 */
const MATERIAL_GROUP = 'mat-button-toggle-group, mat-radio-group, mat-select';

export const zephirAdapter: ExtranetAdapter = {
  id: 'zephir',

  isRequired: element => element.closest(MATERIAL_GROUP)?.classList.contains('ng-invalid') === true,

  findAddRowButton(doc, table) {
    if (table === 'claims') {
      // Sélecteur direct : pas de parcours de toute la page.
      const blocks = [...doc.querySelectorAll<HTMLElement>('.btnAjoutTable')].filter(
        block => !block.closest('[hidden]') && /sinistre/i.test(block.textContent ?? ''),
      );
      if (blocks.length === 1) {
        const text = [...blocks[0].querySelectorAll('span')].find(span => /sinistre/i.test(span.textContent ?? ''));
        return text ? nearestClickable(text) : blocks[0];
      }
    }
    return findAddRowByLabel(doc, table);
  },
};
