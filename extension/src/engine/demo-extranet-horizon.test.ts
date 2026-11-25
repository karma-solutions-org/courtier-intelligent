import type { CanonicalData } from '@shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext, RunState } from '../shared/messages';
import { analyzeForm } from './analyzer';
import { detectResultPage, extractFromDom } from './capture';
import { mapFields } from './mapping';
import { FormRunner } from './runner';
import { detectStepHint, isFinalStep } from './steps';

/**
 * Second extranet de démonstration, « Horizon Assurances » (`demo-extranet-horizon/`, http://localhost:8091) : un
 * seul long formulaire en volets (véhicule, conducteur, souscripteur), libellés et listes formulés autrement que
 * l'Assureur Test, cases multiples (immatriculation, date de naissance, téléphone), boutons radio et liste déroulante
 * maison. Le vrai moteur doit tout relier sans IA, tout remplir, puis lire la cotisation calculée par la page.
 */

const DIR = resolve(__dirname, '../../demo-extranet-horizon');
const APP = readFileSync(resolve(DIR, 'app.js'), 'utf8');

const load = (page: string) => {
  document.open();
  document.write(readFileSync(resolve(DIR, page), 'utf8'));
  document.close();
};
/** Exécute le script de la page (jsdom ne charge pas les `<script src>` écrits par `document.write`). */
const runApp = () => new Function(APP)();

const mapped = () => {
  const { fields } = analyzeForm(document);
  return Object.fromEntries(
    mapFields(fields)
      .filter(m => m.status === 'mapped' && m.canonicalPath)
      .map(m => [m.canonicalPath!, fields.find(f => f.key === m.fieldKey)!]),
  );
};

const QUOTE_DATA: CanonicalData = {
  'client.lastName': 'Martin',
  'client.firstName': 'Claire',
  'client.birthDate': '1990-04-18',
  'client.email': 'claire.martin@example.fr',
  'client.phone': '06 12 34 56 78',
  'client.address.street': '12 rue des Lilas',
  'client.address.postalCode': '69003',
  'client.address.city': 'Lyon',
  'vehicle.registration': 'AB-123-CD',
  'vehicle.vehicleType': 'voiture',
  'vehicle.brand': 'Peugeot',
  'vehicle.model': '208',
  'vehicle.version': 'Allure',
  'vehicle.firstRegistrationDate': '2021-06-15',
  'vehicle.fiscalPower': 5,
  'vehicle.energyType': 'essence',
  'vehicle.vehicleValue': 18500,
  'vehicle.usage': 'prive_trajet',
  'vehicle.parkingType': 'voie_publique',
  'driver.lastName': 'Martin',
  'driver.firstName': 'Claire',
  'driver.birthDate': '1990-04-18',
  'driver.licenseDate': '2009-09-01',
  'driver.profession': 'Infirmière',
  'insuranceHistory.currentlyInsured': true,
  'insuranceHistory.previousInsurer': 'MAAF',
  'insuranceHistory.bonusMalus': { value: 0.85, knowledge: 'KNOWN' },
  'insuranceHistory.claimsCount': { value: 1, knowledge: 'KNOWN' },
  'insuranceHistory.wasTerminated': false,
  // Ancienneté présente : « Êtes-vous assuré actuellement ? » (Oui / Non) ne doit pas recevoir les 48 mois.
  'insuranceHistory.seniority': { value: 48, knowledge: 'KNOWN' },
  'driver.licenseType': 'B',
};

const job: JobContext = {
  dossierId: 'dossier-horizon',
  insurerId: 'assureur-horizon-local',
  insurerName: 'Horizon Assurances (démo locale)',
  status: 'requested',
  quoteData: QUOTE_DATA,
  missingFields: [],
};

