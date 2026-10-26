import type { CanonicalData } from '@shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { JobContext } from '../../../shared/messages';
import { runJourney } from '../testing/journey';
import { mountOyat, OYAT_ORIGIN, OYAT_PAGES } from './fixture';

/**
 * PARCOURS OYAT (étape « Conducteur 1 », relevée le 26/10/2026) jusqu'à la page suivante. Les questions ajoutées depuis
 * Zephir gardent leurs codes de choix (`M`, `Monsieur`) : Oyat n'affiche que des libellés.
 */
const QUOTE_DATA: CanonicalData = {
  'driver.lastName': 'Martin',
  'driver.firstName': 'Paul',
  'driver.birthDate': '1985-10-16',
  'driver.birthCountry': 'Tunisie',
  'driver.licenseDate': '2014-03-18',
  'driver.licenseCountry': 'France',
  'driver.profession': 'Salarié Sédentaire',
  'client.address.postalCode': '13010',
  'client.address.street': '1 rue de test',
  'client.address.city': 'MARSEILLE',
  'client.phone': '0491000000',
  'client.email': 'paul.martin@exemple.fr',
  'insuranceHistory.currentlyInsured': true,
  'insuranceHistory.seniority': { value: 32, knowledge: 'KNOWN' },
  'insuranceHistory.wasTerminated': false,
  'insuranceHistory.bonusMalus': 0.95,
  'insuranceHistory.claimsCount': { value: 0, knowledge: 'KNOWN' },
  // Fin de l'ancien contrat : jamais la date d'effet du nouveau (champ laissé à l'extranet).
  'insuranceHistory.previousContractStartDate': '2022-10-05',
  'extra.civilite': 'Monsieur',
  'extra.situation_matrimoniale': 'M',
  'extra.ville_naissance': 'Tunis',
};

const job: JobContext = {
  dossierId: 'dossier-oyat',
  insurerId: 'oyat',
  insurerName: 'Oyat',
  status: 'requested',
  quoteData: QUOTE_DATA,
  missingFields: [],
  productPaths: Object.keys(QUOTE_DATA),
  productQuestions: [
    { path: 'extra.civilite', label: 'Civilité', type: 'choice', choices: ['Madame', 'Monsieur'], choiceLabels: { Madame: 'Madame', Monsieur: 'Monsieur' } },
    {
      path: 'extra.situation_matrimoniale',
      label: 'Situation matrimoniale',
      type: 'choice',
      choices: ['Marié(e)', 'Célibataire'],
      choiceLabels: { M: 'Marié(e)', C: 'Célibataire' },
    },
    { path: 'extra.ville_naissance', label: 'Ville de naissance', type: 'text' },
  ],
};

const checked = (form: HTMLElement, name: string) => form.ownerDocument.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? null;
const value = (form: HTMLElement, name: string) => form.ownerDocument.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? null;

describe('PARCOURS OYAT : étape « Conducteur 1 »', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('lit chaque question de sa ligne, remplit l’étape, puis clique « > Continuer Devis »', async () => {
    const oyat = mountOyat(document);
    oyat.onLeave((_page, form) => ({
      dateEffet: ['oDateReprise_jour', 'oDateReprise_mois', 'oDateReprise_annee'].map(name => value(form, name)).join('/'),
      civilite: checked(form, 'oSexe'),
      villeNaissance: value(form, 'oVilleNaissSaisieLibre'),
      situation: value(form, 'oSituationFam'),
      profession: value(form, 'oProfession'),
      antecedents: checked(form, 'oNbMoisAssuranceV4'),
      resiliation: checked(form, 'oResilAssPrec'),
      crm: value(form, 'oCRM'),
    }));

    await runJourney(oyat, job, { origin: OYAT_ORIGIN, finalPage: 'tarifs' });

    expect(oyat.visited).toEqual(OYAT_PAGES.map(page => page.name));
    // Date d'effet : aucune donnée du dossier n'y correspond, elle reste celle de l'extranet.
    expect(oyat.snapshots['conducteur:dateEffet']).toBe('//');
    expect(oyat.snapshots['conducteur:civilite']).toBe('H');
    expect(oyat.snapshots['conducteur:villeNaissance']).toBe('Tunis');
    // Code `M` (Zephir) → libellé « Marié(e) ».
    expect(oyat.snapshots['conducteur:situation']).toBe('marie');
    expect(oyat.snapshots['conducteur:profession']).toBe('104');
    // 32 mois d'ancienneté → « Oui, 24 mois et plus ».
    expect(oyat.snapshots['conducteur:antecedents']).toBe('24');
    expect(oyat.snapshots['conducteur:resiliation']).toBe('0');
    expect(oyat.snapshots['conducteur:crm']).toBe('0.95');
  }, 30_000);
});
