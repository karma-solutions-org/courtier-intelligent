import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeForm } from './analyzer';
import { detectResultPage, extractFromDom } from './capture';
import { mapFields } from './mapping';
import { toDiscoveredFields } from './memory';
import { detectStepHint, isFinalStep } from './steps';

/**
 * Extranet de démonstration Habitation (`demo-extranet-habitation/`, servi sur http://localhost:8091) : sert à tester
 * l'ajout automatique des champs au questionnaire. Les champs du souscripteur sont reconnus ; ceux du logement et des
 * garanties ne le sont pas : les obligatoires (*) sont signalés, les facultatifs non (ils ne bloquent pas le devis).
 */

const load = (page: string) => {
  const html = readFileSync(resolve(__dirname, '../../demo-extranet-habitation', page), 'utf8');
  document.open();
  document.write(html);
  document.close();
};

/** Questions d'un produit Habitation « vierge » : seulement le souscripteur. */
const HABITATION_PATHS = [
  'client.lastName', 'client.firstName', 'client.birthDate', 'client.email', 'client.phone',
  'client.address.street', 'client.address.postalCode', 'client.address.city',
];

/** Champs signalés au serveur pour ce produit : libellé → obligatoire. */
const discovered = () => {
  const { fields } = analyzeForm(document);
  return Object.fromEntries(
    toDiscoveredFields(fields, mapFields(fields), HABITATION_PATHS).map(f => [f.label.replace(/\s*\*$/, ''), f.required === true]),
  );
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Extranet de démonstration Habitation', () => {
  it('étape 1 : reconnaît le souscripteur, signale la situation familiale (obligatoire), pas les occupants (facultatif)', () => {
    load('devis-etape1.html');
    const { fields } = analyzeForm(document);
    const paths = mapFields(fields).filter(m => m.status === 'mapped').map(m => m.canonicalPath);
    expect(paths).toEqual(expect.arrayContaining(['client.lastName', 'client.firstName', 'client.email']));
    expect(discovered()).toMatchObject({ 'Situation familiale': true });
    expect(discovered()).not.toHaveProperty("Nombre d'occupants");
    expect(detectStepHint(document)).toMatchObject({ current: 1, total: 3 });
  });

  it('étape 2 : signale les champs obligatoires du logement, pas les facultatifs', () => {
    load('devis-etape2.html');
    const found = discovered();
    expect(found).toMatchObject({
      'Type de logement': true,
      "Qualité de l'occupant": true,
      'Surface habitable (m²)': true,
      'Nombre de pièces principales': true,
      'Résidence principale': true,
    });
    for (const optional of ['Étage (appartement)', 'Année de construction', 'Dépendances']) expect(found).not.toHaveProperty(optional);
  });

  it('étape 3 : signale garanties et antécédents, et la reconnaît comme dernière étape', () => {
    load('devis-etape3.html');
    expect(discovered()).toMatchObject({
      'Capital mobilier à garantir (€)': true,
      'Nombre de sinistres habitation sur 5 ans': true,
      'Résilié par un précédent assureur': true,
    });
    expect(discovered()).not.toHaveProperty('Valeur des objets de valeur (€)');
    expect(isFinalStep(document, detectStepHint(document))).toBe(true);
  });

  it('page de résultat : tarif capturé', () => {
    load('resultat.html');
    const fillable = mapFields(analyzeForm(document).fields).filter(m => m.status === 'mapped').length;
    const extraction = extractFromDom(document);
    expect(detectResultPage(extraction, fillable)).toBe('found');
    expect(extraction.offer.quoteNumber).toBe('HAB-DEMO-2026-0007');
    expect(extraction.offer.premiumAnnual).toBe(286);
    expect(extraction.offer.guarantees.length).toBeGreaterThan(5);
  });
});
