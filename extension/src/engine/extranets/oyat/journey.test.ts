import { learnInsurerQuestions, schemaForInsurers, type CanonicalData, type Question, type QuestionnaireSection } from '@shared';
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

describe('PARCOURS OYAT : le questionnaire apprend ce que demande l’extranet', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('après un parcours, un dossier Oyat ne pose que les questions d’Oyat', async () => {
    const question = (canonicalPath: string): Question => ({ canonicalPath: canonicalPath as Question['canonicalPath'], label: canonicalPath, type: 'text', required: false });
    const discovered = (canonicalPath: string, insurerId: string): Question => ({
      ...question(canonicalPath),
      discoveredOn: [{ insurerId, origin: `https://${insurerId}.test`, fieldKey: canonicalPath }],
    });
    // Questionnaire de l'application : celles d'Oyat, plus d'autres qu'Oyat ne demande pas (Zephir, catalogue).
    const NOT_OYAT = ['client.lastName', 'vehicle.brand', 'vehicle.energyType', 'driver.licenseType', 'insuranceHistory.terminationReason'];
    const oyatPaths = Object.keys(QUOTE_DATA).filter(path => !path.startsWith('extra.'));
    const schema: QuestionnaireSection[] = [
      { title: 'Catalogue', questions: [...oyatPaths, ...NOT_OYAT].map(question) },
      {
        title: 'Questions des assureurs',
        discovered: true,
        questions: [...['extra.civilite', 'extra.situation_matrimoniale', 'extra.ville_naissance'].map(p => discovered(p, 'oyat')), discovered('extra.titulaire_carte_grise', 'zephir')],
      },
    ];

    const { seen } = await runJourney(mountOyat(document), job, { origin: OYAT_ORIGIN, finalPage: 'tarifs' });
    const learned = learnInsurerQuestions(schema, undefined, seen, OYAT_ORIGIN).questions;
    const extras = ['extra.civilite', 'extra.situation_matrimoniale', 'extra.ville_naissance'];
    const pathsOf = (sections: QuestionnaireSection[]) => sections.flatMap(section => section.questions.map(q => q.canonicalPath as string));

    // Appris : seulement ce qu'Oyat a demandé (aucune question d'un autre extranet ou du catalogue hors Oyat).
    expect(learned.length).toBeGreaterThan(10);
    for (const path of learned) expect([...oyatPaths, ...extras], path).toContain(path);
    const learnedOnly = pathsOf(schemaForInsurers(schema, [{ id: 'oyat' }], 'auto', { oyat: learned }));
    for (const path of [...NOT_OYAT, 'extra.titulaire_carte_grise']) expect(learnedOnly, path).not.toContain(path);
    expect(learnedOnly).toEqual(expect.arrayContaining(extras));

    // Avec la liste du catalogue (oyat.json), rien ne manque : les champs que l'extension remplit autrement (pays,
    // ancienneté) y sont.
    const asked = pathsOf(schemaForInsurers(schema, [{ id: 'oyat', questions: { auto: oyatPaths } }], 'auto', { oyat: learned }));
    expect([...asked].sort()).toEqual([...oyatPaths, ...extras].sort());
  }, 30_000);
});