const byId = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const byName = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const checkedValue = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? null;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition: () => boolean, timeoutMs = 8000): Promise<void> {
  for (const started = Date.now(); !condition(); await pause(20)) {
    if (Date.now() - started > timeoutMs) throw new Error('Délai dépassé.');
  }
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Extranet de démonstration Horizon Assurances', () => {
  it("le portail n'a aucun champ (ni mot de passe) et mène au projet auto", () => {
    load('index.html');
    expect(analyzeForm(document).fields).toEqual([]);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector('a[href="projet-auto.html"]')?.textContent).toContain('Ouvrir un projet auto');
  });

  it('projet auto : une seule page, tous les champs reliés sans IA', () => {
    load('projet-auto.html');
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
        'vehicle.energyType',
        'vehicle.vehicleValue',
        'vehicle.usage',
        'vehicle.parkingType',
        'driver.lastName',
        'driver.firstName',
        'driver.birthDate',
        'driver.licenseDate',
        'driver.profession',
        'driver.licenseType',
        'insuranceHistory.seniority',
        'insuranceHistory.currentlyInsured',
        'insuranceHistory.previousInsurer',
        'insuranceHistory.bonusMalus',
        'insuranceHistory.claimsCount',
        'insuranceHistory.wasTerminated',
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
    expect(analyzeForm(document).fields).toHaveLength(31);
    // Saisies en plusieurs cases, et liste déroulante maison.
    expect(byPath['vehicle.registration'].inputType).toBe('segmented');
    expect(byPath['vehicle.registration'].segments).toEqual([2, 3, 2]);
    expect(byPath['driver.birthDate'].inputType).toBe('split-dmy');
    expect(byPath['client.phone'].segments).toEqual([2, 2, 2, 2, 2]);
    expect(byPath['vehicle.parkingType'].inputType).toBe('custom-select');
    expect(byPath['vehicle.usage'].kind).toBe('radio');
    expect(byPath['vehicle.firstRegistrationDate'].kind).toBe('text');
    expect(byPath['insuranceHistory.claimsCount'].kind).toBe('select');
    expect(byPath['vehicle.vehicleType'].options.map(o => o.value)).toEqual(['VP', 'VU', '2R']);
    // Curseur (type range) rempli comme un nombre ; liste à choix multiples comme une liste.
    expect(byPath['insuranceHistory.seniority']).toMatchObject({ kind: 'number', inputType: 'range' });
    expect(byPath['driver.licenseType']).toMatchObject({ kind: 'select', label: 'Permis détenus' });
    // Pas d'indicateur d'étape : le bouton « Calculer la cotisation » fait de la page la dernière.
    const hint = detectStepHint(document);
    expect(hint).toEqual({ current: null, total: null });
    expect(isFinalStep(document, hint)).toBe(true);
  });

  it('page de cotisation (valeurs par défaut) : tarif capturé', () => {
    load('cotisation.html');
    const fillable = mapFields(analyzeForm(document).fields).filter(m => m.status === 'mapped').length;
    const extraction = extractFromDom(document);
    expect(detectResultPage(extraction, fillable)).toBe('found');
    const { offer } = extraction;
    expect(offer.quoteNumber).toBe('HZN-2026-0815');
    expect(offer.premiumAnnual).toBe(1012.4);
    expect(offer.premiumMonthly).toBe(86.9);
    expect(offer.deductibles).toEqual({ general: 250 });
    expect(offer.guarantees).toHaveLength(8);
    expect(offer.guarantees.find(g => g.label === 'Bris de glace')).toEqual({ label: 'Bris de glace', included: true, limit: null, deductible: 75 });
    expect(offer.guarantees.find(g => g.label === 'Sécurité du conducteur')?.limit).toBe(500000);
    expect(offer.guarantees.find(g => g.label === 'Dommages tous accidents')?.included).toBe(false);
    expect(offer.exclusions).toHaveLength(4);
  });

  it('parcours complet : le moteur remplit la page, le courtier calcule, la cotisation calculée est lue', async () => {
    load('projet-auto.html');
    runApp();
    const states: RunState[] = [];
    const runner = new FormRunner(job, {
      doc: document,
      report: async () => undefined,
      publish: state => void states.push(state),
      askAi: async () => '{"mappings":[]}',
      origin: 'http://localhost:8091',
      autoAdvance: true,
      quietMs: 40,
      settleTimeoutMs: 1000,
    });
    await runner.start();
    await until(() => states.some(state => state.phase === 'awaiting_submit'));
    runner.stop();

    // Cases multiples, liste maison, radios, listes aux libellés propres à Horizon.
    expect(['hz-immat-1', 'hz-immat-2', 'hz-immat-3'].map(id => byId(id).value)).toEqual(['AB', '123', 'CD']);
    expect(byId<HTMLSelectElement>('hz-categorie').value).toBe('VP');
    expect(byId('hz-dmec').value).toBe('15/06/2021');
    expect(byId<HTMLSelectElement>('hz-cv').value).toBe('5');
    expect(byId<HTMLSelectElement>('hz-energie').value).toBe('ES');
    expect(checkedValue('usageDeclare')).toBe('TRAJET');
    expect(byId('hz-garage').getAttribute('data-value')).toBe('RUE');
    expect(byId('hz-garage').textContent).toBe('Dans la rue');
    expect(['cond_naiss_jour', 'cond_naiss_mois', 'cond_naiss_annee'].map(name => byName(name).value)).toEqual(['18', '04', '1990']);
    expect(byId('hz-permis').value).toBe('2009-09-01');
    expect(checkedValue('assureActuel')).toBe('O');
    expect(byId('hz-anciennete').value).toBe('48');
    expect(byId('hz-anciennete-val').textContent).toBe('48 mois');
    expect([...byId<HTMLSelectElement>('hz-permis-detenus').selectedOptions].map(o => o.value)).toEqual(['B']);
    expect(byId('hz-crm').value).toBe('0.85');
    expect(byId<HTMLSelectElement>('hz-sinistres').value).toBe('1');
    expect(checkedValue('resiliation')).toBe('N');
    expect(byId('hz-sous-nom').value).toBe('Martin');
    expect(byId('hz-sous-naissance').value).toBe('1990-04-18');
    expect(['tel_1', 'tel_2', 'tel_3', 'tel_4', 'tel_5'].map(name => byName(name).value).join(' ')).toBe('06 12 34 56 78');
    expect(byId('hz-cp').value).toBe('69003');
    // L'extension n'a pas soumis : le courtier clique lui-même sur « Calculer la cotisation ».
    expect(sessionStorage.getItem('horizon-projet-auto')).toBeNull();

    vi.useFakeTimers();
    document.querySelector<HTMLButtonElement>('#hz-projet button[type="submit"]')!.click();
    const saved = JSON.parse(sessionStorage.getItem('horizon-projet-auto') ?? '{}');
    expect(saved).toMatchObject({ ancienneteMois: '48', permisDetenus: ['B'], immatriculation: 'AB-123-CD', dmec: '2021-06-15', condNaissance: '1990-04-18', garage: 'RUE', crm: '0.85', telephone: '0612345678' });
    vi.clearAllTimers();
    vi.useRealTimers();

    // Page « Votre cotisation » : calculée à partir des réponses, puis lue par le moteur.
    load('cotisation.html');
    runApp();
    const shown = (id: string) => Number(byId(id).textContent!.replace(/[^\d,]/g, '').replace(',', '.'));
    const extraction = extractFromDom(document);
    expect(detectResultPage(extraction, 0)).toBe('found');
    expect(extraction.offer.premiumAnnual).toBe(shown('hz-annuelle'));
    expect(extraction.offer.premiumMonthly).toBe(shown('hz-mensuelle'));
    expect(extraction.offer.premiumAnnual).not.toBe(1012.4);
    expect(extraction.offer.premiumMonthly).toBeCloseTo((extraction.offer.premiumAnnual! * 1.03) / 12, 2);
    expect(extraction.offer.quoteNumber).toMatch(/^HZN-\d{4}-\d{4}$/);
  }, 20_000);
});
