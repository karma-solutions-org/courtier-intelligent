import type { CanonicalData } from '@shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JobContext, ProductQuestion, RunState } from '../shared/messages';
import { analyzeForm } from './analyzer';
import { detectResultPage, extractFromDom } from './capture';
import { adapterFor } from './extranets';
import { mapExtraPaths, mapFields } from './mapping';
import { FormRunner } from './runner';
import { detectStepHint, findNextButton, isFinalStep } from './steps';

/**
 * Quatrième extranet de démonstration, « Démo type Oyat (locale) » (`demo-extranet-oyat/`, http://localhost:8093) : la
 * STRUCTURE HTML relevée sur l'extranet réel Oyat (voir extranets/oyat/fixture.ts) servie en vraies pages : une ligne
 * `div.ligne` par question, astérisque « obligatoire » en image, labels sans `for` ou visant un id absent, dates en trois
 * cases, « > Continuer Devis » (lien) d'une étape à l'autre ; étape « Véhicule » inventée dans le même style. Le vrai
 * moteur, avec l'adaptateur Oyat, doit tout relier sans IA, tout remplir, franchir les deux étapes, puis lire le tarif.
 */

const DIR = resolve(__dirname, '../../demo-extranet-oyat');
const APP = readFileSync(resolve(DIR, 'app.js'), 'utf8');
const ORIGIN = 'http://localhost:8093';

const load = (page: string) => {
  document.open();
  document.write(readFileSync(resolve(DIR, page), 'utf8'));
  document.close();
};
/** Exécute le script de la page (jsdom ne charge pas les `<script src>` écrits par `document.write`). */
const runApp = () => new Function(APP)();

const QUOTE_DATA: CanonicalData = {
  'client.lastName': 'Lefèvre',
  'client.firstName': 'Camille',
  'client.birthDate': '1988-11-03',
  'client.email': 'camille.lefevre@example.fr',
  'client.phone': '0612345678',
  'client.address.street': '24 rue Paul Bert',
  'client.address.postalCode': '69003',
  'client.address.city': 'Lyon',
  'driver.lastName': 'Lefèvre',
  'driver.firstName': 'Camille',
  'driver.birthDate': '1988-11-03',
  'driver.birthCountry': 'France',
  'driver.licenseDate': '2007-05-14',
  'driver.licenseCountry': 'France',
  'driver.profession': 'Fonctionnaire Sédentaire',
  'insuranceHistory.currentlyInsured': true,
  'insuranceHistory.seniority': { value: 32, knowledge: 'KNOWN' },
  'insuranceHistory.wasTerminated': false,
  'insuranceHistory.bonusMalus': { value: 0.85, knowledge: 'KNOWN' },
  'insuranceHistory.claimsCount': { value: 1, knowledge: 'KNOWN' },
  'vehicle.registration': 'FG-482-KL',
  'vehicle.brand': 'Peugeot',
  'vehicle.model': '308',
  'vehicle.firstRegistrationDate': '2020-02-27',
  'vehicle.energyType': 'diesel',
  'vehicle.usage': 'prive_trajet',
  'vehicle.parkingType': 'garage_prive',
  'vehicle.parkingPostalCode': '69003',
  // Questions ajoutées au questionnaire depuis l'extranet Oyat (champs découverts).
  'extra.civilite': 'Madame',
  'extra.situation_matrimoniale': 'M',
  'extra.ville_naissance': 'Lyon',
  'extra.permis_aac': false,
  'extra.resiliation_non_paiement': false,
  'extra.resiliation_autre_motif': false,
  'extra.nullite_fausse_declaration': false,
  'extra.troubles_neuromoteurs': false,
};

const EXTRAS: ProductQuestion[] = [
  { path: 'extra.civilite', label: 'Civilité', type: 'choice', choices: ['Madame', 'Monsieur'], choiceLabels: { Madame: 'Madame', Monsieur: 'Monsieur' } },
  { path: 'extra.situation_matrimoniale', label: 'Situation familiale', type: 'choice', choices: ['Célibataire', 'Marié(e)'], choiceLabels: { C: 'Célibataire', M: 'Marié(e)' } },
  { path: 'extra.ville_naissance', label: 'Ville de naissance', type: 'text' },
  { path: 'extra.permis_aac', label: "Permis obtenu dans le cadre de l'AAC", type: 'boolean' },
  { path: 'extra.resiliation_non_paiement', label: 'Avez-vous été résilié pour non-paiement (NPP) ?', type: 'boolean' },
  { path: 'extra.resiliation_autre_motif', label: 'Avez-vous été résilié par la compagnie pour un autre motif ?', type: 'boolean' },
  { path: 'extra.nullite_fausse_declaration', label: 'Avez-vous fait l’objet d’une nullité pour fausse déclaration ?', type: 'boolean' },
  { path: 'extra.troubles_neuromoteurs', label: 'Troubles neuromoteurs et/ou neuropsychiques', type: 'boolean' },
];

