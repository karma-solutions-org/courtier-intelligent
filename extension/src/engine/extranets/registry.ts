import type { ExtranetDefinition } from './adapter';
import { zephirAdapter } from './zephir/adapter';

/**
 * Extranets qui ont un comportement propre (un dossier `extranets/<insurerId>/` chacun). Les autres assureurs du
 * catalogue utilisent le comportement générique : on n'ajoute un extranet ici que lorsqu'il diffère vraiment.
 * `npm run extranet:new -- <insurerId> <domaine>` crée le dossier et ajoute la ligne (repères ci-dessous, ne pas les retirer).
 */
export const EXTRANETS: readonly ExtranetDefinition[] = [
  { insurerId: 'zephir', hosts: ['zephir.fr'], adapter: zephirAdapter },
  // extranet:new — nouvelles lignes au-dessus de ce repère
];
