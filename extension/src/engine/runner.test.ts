import type { CanonicalData } from '@shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext, JobUpdate, RunState } from '../shared/messages';
import { AssureurA, mountAssureurA } from './__fixtures__/assureur-a';
import { AskAi } from './ai-fallback';
import { FormRunner } from './runner';

const QUOTE_DATA: CanonicalData = {
  'client.lastName': 'Dupont',
  'client.firstName': 'Jean',
  'client.birthDate': '1985-03-12',
  'client.email': 'jean@example.fr',
  'client.phone': '0612345678',
  'client.address.street': '1 rue de la Paix',
  'client.address.postalCode': '75002',
  'client.address.city': 'Lyon 6e',
  'vehicle.registration': 'AB-123-CD',
  'vehicle.brand': 'Renault',
  'vehicle.model': 'Clio',
  'vehicle.firstRegistrationDate': '2019-05-01',
  'vehicle.fiscalPower': 5,
  'vehicle.usage': 'prive_trajet',
  'vehicle.parkingType': 'voie_publique',
  'driver.lastName': 'Dupont',
  'driver.firstName': 'Jean',
  'driver.birthDate': '1985-03-12',
  'driver.licenseDate': '2004-07-01',
  'insuranceHistory.currentlyInsured': false,
  'insuranceHistory.previousInsurer': null,
  'insuranceHistory.bonusMalus': { value: 0.9, knowledge: 'KNOWN' },
  'insuranceHistory.claimsCount': { value: 0, knowledge: 'KNOWN' },
  'insuranceHistory.wasTerminated': false,
};

const job = (quoteData: CanonicalData = QUOTE_DATA): JobContext => ({
  dossierId: 'dossier-1',
  insurerId: 'assureur-a',
  insurerName: 'Assureur A',
  status: 'requested',
  quoteData,
  missingFields: [],
});

/** Valeur d'un champ, ou « » s'il n'est pas (encore) dans la page. */
const value = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
const checked = (selector: string) => (document.querySelector(selector) as HTMLInputElement).checked;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Attend qu'une condition devienne vraie (le remplissage d'une étape est asynchrone). */
async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('Délai dépassé : la condition ne s’est pas réalisée.');
    await pause(20);
  }
}