const job: JobContext = {
  dossierId: 'dossier-oyat-local',
  insurerId: 'assureur-oyat-local',
  insurerName: 'Démo type Oyat (locale)',
  status: 'requested',
  quoteData: QUOTE_DATA,
  missingFields: [],
  productPaths: Object.keys(QUOTE_DATA),
  productQuestions: EXTRAS,
};

const adapter = adapterFor({ insurerId: job.insurerId });
const EXTRA_QUESTIONS = EXTRAS.map(q => ({ path: q.path as `extra.${string}`, label: q.label, shape: { type: q.type, choices: q.choices } }));

/** Champs de la page reliés sans IA (synonymes, puis questions ajoutées depuis l'extranet), par chemin. */
const mapped = () => {
  const { fields } = analyzeForm(document, adapter);
  return Object.fromEntries(
    mapExtraPaths(fields, mapFields(fields), EXTRA_QUESTIONS)
      .filter(m => m.status === 'mapped' && m.canonicalPath)
      .map(m => [m.canonicalPath!, fields.find(f => f.key === m.fieldKey)!]),
  );
};

const byId = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const value = (name: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? null;
const checkedValue = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? null;
const dateOf = (name: string) => ['jour', 'mois', 'annee'].map(part => value(`${name}_${part}`)).join('/');
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition: () => boolean, explain: () => string, timeoutMs = 10_000): Promise<void> {
  for (const started = Date.now(); !condition(); await pause(20)) {
    if (Date.now() - started > timeoutMs) throw new Error(`Délai dépassé : ${explain()}`);
  }
}

/**
 * Le lien « > Continuer Devis » mène à la page suivante quand l'étape est complète (jsdom ne navigue pas : on note la
 * cible et le test charge la page lui-même, comme le navigateur le ferait). Un seul écouteur à la fois : jsdom garde
 * ceux du document d'une page à l'autre.
 */
interface Leaving {
  target: string | null;
  refused: number;
}
let leaving: Leaving = { target: null, refused: 0 };
let stopWatching = () => {};
function watchLeaving(): Leaving {
  stopWatching();
  const watched: Leaving = { target: null, refused: 0 };
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.('a[href]');
    if (!link) return;
    if (event.defaultPrevented) watched.refused++;
    else watched.target = link.getAttribute('href');
    event.preventDefault();
  };
  document.addEventListener('click', onClick);
  stopWatching = () => document.removeEventListener('click', onClick);
  leaving = watched;
  return watched;
}

/** Lance l'extension sur la page affichée (un content script par page), jusqu'à `done`. */
async function runOnPage(done: (states: RunState[]) => boolean): Promise<RunState[]> {
  const states: RunState[] = [];
  const runner = new FormRunner(job, {
    doc: document,
    report: async () => undefined,
    publish: state => void states.push(state),
    askAi: async () => '{"mappings":[]}',
    origin: ORIGIN,
    autoAdvance: true,
    quietMs: 40,
    settleTimeoutMs: 1000,
  });
  try {
    await runner.start();
    await until(
      () => done(states),
      () => {
        const last = states.at(-1);
        const errors = [...document.querySelectorAll('.ligne.en-erreur > label')].map(l => l.textContent?.trim());
        return `clics refusés ${leaving.refused} ; dernier état ${last?.phase ?? '—'} ${last?.message ?? ''} ; lignes en erreur ${JSON.stringify(errors)} ; champs ${JSON.stringify(last?.fields?.map(f => [f.label, f.status]) ?? [])}`;
      },
    );
  } finally {
    runner.stop();
  }
  return states;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  stopWatching();
  document.body.innerHTML = '';
});

