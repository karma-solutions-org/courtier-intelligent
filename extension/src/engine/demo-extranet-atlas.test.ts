import type { CanonicalData } from '@shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { JobContext, RunState } from '../shared/messages';
import { analyzeForm } from './analyzer';
import { detectResultPage, extractFromDom } from './capture';
import { mapFields } from './mapping';
import { FormRunner } from './runner';
import { detectStepHint, findNextButton, isFinalStep } from './steps';

/**
 * Troisième extranet de démonstration, « Atlas Mutuelle » (`demo-extranet-atlas/`, http://localhost:8092) : assistant
 * en 4 étapes sur une seule page (antécédents → conducteur → véhicule → souscripteur), barre de progression, boutons
 * radio dessinés, boutons bascule, liste maison, cases à cocher, date en trois listes, tarif affiché au mois sur la
 * même page. Le vrai moteur doit traverser les 4 étapes seul (« Étape suivante »), puis lire la proposition.
 */

const DIR = resolve(__dirname, '../../demo-extranet-atlas');
const APP = readFileSync(resolve(DIR, 'app.js'), 'utf8');

const load = (page: string) => {
  document.open();
  document.write(readFileSync(resolve(DIR, page), 'utf8'));
  document.close();
};
/** Exécute le script de la page (jsdom ne charge pas les `<script src>` écrits par `document.write`). */
const runApp = () => new Function(APP)();

const mappedPaths = () => {
  const { fields } = analyzeForm(document);
  return mapFields(fields)
    .filter(m => m.status === 'mapped' && m.canonicalPath)
    .map(m => m.canonicalPath!)
    .sort();
};

const QUOTE_DATA: CanonicalData = {
  'client.lastName': 'Bernard',
  'client.firstName': 'Lucas',
  'client.birthDate': '1996-02-09',
  'client.email': 'lucas.bernard@example.fr',
  'client.phone': '0698765432',
  'client.address.street': '5 avenue Jean Jaurès',
  'client.address.postalCode': '31000',
  'client.address.city': 'Toulouse',
  'vehicle.registration': 'GH-456-JK',
  'vehicle.vehicleType': 'voiture',
  'vehicle.brand': 'Renault',
  'vehicle.model': 'Clio',
  'vehicle.version': 'Evolution TCe 90',
  'vehicle.firstRegistrationDate': '2022-03-10',
  'vehicle.fiscalPower': 5,
  'vehicle.vehicleValue': 17200,
  'vehicle.usage': 'prive',
  'vehicle.parkingType': 'garage_prive',
  'driver.lastName': 'Bernard',
  'driver.firstName': 'Lucas',
  'driver.birthDate': '1996-02-09',
  'driver.licenseDate': '2015-06-20',
  'driver.licenseType': 'B',
  'driver.socioProfessionalCategory': 'salarie_prive',
  'insuranceHistory.currentlyInsured': true,
  'insuranceHistory.previousInsurer': 'MACIF',
  'insuranceHistory.bonusMalus': { value: 0.68, knowledge: 'KNOWN' },
  'insuranceHistory.claimsCount': { value: 0, knowledge: 'KNOWN' },
  'insuranceHistory.wasTerminated': false,
};

const job: JobContext = {
  dossierId: 'dossier-atlas',
  insurerId: 'assureur-atlas-local',
  insurerName: 'Atlas Mutuelle (démo locale)',
  status: 'requested',
  quoteData: QUOTE_DATA,
  missingFields: [],
};

