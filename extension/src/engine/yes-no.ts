import type { CanonicalPath } from '@shared';

/**
 * Réponse Oui / Non qu'implique un choix du dossier, quand l'extranet pose la question autrement (« Garage » ← lieu de
 * stationnement « garage privé »). Source unique : le mapping (quelle question peut viser quel chemin) et le
 * remplissage (quelle case cocher) lisent la même table.
 */
export const YES_NO_FROM_CHOICE: Partial<Record<CanonicalPath, Record<string, boolean>>> = {
  'vehicle.parkingType': { garage_prive: true, parking_ferme: false, voie_publique: false },
};

/** Le chemin a-t-il une traduction en oui / non ? */
export const translatesToYesNo = (path: CanonicalPath): boolean => path in YES_NO_FROM_CHOICE;

/** Oui / non qu'implique la valeur `value` (code de choix) d'un chemin quelconque, ou `undefined`. */
export function yesNoFromChoice(value: string): boolean | undefined {
  for (const table of Object.values(YES_NO_FROM_CHOICE)) {
    if (table && value in table) return table[value];
  }
  return undefined;
}
