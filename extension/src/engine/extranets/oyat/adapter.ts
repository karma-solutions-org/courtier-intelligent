import type { ExtranetAdapter } from '../adapter';
import { genericAdapter } from '../generic';

/**
 * Oyat (extranet.oyat-assurances.fr) :
 * - un champ obligatoire est marqué par une IMAGE dans le label de sa ligne, sans astérisque en texte :
 *   `<div class="ligne"><label for="oNom">Nom :<img src="…/ressources/images/asterisque.gif"></label>…`.
 */
export const oyatAdapter: ExtranetAdapter = {
  ...genericAdapter,
  id: 'oyat',

  isRequired: element => element.closest('.ligne')?.querySelector('label img[src*="asterisque"]') != null,
};