describe('FormRunner sur l’extranet de l’assureur A', () => {
  let reports: JobUpdate[];
  let states: RunState[];
  let ask: ReturnType<typeof vi.fn<AskAi>>;
  let ax: AssureurA;
  let runner: FormRunner;
  let clickedButtons: string[];

  const lastReport = () => reports.at(-1)!;
  const lastState = () => states.at(-1)!;

  const create = (options: Parameters<typeof mountAssureurA>[1] = {}, data: CanonicalData = QUOTE_DATA) => {
    ax = mountAssureurA(document, options);
    runner = new FormRunner(job(data), {
      doc: document,
      report: async update => void reports.push(update),
      publish: state => void states.push(state),
      askAi: ask,
      quietMs: 40,
      settleTimeoutMs: 1000,
    });
  };

  beforeEach(() => {
    reports = [];
    states = [];
    clickedButtons = [];
    ask = vi.fn<AskAi>(async () => '{"mappings":[]}');
    // L'extension ne doit cliquer sur AUCUN bouton de l'extranet : le courtier avance et soumet lui-même.
    document.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      if (target.closest('button')) clickedButtons.push(target.textContent ?? '');
    }, true);
  });

  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  describe('Étape 1', () => {
    it('analyse la page, remplit les champs reconnus et signale l’avancement', async () => {
      create();
      await runner.start();

      expect(value('nom')).toBe('Dupont');
      expect(value('naissance')).toBe('12/03/1985'); // date au format de l'extranet
      expect(value('email')).toBe('jean@example.fr');
      expect(value('email2')).toBe('jean@example.fr'); // confirmation
      expect(value('tel')).toBe('0612345678');
      expect(value('cp')).toBe('75002');
      expect(value('ville')).toBe('Lyon 6e'); // choisie dans les suggestions
      expect(reports[0]).toEqual({ status: 'analyzing' });
      expect(lastReport()).toMatchObject({ status: 'filling', currentStep: 1, totalSteps: 3, missingFields: [] });
    });

    it('laisse vides les champs qu’elle ne connaît pas (civilité) : rien n’est rempli au hasard', async () => {
      create();
      await runner.start();

      expect(checked('input[value="mme"]')).toBe(false);
      expect(checked('input[value="m"]')).toBe(false);
      expect(lastState().fields.find(f => f.label === 'Civilité')).toMatchObject({ status: 'unmapped', canonicalPath: null });
    });

    it('n’écrit rien dans les champs invisibles, cachés ou mot de passe', async () => {
      create();
      await runner.start();

      expect(value('piege')).toBe('');
      expect((document.querySelector('input[name="mdp"]') as HTMLInputElement).value).toBe('');
      expect((document.querySelector('input[name="csrf"]') as HTMLInputElement).value).toBe('x');
    });

    it('publie pour le side panel le détail de chaque champ', async () => {
      create();
      await runner.start();

      const state = lastState();
      expect(state).toMatchObject({ phase: 'filling', insurerId: 'assureur-a', dossierId: 'dossier-1', step: { current: 1, total: 3 }, aiUsed: false, missing: [] });
      expect(state.fields.find(f => f.label === 'Nom')).toMatchObject({ canonicalPath: 'client.lastName', status: 'filled', required: true, source: 'heuristic', section: 'Vos informations' });
      expect(state.assignablePaths).toContain('client.lastName');
    });

    it('ne clique jamais sur un bouton de l’extranet', async () => {
      create();
      await runner.start();

      expect(clickedButtons).toEqual([]);
      expect(ax.step).toBe(1);
    });
  });

  describe('Champs obligatoires absents du dossier (needs_info)', () => {
    const incomplete = { ...QUOTE_DATA, 'client.address.postalCode': null, 'client.email': null, 'client.phone': null };

    it('écrit needs_info avec les champs manquants, et remplit tout de même le reste', async () => {
      create({}, incomplete);
      await runner.start();

      expect(value('nom')).toBe('Dupont');
      expect(lastReport()).toMatchObject({ status: 'needs_info', currentStep: 1 });
      expect(lastReport().missingFields).toEqual([
        { canonicalPath: 'client.email', label: 'Adresse e-mail', type: 'text' },
        { canonicalPath: 'client.address.postalCode', label: 'Code postal', type: 'text' },
      ]);
      expect(lastState()).toMatchObject({ phase: 'waiting_user' });
    });

    it('ne demande pas un champ facultatif (téléphone) : il reste vide', async () => {
      create({}, incomplete);
      await runner.start();

      expect(lastReport().missingFields!.map(m => m.canonicalPath)).not.toContain('client.phone');
      expect(value('tel')).toBe('');
    });

    it('ne traite pas « l’assuré ne sait pas » comme une valeur : le champ est demandé', async () => {
      create({}, { ...QUOTE_DATA, 'client.birthDate': null });
      await runner.start();

      expect(lastReport().missingFields!.map(m => m.canonicalPath)).toContain('client.birthDate');
      expect(value('naissance')).toBe('');
    });

    it('reprend quand le courtier a répondu : remplit les champs reçus et repasse en filling', async () => {
      create({}, incomplete);
      await runner.start();

      await runner.updateJob(job(QUOTE_DATA));

      expect(value('email')).toBe('jean@example.fr');
      expect(value('cp')).toBe('75002');
      expect(lastReport()).toMatchObject({ status: 'filling', currentStep: 1, missingFields: [] });
    });

    it('ne réécrit pas un champ déjà rempli (le courtier a pu le corriger)', async () => {
      create({}, incomplete);
      await runner.start();
      (document.getElementById('nom') as HTMLInputElement).value = 'Corrigé par le courtier';

      await runner.updateJob(job(QUOTE_DATA));

      expect(value('nom')).toBe('Corrigé par le courtier');
    });
  });

  describe('Parcours en plusieurs étapes', () => {
    it('remplit chaque étape quand le courtier passe à la suivante, et signale currentStep', async () => {
      create();
      await runner.start();

      ax.next();
      await until(() => value('immat') === 'AB-123-CD');

      expect(value('marque')).toBe('RENAULT');
      expect(value('modele')).toBe('Clio');
      expect(value('dmec')).toBe('2019-05-01'); // type=date : format ISO
      expect(value('cv')).toBe('5');
      expect(checked('input[value="U2"]')).toBe(true); // « Privé et trajet domicile-travail »
      expect(value('parking')).toBe('V'); // « Voie publique »
      await until(() => lastReport().currentStep === 2);
      expect(lastReport()).toMatchObject({ status: 'filling', currentStep: 2, totalSteps: 3 });
      expect(lastState().step).toEqual({ current: 2, total: 3 });
    });

    it('arrive à la dernière étape : awaiting_submit, sans jamais soumettre', async () => {
      create();
      await runner.start();
      ax.next();
      await until(() => value('immat') === 'AB-123-CD');
      ax.next();
      await until(() => value('nom-cond') === 'Dupont');

      expect(value('prenom-cond')).toBe('Jean');
      expect(value('naiss-cond')).toBe('12/03/1985');
      expect(value('permis')).toBe('2004-07-01');
      expect(checked('input[name="assure"][value="0"]')).toBe(true); // Non : false est une réponse
      expect(checked('input[name="resilie"][value="0"]')).toBe(true);
      expect(value('crm')).toBe('0.9');
      expect(value('sinistres')).toBe('0'); // 0 est une réponse
      expect(checked('input[name="cgu"]')).toBe(false); // conditions générales : jamais cochées
      await until(() => lastReport().status === 'awaiting_submit');

      expect(lastReport()).toMatchObject({ status: 'awaiting_submit', currentStep: 3, totalSteps: 3 });
      expect(lastState().phase).toBe('awaiting_submit');
      expect(clickedButtons).toEqual([]);
    });

    it('sans indicateur « Étape x sur y », compte les étapes d’après le changement de formulaire', async () => {
      create({ stepIndicator: false });
      await runner.start();
      expect(lastReport()).toMatchObject({ status: 'filling', currentStep: 1, totalSteps: null });

      ax.next();
      await until(() => value('immat') === 'AB-123-CD');
      await until(() => lastReport().currentStep === 2);

      ax.next();
      await until(() => value('nom-cond') === 'Dupont');
      await until(() => lastReport().status === 'awaiting_submit'); // bouton « Obtenir mon tarif », pas de « Suivant »
      expect(lastReport()).toMatchObject({ currentStep: 3, totalSteps: 3 });
    });

    it('attend la fin du chargement avant de remplir la nouvelle étape', async () => {
      create();
      await runner.start();
      ax.next(); // l'extranet vide le formulaire, affiche « Chargement… », puis la nouvelle étape

      await until(() => value('immat') === 'AB-123-CD');

      expect(document.getElementById('spinner')!.hasAttribute('hidden')).toBe(true);
      expect(reports.filter(r => r.currentStep === 2).length).toBeGreaterThan(0);
    });

    it('un champ qui apparaît sous une réponse est rempli, sans changer d’étape', async () => {
      create({}, { ...QUOTE_DATA, 'insuranceHistory.currentlyInsured': true, 'insuranceHistory.previousInsurer': 'Axa' });
      await runner.start();
      ax.next();
      await until(() => value('immat') === 'AB-123-CD');
      ax.next();

      await until(() => value('assureur') === 'Axa');

      expect(checked('input[name="assure"][value="1"]')).toBe(true);
      await until(() => lastReport().status === 'awaiting_submit');
      expect(lastReport().currentStep).toBe(3);
    });

    it('un champ obligatoire absent à l’étape 2 passe le job en needs_info avec la bonne étape', async () => {
      create({}, { ...QUOTE_DATA, 'vehicle.fiscalPower': null });
      await runner.start();
      ax.next();

      await until(() => lastReport().status === 'needs_info');

      expect(lastReport()).toMatchObject({ currentStep: 2 });
      expect(lastReport().missingFields).toEqual([{ canonicalPath: 'vehicle.fiscalPower', label: 'Puissance fiscale (CV)', type: 'number' }]);
    });
  });

  describe('Repli sur l’IA', () => {
    it('n’appelle pas l’IA quand les synonymes suffisent', async () => {
      create();
      await runner.start();

      expect(ask).not.toHaveBeenCalled();
      expect(lastState().aiUsed).toBe(false);
    });

    it('demande à l’IA les champs incertains, valide sa réponse, puis remplit', async () => {
      ask.mockImplementation(async request => {
        const key = (JSON.parse(request.messages[0].content).fields as { key: string; label: string }[]).find(f => f.label === 'Votre numéro direct')!.key;
        return JSON.stringify({ mappings: [{ key, canonicalPath: 'client.phone', confidence: 0.8 }] });
      });
      create({ obscurePhoneLabel: true });

      await runner.start();

      expect(ask).toHaveBeenCalledOnce();
      expect(value('tel')).toBe('0612345678');
      expect(lastState().aiUsed).toBe(true);
      expect(lastState().fields.find(f => f.label === 'Votre numéro direct')).toMatchObject({ canonicalPath: 'client.phone', source: 'ai', status: 'filled' });
    });

    it('n’envoie à l’IA aucune valeur du dossier', async () => {
      create({ obscurePhoneLabel: true });
      await runner.start();

      const sent = JSON.stringify(ask.mock.calls);
      for (const secret of ['Dupont', 'jean@example.fr', '0612345678', 'AB-123-CD', '75002']) expect(sent).not.toContain(secret);
    });

    it('une réponse invalide de l’IA (chemin inventé) ne remplit rien', async () => {
      ask.mockResolvedValue('{"mappings":[{"key":"text:num1","canonicalPath":"client.shoeSize","confidence":1}]}');
      create({ obscurePhoneLabel: true });

      await runner.start();

      expect(value('tel')).toBe('');
      expect(lastState().fields.find(f => f.label === 'Votre numéro direct')).toMatchObject({ canonicalPath: null, status: 'unmapped' });
    });

    it('si l’IA est en panne, le reste du formulaire est quand même rempli', async () => {
      ask.mockRejectedValue(new Error('quota dépassé'));
      create({ obscurePhoneLabel: true });

      await runner.start();

      expect(value('nom')).toBe('Dupont');
      expect(value('tel')).toBe('');
      expect(lastReport().status).toBe('filling');
    });

    it('ne redemande pas à l’IA pour le même formulaire', async () => {
      create({ obscurePhoneLabel: true });
      await runner.start();
      await runner.refill();
      await runner.refill();

      expect(ask).toHaveBeenCalledOnce();
    });
  });

  describe('Correction manuelle (side panel)', () => {
    it('le courtier associe un champ non trouvé à un chemin du dossier : il est rempli', async () => {
      create({ obscurePhoneLabel: true });
      await runner.start();
      const phone = lastState().fields.find(f => f.label === 'Votre numéro direct')!;
      expect(phone.status).toBe('unmapped');

      await runner.manualMap(phone.key, 'client.phone');

      expect(value('tel')).toBe('0612345678');
      expect(lastState().fields.find(f => f.key === phone.key)).toMatchObject({ canonicalPath: 'client.phone', source: 'manual', confidence: 1, status: 'filled' });
    });

    it('refuse un chemin incompatible avec le champ, ou absent du dossier, ou hors liste', async () => {
      create({ obscurePhoneLabel: true });
      await runner.start();
      const phone = lastState().fields.find(f => f.label === 'Votre numéro direct')!;

      await runner.manualMap(phone.key, 'client.lastName'); // champ téléphone ≠ nom
      await runner.manualMap(phone.key, 'driver.profession'); // pas dans le dossier
      await runner.manualMap(phone.key, 'client.shoeSize' as never); // hors liste fermée

      expect(value('tel')).toBe('');
      expect(lastState().message).toContain('ne peut pas recevoir');
    });

    it('« ne pas remplir » (null) retire un mapping automatique', async () => {
      create();
      await runner.start();
      const city = lastState().fields.find(f => f.label === 'Adresse')!;
      (document.getElementById('adresse') as HTMLInputElement).value = '';

      await runner.manualMap(city.key, null);

      expect(lastState().fields.find(f => f.key === city.key)).toMatchObject({ canonicalPath: null, source: 'manual', status: 'unmapped' });
    });

    it('la correction manuelle l’emporte sur l’IA', async () => {
      ask.mockResolvedValue('{"mappings":[]}');
      create({ obscurePhoneLabel: true });
      await runner.start();
      const phone = lastState().fields.find(f => f.label === 'Votre numéro direct')!;
      await runner.manualMap(phone.key, 'client.phone');
      await runner.refill();

      expect(lastState().fields.find(f => f.key === phone.key)).toMatchObject({ source: 'manual' });
    });
  });

  describe('Refus de l’extranet', () => {
    it('signale un champ que l’extranet n’a pas accepté (code postal trop long)', async () => {
      create({}, { ...QUOTE_DATA, 'client.address.postalCode': '750020' });
      await runner.start();

      const field = lastState().fields.find(f => f.label === 'Code postal')!;
      expect(field.status).toBe('failed');
      expect(field.reason).toContain('longueur maximale');
      expect(value('cp')).toBe('');
    });
  });

  describe('Arrêt', () => {
    it('après stop(), la page n’est plus surveillée', async () => {
      create();
      await runner.start();
      runner.stop();
      const before = reports.length;

      ax.next();
      await pause(300);

      expect(value('immat')).toBe('');
      expect(reports.length).toBe(before);
    });
  });
});
