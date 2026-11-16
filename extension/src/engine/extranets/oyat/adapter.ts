import type { ExtranetAdapter } from '../adapter';
import { genericAdapter } from '../generic';

/**
 * Oyat (extranet.oyat-assurances.fr) :
 * - un champ obligatoire est marqué par une IMAGE dans le label de sa ligne, sans astérisque en texte :
 *   `<div class="ligne"><label for="oNom">Nom :<img src="…/ressources/images/asterisque.gif"></label>…` ;
 * - une case à cocher posée sur la ligne d'un autre champ en est une option (« Je ne la connais pas » pour
 *   l'immatriculation) : jamais obligatoire.
 */
export const oyatAdapter: ExtranetAdapter = {
  ...genericAdapter,
  id: 'oyat',

  isRequired(element) {
    const line = element.closest('.ligne');
    if (!line?.querySelector('label img[src*="asterisque"]')) return false;
    // Case à cocher sur la ligne d'un autre champ (« Je ne la connais pas » à côté de « Immatriculation * ») : une
    // option de ce champ, pas une question obligatoire à elle seule.
    const isCheckbox = element instanceof HTMLInputElement && element.type === 'checkbox';
    return !(isCheckbox && line.querySelector('input:not([type="checkbox"]):not([type="hidden"]), select, textarea'));
  },
};