describe('Extranet de démonstration type Oyat', () => {
  it("l'accueil n'a aucun champ (ni mot de passe) et mène au devis automobile", () => {
    load('index.html');
    expect(analyzeForm(document).fields).toEqual([]);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector('a[href="conducteur.html"]')?.textContent).toContain('Nouveau devis automobile');
  });

  it('étape « Conducteur 1 » : chaque question reliée sans IA, obligatoires reconnus par l’astérisque en image', () => {
    load('conducteur.html');
    runApp();
    const byPath = mapped();
    expect(Object.keys(byPath).sort()).toEqual(
      [
        'driver.lastName',
        'driver.firstName',
        'driver.birthDate',
        'driver.birthCountry',
        'driver.licenseDate',
        'driver.licenseCountry',
        'driver.profession',
        // « Téléphone portable » : aucun téléphone du conducteur au dossier, le champ reste vide (facultatif).
        'driver.phone',
        'client.address.postalCode',
        'client.address.street',
        'client.address.city',
        'client.email',
        'insuranceHistory.currentlyInsured',
        'insuranceHistory.wasTerminated',
        'insuranceHistory.bonusMalus',
        'insuranceHistory.claimsCount',
        'extra.civilite',
        'extra.situation_matrimoniale',
        'extra.ville_naissance',
        'extra.permis_aac',
        'extra.resiliation_non_paiement',
        'extra.resiliation_autre_motif',
        'extra.nullite_fausse_declaration',
        'extra.troubles_neuromoteurs',
      ].sort(),
    );
    expect(byPath['driver.birthDate'].inputType).toBe('split-dmy');
    expect(byPath['driver.licenseDate'].inputType).toBe('split-dmy');
    expect(byPath['extra.civilite'].kind).toBe('radio');
    expect(byPath['insuranceHistory.currentlyInsured'].options).toHaveLength(4);
    // Obligatoires : l'image asterisque dans le label de la ligne (aucun astérisque en texte, aucun attribut required).
    const fields = analyzeForm(document, adapter).fields;
    const required = (label: string) => fields.find(f => f.label.startsWith(label))?.required;
    expect(required('Nom')).toBe(true);
    expect(required('Civilité')).toBe(true);
    expect(required("Date d'effet souhaitée")).toBe(true);
    expect(required('Bonus/Malus')).toBe(true);
    expect(required('Adresse')).toBe(false);
    expect(required('Email')).toBe(false);
    expect(required('Sanction(s) pour alcoolémie')).toBe(false);
    expect(document.querySelector('input[required], [aria-required]')).toBeNull();
    // Date d'effet proposée par l'extranet (lendemain) ; « > Continuer Devis » n'est pas un bouton final.
    expect(dateOf('oDateReprise')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(isFinalStep(document, detectStepHint(document))).toBe(false);
    expect(findNextButton(document)?.textContent).toBe('> Continuer Devis');
  });

  it('« > Continuer Devis » refuse une étape incomplète et le signale sur la ligne', () => {
    load('vehicule.html');
    runApp();
    watchLeaving();
    byId('oImmatriculation').value = 'FG-482-KL';
    findNextButton(document)!.click();
    expect(leaving).toEqual({ target: null, refused: 1 });
    expect(byId('oy-erreurs').hidden).toBe(false);
    expect(byId('ligne_oMarque').classList.contains('en-erreur')).toBe(true);
    expect(byId('blocValidation_oMarque').querySelector('img')!.style.display).toBe('');
    expect(byId('blocValidation_oMarque').textContent).toContain('Champ obligatoire');
    expect(byId('ligne_oImmatriculation').classList.contains('en-erreur')).toBe(false);
    expect(sessionStorage.getItem('oyat-devis-auto')).toBeNull();
  });

  it('étape « Véhicule » : chaque question reliée sans IA ; « Je ne la connais pas » n’est pas obligatoire', () => {
    load('vehicule.html');
    runApp();
    const byPath = mapped();
    expect(Object.keys(byPath).sort()).toEqual(
      [
        'vehicle.registration',
        'vehicle.brand',
        'vehicle.model',
        'vehicle.firstRegistrationDate',
        'vehicle.energyType',
        'vehicle.usage',
        'vehicle.parkingType',
        'vehicle.parkingPostalCode',
      ].sort(),
    );
    expect(byPath['vehicle.firstRegistrationDate'].inputType).toBe('split-dmy');
    expect(byPath['vehicle.parkingType'].kind).toBe('radio');
    const fields = analyzeForm(document, adapter).fields;
    expect(byPath['vehicle.registration'].required).toBe(true);
    expect(fields.find(f => f.name === 'bImmatInconnue')).toMatchObject({ kind: 'checkbox', required: false });
    expect(isFinalStep(document, detectStepHint(document))).toBe(false);
  });

  it('page de tarif (valeurs par défaut) : tarif capturé', () => {
    load('tarif.html');
    const fillable = mapFields(analyzeForm(document).fields).filter(m => m.status === 'mapped').length;
    const extraction = extractFromDom(document);
    expect(detectResultPage(extraction, fillable)).toBe('found');
    const { offer } = extraction;
    expect(offer.quoteNumber).toBe('OYD-2026-04211');
    expect(offer.premiumAnnual).toBe(698.4);
    expect(offer.premiumMonthly).toBe(59.36);
    expect(offer.deductibles).toEqual({ general: 300 });
    expect(offer.guarantees).toHaveLength(7);
    expect(offer.guarantees.find(g => g.label === 'Vol')).toEqual({ label: 'Vol', included: true, limit: 15000, deductible: 300 });
    expect(offer.guarantees.find(g => g.label === 'Dommages tous accidents')?.included).toBe(false);
    expect(offer.exclusions).toHaveLength(3);
  });

  it('parcours complet : le moteur remplit et valide les deux étapes, puis lit le tarif calculé', async () => {
    // Étape 1 « Conducteur 1 ».
    load('conducteur.html');
    runApp();
    watchLeaving();
    await runOnPage(() => leaving.target !== null);
    expect(leaving.target).toBe('vehicule.html');
    // Date d'effet : aucune donnée du dossier n'y correspond, elle reste celle proposée par l'extranet.
    expect(dateOf('oDateReprise')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(checkedValue('oSexe')).toBe('F');
    expect(value('oNom')).toBe('Lefèvre');
    expect(value('oPrenom')).toBe('Camille');
    expect(dateOf('oDateNaissance')).toBe('03/11/1988');
    expect(value('oPaysNaiss')).toBe('61');
    expect(value('oVilleNaissSaisieLibre')).toBe('Lyon');
    // Code `M` → libellé « Marié(e) ».
    expect(value('oSituationFam')).toBe('marie');
    expect(value('oProfession')).toBe('211');
    expect(dateOf('oDatePermis')).toBe('14/05/2007');
    expect(value('oPays')).toBe('61');
    expect(checkedValue('oConduite')).toBe('0');
    expect(value('oCodePostal')).toBe('69003');
    expect(value('oAdresse1')).toBe('24 rue Paul Bert');
    expect(value('oVille')).toBe('LYON');
    expect(value('oEmail')).toBe('camille.lefevre@example.fr');
    // 32 mois d'ancienneté → « Oui, 24 mois et plus ».
    expect(checkedValue('oNbMoisAssuranceV4')).toBe('24');
    expect(checkedValue('oResilAssPrec')).toBe('0');
    expect(checkedValue('oResilNPP')).toBe('0');
    expect(checkedValue('oResilAutreMotif')).toBe('0');
    expect(checkedValue('oNulliteFauseDeclaFraude')).toBe('0');
    expect(value('oCRM')).toBe('0.85');
    expect(checkedValue('oInfirmite')).toBe('0');
    expect(value('oNbSinistre36Mois')).toBe('1');
    expect(document.querySelectorAll('.ligne.en-erreur')).toHaveLength(0);

    // Étape 2 « Véhicule ».
    load('vehicule.html');
    runApp();
    watchLeaving();
    await runOnPage(() => leaving.target !== null);
    expect(leaving.target).toBe('tarif.html');
    expect(value('oImmatriculation')).toBe('FG-482-KL');
    expect(byId('bImmatInconnue').checked).toBe(false);
    expect(value('oMarque')).toBe('PEU');
    expect(value('oModele')).toBe('308');
    expect(dateOf('oDateMEC')).toBe('27/02/2020');
    expect(value('oEnergie')).toBe('GO');
    expect(value('oUsage')).toBe('2');
    expect(checkedValue('oModeGarage')).toBe('G');
    expect(value('oCPGarage')).toBe('69003');

    const saved = JSON.parse(sessionStorage.getItem('oyat-devis-auto') ?? '{}');
    expect(saved.conducteur).toMatchObject({ oNom: 'Lefèvre', oCRM: '0.85', oNbMoisAssuranceV4: '24', oSexe: 'F' });
    expect(saved.vehicule).toMatchObject({ oImmatriculation: 'FG-482-KL', bImmatInconnue: false, oMarque_libelle: 'PEUGEOT' });

    // Page « Votre tarif » : calculée à partir des réponses, puis lue par le moteur.
    load('tarif.html');
    runApp();
    const states = await runOnPage(all => all.some(state => state.phase === 'capture_review'));
    const offer = states.find(state => state.phase === 'capture_review')!.capture!.offer!;
    const shown = (id: string) => Number(byId(id).textContent!.replace(/[^\d,]/g, '').replace(',', '.'));
    expect(offer.premiumAnnual).toBe(shown('oy-annuelle'));
    expect(offer.premiumMonthly).toBe(shown('oy-mensuelle'));
    expect(offer.premiumAnnual).not.toBe(698.4);
    expect(offer.premiumMonthly).toBeCloseTo((offer.premiumAnnual! * 1.02) / 12, 2);
    expect(offer.quoteNumber).toMatch(/^OYD-\d{4}-\d{5}$/);
    expect(offer.deductibles).toEqual({ general: 300 });
    expect(byId('oy-recap').textContent).toContain('Camille Lefèvre — véhicule PEUGEOT 308 (FG-482-KL)');
  }, 30_000);
});