const byId = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const field = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  for (const started = Date.now(); !condition(); await pause(20)) {
    if (Date.now() - started > timeoutMs) throw new Error('Délai dépassé.');
  }
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Extranet de démonstration Atlas Mutuelle', () => {
  it("l'accueil n'a aucun champ (ni mot de passe) et mène à l'étude", () => {
    load('index.html');
    expect(analyzeForm(document).fields).toEqual([]);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector('a[href="etude.html"]')?.textContent).toContain('Démarrer une étude tarifaire');
  });

  it('chaque étape est reconnue (barre de progression) et ses champs reliés sans IA', () => {
    load('etude.html');
    runApp();
    const steps = [...document.querySelectorAll<HTMLElement>('.atl-etape')];
    const showStep = (index: number) => {
      steps.forEach((step, i) => (step.hidden = i !== index));
      document.querySelector('[role="progressbar"]')!.setAttribute('aria-valuenow', String(index + 1));
    };

    // Étape 1 : la compagnie actuelle n'apparaît qu'après « Oui ».
    expect(detectStepHint(document)).toEqual({ current: 1, total: 4 });
    expect(isFinalStep(document, detectStepHint(document))).toBe(false);
    expect(findNextButton(document)?.textContent).toContain('Étape suivante');
    expect(mappedPaths()).toEqual(
      ['insuranceHistory.currentlyInsured', 'insuranceHistory.bonusMalus', 'insuranceHistory.claimsCount', 'insuranceHistory.wasTerminated'].sort(),
    );
    byId('atl-bloc-assureur').hidden = false;
    expect(mappedPaths()).toContain('insuranceHistory.previousInsurer');
    const step1 = analyzeForm(document).fields;
    expect(step1.find(f => f.label === 'Actuellement assuré(e) ?')?.inputType).toBe('aria-radio');
    expect(step1.find(f => f.label === "Compagnie d'assurance actuelle")?.inputType).toBe('custom-select');
    expect(step1.find(f => f.label.startsWith('Suspension'))?.kind).toBe('checkbox');

    showStep(1);
    expect(mappedPaths()).toEqual(
      ['driver.lastName', 'driver.firstName', 'driver.birthDate', 'driver.licenseDate', 'driver.licenseType', 'driver.socioProfessionalCategory'].sort(),
    );
    const step2 = analyzeForm(document).fields;
    expect(step2.find(f => f.label === 'Date de naissance')?.inputType).toBe('split-dmy');
    expect(step2.find(f => f.label === "Date d'obtention du permis")?.inputType).toBe('month');

    showStep(2);
    expect(mappedPaths()).toEqual(
      [
        'vehicle.vehicleType',
        'vehicle.registration',
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
    expect(analyzeForm(document).fields.find(f => f.label === 'Type de véhicule')?.options.map(o => o.label)).toEqual(['Tourisme', 'Utilitaire', 'Deux-roues']);

    showStep(3);
    expect(mappedPaths()).toEqual(
      ['client.lastName', 'client.firstName', 'client.birthDate', 'client.email', 'client.phone', 'client.address.street', 'client.address.postalCode', 'client.address.city'].sort(),
    );
    expect(detectStepHint(document)).toEqual({ current: 4, total: 4 });
    expect(isFinalStep(document, detectStepHint(document))).toBe(true);
    expect(findNextButton(document)).toBeNull();
  });

  it('parcours complet : 4 étapes remplies et validées par le moteur, puis proposition mensuelle lue', async () => {
    load('etude.html');
    runApp();
    const states: RunState[] = [];
    const runner = new FormRunner(job, {
      doc: document,
      report: async () => undefined,
      publish: state => void states.push(state),
      askAi: async () => '{"mappings":[]}',
      origin: 'http://localhost:8092',
      autoAdvance: true,
      quietMs: 40,
      settleTimeoutMs: 1000,
    });
    const visited = () => Number(document.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow'));
    try {
      await runner.start();
      // Le moteur clique « Étape suivante » sur les étapes 1 à 3, jamais « Découvrir mon tarif ».
      await until(() => visited() === 4 && states.at(-1)?.phase === 'awaiting_submit');

      // Étape 1 (remplie avant de passer) : radio dessiné, liste maison révélée par « Oui », case à cocher.
      expect(document.querySelector('[data-champ="hist_assure"] [aria-checked="true"]')?.getAttribute('data-value')).toBe('oui');
      expect(byId('atl-assureur').getAttribute('data-value')).toBe('MACIF');
      expect(byId('atl-coef').value).toBe('0.68');
      expect(byId('atl-nbsin').value).toBe('0');
      expect(field('hist_resilie').checked).toBe(false);
      expect(field('hist_suspension').checked).toBe(false);
      // Étape 2 : date en trois listes, mois/année, pastilles radio, catégorie socio-professionnelle.
      expect(['cnd_naissance_jour', 'cnd_naissance_mois', 'cnd_naissance_annee'].map(name => field(name).value)).toEqual(['9', '2', '1996']);
      expect(byId('atl-cnd-permis').value).toBe('2015-06');
      expect(document.querySelector<HTMLInputElement>('input[name="cnd_type_permis"]:checked')?.value).toBe('B');
      expect(byId<HTMLSelectElement>('atl-cnd-csp').value).toBe('SAL');
      // Étape 3 : boutons bascule et listes aux libellés propres à Atlas.
      expect(document.querySelector('.atl-bascule [aria-pressed="true"]')?.textContent).toBe('Tourisme');
      expect(byId('atl-veh-immat').value).toBe('GH-456-JK');
      expect(byId<HTMLSelectElement>('atl-veh-usage').value).toBe('U1');
      expect(byId<HTMLSelectElement>('atl-veh-nuit').value).toBe('G');
      // Étape 4 : date de naissance saisie au format indiqué (AAAA-MM-JJ).
      expect(byId('atl-sou-naissance').value).toBe('1996-02-09');
      expect(byId('atl-sou-ville').value).toBe('Toulouse');
      expect(states.some(state => state.phase === 'capture_review')).toBe(false);

      // Le courtier lance le calcul ; la proposition s'affiche sur la même page et le moteur la lit.
      document.querySelector<HTMLButtonElement>('#atl-etude button[type="submit"]')!.click();
      await until(() => states.some(state => state.phase === 'capture_review'));
    } finally {
      runner.stop();
    }
    const offer = states.find(state => state.phase === 'capture_review')!.capture!.offer!;
    const shown = (id: string) => Number(byId(id).textContent!.replace(/[^\d,]/g, '').replace(',', '.'));
    expect(offer.premiumMonthly).toBe(shown('atl-mensuel'));
    expect(offer.premiumAnnual).toBe(shown('atl-annuel'));
    expect(offer.premiumAnnual).toBeCloseTo(offer.premiumMonthly! * 12 * 0.96, 2);
    expect(offer.quoteNumber).toMatch(/^ATL-\d{4}-\d{5}$/);
    expect(offer.deductibles).toEqual({ general: 200 });
    expect(offer.guarantees.map(g => g.label)).toEqual([
      'Responsabilité civile',
      'Défense et recours',
      'Bris de glace',
      'Vol et incendie',
      'Assistance 0 km',
      'Dommages tous accidents',
    ]);
    expect(offer.guarantees.find(g => g.label === 'Vol et incendie')).toEqual({ label: 'Vol et incendie', included: true, limit: 12000, deductible: 200 });
    expect(offer.guarantees.find(g => g.label === 'Assistance 0 km')?.included).toBe(false);
    expect(offer.exclusions).toHaveLength(3);
    expect(detectResultPage(extractFromDom(document), 0)).toBe('found');
  }, 30_000);
});
