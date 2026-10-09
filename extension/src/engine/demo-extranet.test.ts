import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeForm } from './analyzer';
import { detectResultPage, extractFromDom } from './capture';
import { mapFields } from './mapping';
import { detectStepHint, isFinalStep } from './steps';

/**
 * L'extranet de démonstration (`demo-extranet/`, servi sur http://localhost:8090) doit être reconnu par le vrai
 * moteur : champs analysés, chemins canoniques mappés sans IA, étapes détectées, tarif capturé.
 */

const load = (page: string) => {
  const html = readFileSync(resolve(__dirname, '../../demo-extranet', page), 'utf8');
  document.open();
  document.write(html);
  document.close();
};

const mapped = () => {
  const { fields } = analyzeForm(document);
  return Object.fromEntries(
    mapFields(fields)
      .filter(m => m.status === 'mapped' && m.canonicalPath)
      .map(m => [m.canonicalPath!, fields.find(f => f.key === m.fieldKey)!]),
  );
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Extranet de démonstration', () => {
  it("la page de connexion n'a aucun champ (ni mot de passe) et mène au devis", () => {
    load('index.html');
    expect(analyzeForm(document).fields).toEqual([]);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector('a[href="devis-etape1.html"]')?.textContent).toContain("Accéder à l'espace courtier");
  });

  it('étape 1 : souscripteur', () => {
    load('devis-etape1.html');
    expect(analyzeForm(document).fields).toHaveLength(8);
    expect(Object.keys(mapped()).sort()).toEqual(
      [
        'client.lastName',
        'client.firstName',
        'client.birthDate',
        'client.email',
        'client.phone',
        'client.address.street',
        'client.address.postalCode',
        'client.address.city',
      ].sort(),
    );
    const hint = detectStepHint(document);
    expect(hint).toEqual({ current: 1, total: 3 });
    expect(isFinalStep(document, hint)).toBe(false);
  });

  it('étape 2 : véhicule, listes compatibles avec les choix du questionnaire', () => {
    load('devis-etape2.html');
    const byPath = mapped();
    expect(Object.keys(byPath).sort()).toEqual(
      [
        'vehicle.registration',
        'vehicle.vehicleType',
        'vehicle.brand',
        'vehicle.model',
        'vehicle.version',
        'vehicle.firstRegistrationDate',
        'vehicle.fiscalPower',
        'vehicle.vehicleValue',
        'vehicle.usage',
        'vehicle.parkingType',
      ].sort(),
    );
    expect(byPath['vehicle.usage'].options.map(o => o.value)).toEqual(['prive', 'prive_trajet', 'professionnel']);
    expect(byPath['vehicle.parkingType'].options.map(o => o.value)).toEqual(['garage_prive', 'parking_ferme', 'voie_publique']);
    expect(byPath['vehicle.vehicleType'].options.map(o => o.value)).toEqual(['voiture', 'utilitaire', 'moto']);
    expect(byPath['vehicle.firstRegistrationDate'].kind).toBe('date');
    expect(byPath['vehicle.fiscalPower'].kind).toBe('number');
    const hint = detectStepHint(document);
    expect(hint).toEqual({ current: 2, total: 3 });
    expect(isFinalStep(document, hint)).toBe(false);
  });

  it('étape 3 : conducteur et antécédents, dernière étape', () => {
    load('devis-etape3.html');
    const byPath = mapped();
    expect(Object.keys(byPath).sort()).toEqual(
      [
        'driver.lastName',
        'driver.firstName',
        'driver.birthDate',
        'driver.licenseDate',
        'driver.licenseType',
        'driver.profession',
        'insuranceHistory.currentlyInsured',
        'insuranceHistory.previousInsurer',
        'insuranceHistory.bonusMalus',
        'insuranceHistory.claimsCount',
        'insuranceHistory.wasTerminated',
      ].sort(),
    );
    expect(byPath['driver.licenseType'].options.map(o => o.value)).toEqual(['B', 'A', 'AAC']);
    expect(byPath['insuranceHistory.currentlyInsured'].kind).toBe('radio');
    expect(byPath['insuranceHistory.wasTerminated'].options.map(o => o.label)).toEqual(['Oui', 'Non']);
    expect(byPath['insuranceHistory.previousInsurer'].kind).toBe('autocomplete');
    const hint = detectStepHint(document);
    expect(hint).toEqual({ current: 3, total: 3 });
    expect(isFinalStep(document, hint)).toBe(true);
  });

  it('page de résultat : tarif capturé', () => {
    load('resultat.html');
    const fillable = mapFields(analyzeForm(document).fields).filter(m => m.status === 'mapped').length;
    const extraction = extractFromDom(document);
    expect(detectResultPage(extraction, fillable)).toBe('found');
    const { offer } = extraction;
    expect(offer.quoteNumber).toBe('DEMO-2026-0042');
    expect(offer.premiumAnnual).toBe(642);
    expect(offer.premiumMonthly).toBe(53.5);
    expect(offer.deductibles).toEqual({ general: 300 });
    expect(offer.guarantees).toHaveLength(9);
    expect(offer.guarantees.find(g => g.label === 'Bris de glace')).toEqual({ label: 'Bris de glace', included: true, limit: null, deductible: 150 });
    expect(offer.guarantees.find(g => g.label === 'Garantie du conducteur')?.limit).toBe(300000);
    expect(offer.guarantees.find(g => g.label === 'Dommages tous accidents')?.included).toBe(false);
    expect(offer.exclusions).toHaveLength(3);
  });
});
