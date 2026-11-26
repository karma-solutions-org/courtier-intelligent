import type { CanonicalData } from '@shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JobContext, RunState } from '../shared/messages';
import { analyzeForm } from './analyzer';
import { detectResultPage, extractFromDom } from './capture';
import { adapterFor } from './extranets';
import { DECLARATIONS } from './extranets/zephir/fixture';
import { mapFields } from './mapping';
import { FormRunner } from './runner';

/**
 * Extranet de démonstration « type Zephir » (`demo-extranet-zephir/`, http://localhost:8094) : application d'une seule
 * page qui reproduit la structure HTML de l'extranet réel (fixture `extranets/zephir/fixture.ts`) — boutons Oui / Non
 * Material obligatoires (ng-invalid), « Ajouter un sinistre » en `span` + `svg`, deux pages d'antécédents identiques,
 * « Résumé » sans champ, volet « Synthèse » qui parle de sinistre partout — avec quelques champs réalistes en plus.
 * Le vrai moteur doit traverser tout le parcours en avançant seul, puis lire le tarif calculé par la page.
 */

const DIR = resolve(__dirname, '../../demo-extranet-zephir');
const APP = readFileSync(resolve(DIR, 'app.js'), 'utf8');
const ORIGIN = 'http://localhost:8094';

const load = (page: string) => {
  document.open();
  document.write(readFileSync(resolve(DIR, page), 'utf8'));
  document.close();
};
/** Exécute le script de la page (jsdom ne charge pas les `<script src>` écrits par `document.write`). */
const runApp = () => new Function(APP)();

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition: () => boolean, describe: () => string, timeoutMs = 20_000): Promise<void> {
  for (const started = Date.now(); !condition(); await pause(25)) {
    if (Date.now() - started > timeoutMs) throw new Error(`Délai dépassé : ${describe()}`);
  }
}

const form = () => document.getElementById('zp-form')!;
const page = () => form().getAttribute('data-page');
const pressed = (name: string) => form().querySelector<HTMLButtonElement>(`button[name="${name}"][aria-pressed="true"]`)?.textContent?.trim() ?? null;
const field = (name: string) => form().querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]:not(button)`)?.value ?? null;
const unanswered = () => form().querySelectorAll('mat-button-toggle-group[required].ng-invalid').length;
const nextButton = () => form().querySelector<HTMLButtonElement>('button.boutonSubmit')!;

const PAGES = ['vehicule', 'antecedents-principal', 'antecedents-secondaire', 'resume', 'declarations', 'tarif'];

const QUOTE_DATA: CanonicalData = {
  'client.lastName': 'Martin',
  'client.firstName': 'Paul',
  'client.birthDate': '1984-05-22',
  'driver.lastName': 'Martin',
  'driver.firstName': 'Paul',
  'driver.birthDate': '1984-05-22',
  'driver.licenseDate': '2003-07-10',
  'driver.socioProfessionalCategory': 'cadre',
  'vehicle.registration': 'AB-123-CD',
  'vehicle.brand': 'Peugeot',
  'vehicle.model': '308',
  'vehicle.firstRegistrationDate': '2019-03-14',
  'vehicle.parkingPostalCode': '13010',
  'vehicle.parkingCity': 'Marseille',
  'vehicle.parkingType': 'garage_prive',
  'insuranceHistory.currentlyInsured': true,
  'insuranceHistory.bonusMalus': { value: 0.68, knowledge: 'KNOWN' },
  'insuranceHistory.wasTerminated': false,
  'insuranceHistory.claimsCount': { value: 1, knowledge: 'KNOWN' },
  'insuranceHistory.claims.1.type': 'corporel',
  'insuranceHistory.claims.1.responsibility': '50',
  'insuranceHistory.claims.1.date': '2025-10-28',
  'extra.conducteurs_permis_valide': true,
  'extra.situation_incompatible_permis': false,
  'extra.vehicule_transport_matieres_dangereuses': false,
};

const job: JobContext = {
  dossierId: 'dossier-zephir-demo',
  insurerId: 'assureur-zephir-local',
  insurerName: 'Démo type Zephir (locale)',
  status: 'requested',
  quoteData: QUOTE_DATA,
  missingFields: [],
  productPaths: Object.keys(QUOTE_DATA),
  productQuestions: [
    { path: 'extra.conducteurs_permis_valide', label: DECLARATIONS.permis, type: 'boolean' },
    { path: 'extra.situation_incompatible_permis', label: DECLARATIONS.incompatible, type: 'boolean' },
    { path: 'extra.vehicule_transport_matieres_dangereuses', label: DECLARATIONS.transport, type: 'boolean' },
  ],
};

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  document.body.innerHTML = '';
});

describe('Extranet de démonstration type Zephir', () => {
  it('le registre choisit l’adaptateur Zephir pour l’assureur de démonstration', () => {
    expect(adapterFor({ insurerId: 'assureur-zephir-local', origin: ORIGIN }).id).toBe('zephir');
  });

  it("l'accueil n'a aucun champ et mène au projet Auto", () => {
    load('index.html');
    expect(analyzeForm(document).fields).toEqual([]);
    expect(document.querySelector('a[href="projet-auto.html"]')?.textContent).toContain('Nouveau projet Auto');
  });

  it('page véhicule : champs reliés sans IA, et « Suivant » refusé tant que « Garage » est sans réponse', async () => {
    load('projet-auto.html');
    runApp();
    expect(page()).toBe('vehicule');
    const { fields } = analyzeForm(document, adapterFor({ insurerId: job.insurerId }));
    const paths = mapFields(fields)
      .filter(m => m.status === 'mapped')
      .map(m => m.canonicalPath)
      .sort();
    expect(paths).toEqual(
      [
        'vehicle.registration',
        'vehicle.brand',
        'vehicle.model',
        'vehicle.firstRegistrationDate',
        'vehicle.parkingPostalCode',
        'vehicle.parkingCity',
        'vehicle.parkingType',
        'driver.socioProfessionalCategory',
      ].sort(),
    );
    // « Garage » obligatoire (groupe Material ng-invalid), « Remorque / Caravane » déjà répondu.
    expect(fields.find(f => f.label === 'Garage')?.required).toBe(true);
    expect(unanswered()).toBe(1);

    nextButton().click();
    await pause(450);
    expect(page()).toBe('vehicule');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('questions obligatoires');

    form().querySelector<HTMLButtonElement>('button[name="GARAGE"]')!.click();
    expect(unanswered()).toBe(0);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    nextButton().click();
    await until(() => page() === 'antecedents-principal', () => String(page()));
    expect(form().querySelector('h3')?.textContent).toBe('Antécédents de Monsieur MARTIN PAUL');
  });

  it('parcours complet en autonomie : chaque page remplie, sinistre ajouté, déclarations répondues, tarif lu', async () => {
    load('projet-auto.html');
    runApp();

    // Pages traversées, refus de « Suivant », et relevé de chaque page au moment où l'extension la quitte.
    const visited = [page()!];
    new MutationObserver(() => {
      if (page() !== visited.at(-1)) visited.push(page()!);
    }).observe(form(), { attributes: true, attributeFilter: ['data-page'] });
    const refused: string[] = [];
    const snapshots: Record<string, Record<string, unknown>> = {};
    document.addEventListener(
      'click',
      event => {
        if (!(event.target as Element).closest?.('.boutonSubmit')) return;
        const name = page()!;
        if (unanswered()) return void refused.push(name);
        snapshots[name] = {
          immat: field('immatriculation'),
          marque: field('marque'),
          modele: field('modele'),
          dmec: field('dateMec'),
          cp: field('cpStationnement'),
          ville: field('villeStationnement'),
          csp: field('csp'),
          garage: pressed('GARAGE'),
          bonus: field('bonusMalus'),
          assure: pressed('ASSURE'),
          resilie: pressed('RESILIE'),
          rows: form().querySelectorAll('tbody tr').length,
          date: field('dateSurvenance1'),
          type: field('typeSinistre1'),
          taux: field('tauxResp1'),
          AUTO01: pressed('AUTO01'),
          AUTO02: pressed('AUTO02'),
          AUTO03: pressed('AUTO03'),
        };
      },
      true,
    );

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
        () => page() === 'tarif' && states.some(state => state.phase === 'capture_review'),
        () => {
          const last = states.at(-1);
          return `arrêt sur « ${page()} » ; pages ${visited.join(' > ')} ; refus [${refused.join(', ')}] ; dernier état ${last?.phase} ${last?.message ?? ''} ; champs ${JSON.stringify(last?.fields?.map(f => [f.label, f.status]) ?? [])}`;
        },
      );
    } finally {
      runner.stop();
    }

    // Toutes les pages, dans l'ordre, sans refus.
    expect(visited).toEqual(PAGES);
    expect(refused).toEqual([]);

    // Véhicule : champs texte, Oui / Non « Garage » (stationnement en garage privé), liste de la CSP.
    expect(snapshots.vehicule).toMatchObject({
      immat: 'AB-123-CD',
      marque: 'Peugeot',
      modele: '308',
      dmec: '14/03/2019',
      cp: '13010',
      ville: 'Marseille',
      garage: 'Oui',
      csp: 'Cadre',
    });

    // Antécédents : les deux pages identiques sont remplies chacune, avec une ligne de sinistre ajoutée et remplie.
    for (const name of ['antecedents-principal', 'antecedents-secondaire']) {
      expect(snapshots[name], name).toMatchObject({ bonus: '0.68',assure: 'Oui', resilie: 'Non', rows: 1, date: '28/10/2025', type: 'CORP', taux: '50' });
    }

    // Déclarations complémentaires : réponses du dossier.
    expect(snapshots.declarations).toMatchObject({ AUTO01: 'Oui', AUTO02: 'Non', AUTO03: 'Non' });

    // Tarif calculé par la page à partir des réponses, puis lu par le moteur.
    const shown = (id: string) => Number(document.getElementById(id)!.textContent!.replace(/[^\d,]/g, '').replace(',', '.'));
    const offer = states.find(state => state.phase === 'capture_review')?.capture?.offer;
    expect(offer?.premiumAnnual).toBe(shown('zp-annuelle'));
    expect(offer?.premiumMonthly).toBe(shown('zp-mensuelle'));
    expect(offer?.quoteNumber).toMatch(/^ZD-\d{4}-\d{6}$/);
    expect(offer?.quoteNumber).toBe(document.getElementById('zp-numero')!.textContent);
    expect(offer?.guarantees.length).toBeGreaterThanOrEqual(6);
    expect(detectResultPage(extractFromDom(document), 0)).toBe('found');
    const saved = JSON.parse(sessionStorage.getItem('zephir-projet-auto') ?? '{}');
    expect(saved).toMatchObject({ garage: 'Oui', declarations: { permis: 'Oui', incompatible: 'Non', transport: 'Non' } });
    expect(saved.principal.sinistres).toEqual([{ date: '28/10/2025', type: 'CORP', taux: '50' }]);
  }, 30_000);
});
