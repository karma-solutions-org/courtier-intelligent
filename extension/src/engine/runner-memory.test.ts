import type { CanonicalData, FormMemoryField } from '@shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext, JobUpdate, RunState } from '../shared/messages';
import { AssureurA, mountAssureurA } from './__fixtures__/assureur-a';
import { AskAi } from './ai-fallback';
import { analyzeForm } from './analyzer';
import { LoadedMemory, MemoryPort, toMemoryFields } from './memory';
import { mapFields } from './mapping';
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
  'insuranceHistory.bonusMalus': { value: 0.9, knowledge: 'KNOWN' },
  'insuranceHistory.claimsCount': { value: 0, knowledge: 'KNOWN' },
  'insuranceHistory.wasTerminated': false,
};

const job = (quoteData: CanonicalData = QUOTE_DATA): JobContext => ({ dossierId: 'd1', insurerId: 'assureur-a', insurerName: 'Assureur A', status: 'requested', quoteData, missingFields: [] });
const value = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('Délai dépassé.');
    await pause(20);
  }
}

/** Mémoire simulée : garde ce qu'on lui apprend, comme le ferait la collection formMemories. */
function fakeMemory(initial: Record<string, LoadedMemory> = {}) {
  const stored = new Map(Object.entries(initial));
  const port = {
    load: vi.fn(async (_origin: string, fingerprint: string) => stored.get(fingerprint) ?? null),
    save: vi.fn(async (_origin: string, _fingerprint: string, _fields: FormMemoryField[]) => undefined),
    touch: vi.fn(async (_key: string) => undefined),
    invalidate: vi.fn(async (_key: string) => undefined),
  } satisfies MemoryPort;
  return { port, stored };
}

describe('FormRunner : mémoire partagée des formulaires', () => {
  let reports: JobUpdate[];
  let states: RunState[];
  let ask: ReturnType<typeof vi.fn<AskAi>>;
  let ax: AssureurA;
  let runner: FormRunner;

  const lastState = () => states.at(-1)!;
  const create = (memory: MemoryPort | undefined, options: Parameters<typeof mountAssureurA>[1] = {}, data: CanonicalData = QUOTE_DATA) => {
    ax = mountAssureurA(document, options);
    runner = new FormRunner(job(data), {
      doc: document,
      report: async update => void reports.push(update),
      publish: state => void states.push(state),
      askAi: ask,
      memory,
      origin: 'https://extranet.assureur-a.fr',
      quietMs: 40,
      settleTimeoutMs: 1000,
    });
  };

  /** La mémoire que le serveur aurait enregistrée pour le formulaire affiché (étape 1, champ « numéro direct »). */
  const learnedStep1 = (overrides: Partial<Record<string, string | null>> = {}): LoadedMemory => {
    const { fields, fingerprint } = analyzeForm(document);
    const memoryFields = toMemoryFields(fields, mapFields(fields)).map(f => (f.fieldKey in overrides ? { ...f, canonicalPath: overrides[f.fieldKey] as never } : f));
    return { key: `cle-${fingerprint}`, fields: memoryFields };
  };

  beforeEach(() => {
    reports = [];
    states = [];
    ask = vi.fn<AskAi>(async () => '{"mappings":[]}');
  });

  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  describe('Lecture (E8-2) : formulaire connu, mapping immédiat sans IA', () => {
    it('reconnaît un champ que les synonymes n’ont pas tranché grâce à la mémoire, sans appeler l’IA', async () => {
      mountAssureurA(document, { obscurePhoneLabel: true });
      const { fingerprint } = analyzeForm(document);
      const memory = fakeMemory({ [fingerprint]: learnedStep1({ 'text:num1': 'client.phone' }) });
      document.body.innerHTML = '';
      create(memory.port, { obscurePhoneLabel: true });

      await runner.start();

      expect(value('tel')).toBe('0612345678');
      expect(ask).not.toHaveBeenCalled();
      expect(memory.port.load).toHaveBeenCalledOnce();
      expect(memory.port.load.mock.calls[0].slice(0, 2)).toEqual(['https://extranet.assureur-a.fr', fingerprint]);
      expect(lastState().memory).toBe('used');
      expect(lastState().aiUsed).toBe(false);
      expect(lastState().fields.find(f => f.label === 'Votre numéro direct')).toMatchObject({ canonicalPath: 'client.phone', source: 'memory', status: 'filled' });
    });

    it('signale à la mémoire qu’elle a bien servi, une seule fois par formulaire', async () => {
      mountAssureurA(document, { obscurePhoneLabel: true });
      const memory = fakeMemory({ [analyzeForm(document).fingerprint]: learnedStep1({ 'text:num1': 'client.phone' }) });
      document.body.innerHTML = '';
      create(memory.port, { obscurePhoneLabel: true });

      await runner.start();
      await runner.refill();
      await runner.refill();

      expect(memory.port.touch).toHaveBeenCalledOnce();
      expect(memory.port.invalidate).not.toHaveBeenCalled();
    });

    it('ne réapprend pas un formulaire que la mémoire connaît déjà', async () => {
      mountAssureurA(document, { obscurePhoneLabel: true });
      const memory = fakeMemory({ [analyzeForm(document).fingerprint]: learnedStep1({ 'text:num1': 'client.phone' }) });
      document.body.innerHTML = '';
      create(memory.port, { obscurePhoneLabel: true });
      await runner.start();

      ax.next();
      await until(() => value('immat') === 'AB-123-CD');
      await pause(100);

      // L'étape 1 est connue de la mémoire : elle n'est pas réenregistrée en la quittant.
      expect(memory.port.save).not.toHaveBeenCalled();
    });

    it('apprendre « aucun équivalent » : le champ ne part pas vers l’IA', async () => {
      mountAssureurA(document, { obscurePhoneLabel: true });
      const memory = fakeMemory({ [analyzeForm(document).fingerprint]: learnedStep1({ 'text:num1': null }) });
      document.body.innerHTML = '';
      create(memory.port, { obscurePhoneLabel: true });

      await runner.start();

      expect(ask).not.toHaveBeenCalled();
      expect(value('tel')).toBe('');
      expect(lastState().fields.find(f => f.label === 'Votre numéro direct')).toMatchObject({ canonicalPath: null, status: 'unmapped' });
    });

    it('un formulaire inconnu suit le chemin habituel : synonymes, puis IA', async () => {
      const memory = fakeMemory();
      ask.mockImplementation(async request => {
        const key = (JSON.parse(request.messages[0].content).fields as { key: string; label: string }[]).find(f => f.label === 'Votre numéro direct')!.key;
        return JSON.stringify({ mappings: [{ key, canonicalPath: 'client.phone', confidence: 0.8 }] });
      });
      create(memory.port, { obscurePhoneLabel: true });

      await runner.start();

      expect(ask).toHaveBeenCalledOnce();
      expect(value('tel')).toBe('0612345678');
      expect(lastState().memory).toBeNull();
    });

    it('ne se fie pas aveuglément à la mémoire : un chemin incompatible ou absent du dossier est écarté', async () => {
      mountAssureurA(document, { obscurePhoneLabel: true });
      const bad = learnedStep1({ 'text:num1': 'client.lastName' }); // champ téléphone ≠ nom
      const memory = fakeMemory({ [analyzeForm(document).fingerprint]: bad });
      document.body.innerHTML = '';
      create(memory.port, { obscurePhoneLabel: true });

      await runner.start();

      expect(value('tel')).toBe('');
      expect(ask).toHaveBeenCalledOnce(); // la mémoire n'a pas tranché : retour à l'IA
    });

    it('une panne de la mémoire n’empêche rien : tout se fait par synonymes', async () => {
      const memory = fakeMemory();
      memory.port.load.mockRejectedValue(new Error('hors ligne'));
      create(memory.port);

      await runner.start();

      expect(value('nom')).toBe('Dupont');
      expect(lastState().phase).toBe('filling');
    });

    it('sans port mémoire, le moteur fonctionne comme avant', async () => {
      create(undefined);
      await runner.start();
      expect(value('nom')).toBe('Dupont');
    });
  });

  describe('Invalidation (E8-4) : la mémoire échoue, puis réapprentissage', () => {
    /** Deux champs que rien ne permet de reconnaître, à longueur maximale très courte : une mémoire fausse échoue. */
    const mountStrangeForm = () => {
      document.body.innerHTML = `<h2>Formulaire</h2>
        <label for="a">Champ A</label><input id="a" name="aa" maxlength="3" />
        <label for="b">Champ B</label><input id="b" name="bb" maxlength="3" />
        <button type="button">Obtenir mon tarif</button>`;
    };

    const strangeMemory = (): LoadedMemory => {
      mountStrangeForm();
      const { fields, fingerprint } = analyzeForm(document);
      return { key: `cle-${fingerprint}`, fields: toMemoryFields(fields, mapFields(fields)).map((f, i) => ({ ...f, canonicalPath: i === 0 ? 'client.lastName' : 'client.firstName', confidence: 0.9 })) };
    };

    const createStrange = (memory: MemoryPort) => {
      runner = new FormRunner(job(), { doc: document, report: async update => void reports.push(update), publish: s => void states.push(s), askAi: ask, memory, origin: 'https://extranet.assureur-a.fr', quietMs: 40, settleTimeoutMs: 1000 });
    };

    it('signale une mémoire qui fait échouer le remplissage, la met de côté et refait le mapping', async () => {
      const loaded = strangeMemory();
      const memory = fakeMemory({ [analyzeForm(document).fingerprint]: loaded });
      createStrange(memory.port);

      await runner.start();

      expect(memory.port.invalidate).toHaveBeenCalledExactlyOnceWith(loaded.key);
      expect(memory.port.touch).not.toHaveBeenCalled();
      expect(lastState().memory).toBe('invalidated');
      expect(ask).toHaveBeenCalledOnce(); // les synonymes ne reconnaissent rien : retour à l'IA
      expect(memory.port.load).toHaveBeenCalledOnce(); // pas de seconde lecture de la mémoire écartée
    });

    it('réapprend : le mapping refait sans la mémoire, une fois validé, est enregistré', async () => {
      // Données courtes : seule la bonne association tient dans les champs de 3 caractères.
      const data = { ...QUOTE_DATA, 'client.lastName': 'Li', 'client.firstName': 'Jo' };
      const wrong = strangeMemory(); // A → nom, B → prénom : 'Dupont' et 'Jean' ne tiennent pas… avec ces données courtes, si.
      const wrongFields = wrong.fields.map((f, i) => ({ ...f, canonicalPath: (i === 0 ? 'vehicle.registration' : 'vehicle.brand') as never }));
      const memory = fakeMemory({ [analyzeForm(document).fingerprint]: { key: wrong.key, fields: wrongFields } });
      ask.mockImplementation(async request => {
        const fields = JSON.parse(request.messages[0].content).fields as { key: string; label: string }[];
        return JSON.stringify({ mappings: [{ key: fields.find(f => f.label === 'Champ A')!.key, canonicalPath: 'client.lastName', confidence: 0.8 }, { key: fields.find(f => f.label === 'Champ B')!.key, canonicalPath: 'client.firstName', confidence: 0.8 }] });
      });
      runner = new FormRunner(job(data), { doc: document, report: async u => void reports.push(u), publish: s => void states.push(s), askAi: ask, memory: memory.port, origin: 'https://extranet.assureur-a.fr', quietMs: 40, settleTimeoutMs: 1000 });

      await runner.start();

      expect(memory.port.invalidate).toHaveBeenCalledOnce(); // « AB-123-CD » et « Renault » ne tiennent pas dans 3 caractères
      expect(value('a')).toBe('Li');
      expect(value('b')).toBe('Jo');
      expect(memory.port.save).toHaveBeenCalledOnce();
      const saved = memory.port.save.mock.calls[0][2];
      expect(saved.map(f => f.canonicalPath)).toEqual(['client.lastName', 'client.firstName']);
      expect(lastState().memory).toBe('learned');
    });

    it('un seul champ en échec sur beaucoup de champs bien mappés n’invalide pas la mémoire', async () => {
      mountAssureurA(document);
      const base = analyzeForm(document);
      // Mémoire fiable sur 10 champs ; le code postal est trop long pour son champ (1 échec sur 10).
      const memory = fakeMemory({ [base.fingerprint]: { key: 'cle-ok', fields: toMemoryFields(base.fields, mapFields(base.fields)) } });
      document.body.innerHTML = '';
      create(memory.port, {}, { ...QUOTE_DATA, 'client.address.postalCode': '750020' });

      await runner.start();

      expect(memory.port.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('Écriture (E8-3) : après un mapping réussi et validé', () => {
    it('apprend la structure de l’étape quand le courtier passe à la suivante', async () => {
      const memory = fakeMemory();
      create(memory.port);
      await runner.start();
      const step1Fingerprint = analyzeForm(document).fingerprint;
      expect(memory.port.save).not.toHaveBeenCalled(); // pas encore validé : le courtier n'a pas avancé

      ax.next();
      await until(() => value('immat') === 'AB-123-CD');

      expect(memory.port.save).toHaveBeenCalledOnce();
      const [origin, fingerprint, fields] = memory.port.save.mock.calls[0];
      expect(origin).toBe('https://extranet.assureur-a.fr');
      expect(fingerprint).toBe(step1Fingerprint);
      expect(fields.find(f => f.label === 'Nom')).toMatchObject({ type: 'text', canonicalPath: 'client.lastName' });
      expect(fields.find(f => f.label === 'Civilité')).toMatchObject({ type: 'radio', canonicalPath: null, confidence: 0 });
      expect(fields.find(f => f.label === 'Confirmez votre e-mail')).toMatchObject({ canonicalPath: 'client.email' });
      expect(lastState().memory).toBe('learned');
    });

    it('n’enregistre JAMAIS de valeur du dossier : structure seulement', async () => {
      const memory = fakeMemory();
      create(memory.port);
      await runner.start();
      ax.next();
      await until(() => value('immat') === 'AB-123-CD');

      const sent = JSON.stringify(memory.port.save.mock.calls);
      for (const secret of ['Dupont', 'jean@example.fr', '0612345678', '75002', '1 rue de la Paix', '12/03/1985', 'AB-123-CD']) {
        expect(sent).not.toContain(secret);
      }
      for (const field of memory.port.save.mock.calls[0][2]) {
        expect(Object.keys(field).sort()).toEqual(['canonicalPath', 'confidence', 'fieldKey', 'label', 'order', 'type']);
        expect(field.fieldKey).toMatch(/^[a-z]{3,12}:[a-z0-9-]{1,100}(#\d{1,3})?$/);
        expect(field.fieldKey.split(':')[0]).toBe(field.type);
      }
    });

    it('n’apprend pas une étape dont un champ a échoué (le mapping n’est pas validé)', async () => {
      const memory = fakeMemory();
      create(memory.port, {}, { ...QUOTE_DATA, 'client.address.postalCode': '750020' });
      await runner.start();

      ax.next();
      await until(() => value('immat') === 'AB-123-CD');
      await pause(60);

      expect(memory.port.save).not.toHaveBeenCalled();
    });

    it('apprend la dernière étape quand elle est remplie sans échec, et chaque étape une seule fois', async () => {
      const memory = fakeMemory();
      create(memory.port);
      await runner.start();
      ax.next();
      await until(() => value('immat') === 'AB-123-CD');
      ax.next();
      await until(() => reports.at(-1)?.status === 'awaiting_submit');

      expect(memory.port.save).toHaveBeenCalledTimes(3); // étapes 1 et 2 en les quittant, étape 3 une fois remplie
      const fingerprints = memory.port.save.mock.calls.map(c => c[1]);
      expect(new Set(fingerprints).size).toBe(3);

      await runner.refill();
      await pause(60);
      expect(memory.port.save).toHaveBeenCalledTimes(3);
    });

    it('n’apprend rien quand aucun champ n’a pu être associé', async () => {
      document.body.innerHTML = '<label for="x">Zzz</label><input id="x" name="x" /><label for="y">Yyy</label><input id="y" name="y" />';
      const memory = fakeMemory();
      runner = new FormRunner(job(), { doc: document, report: async u => void reports.push(u), publish: s => void states.push(s), askAi: ask, memory: memory.port, origin: 'https://x.fr', quietMs: 40, settleTimeoutMs: 500 });

      await runner.start();
      document.body.insertAdjacentHTML('beforeend', '<h2>Suite</h2><label for="z">Nom</label><input id="z" name="nom" />');
      await pause(200);

      expect(memory.port.save).not.toHaveBeenCalled();
    });

    it('une panne à l’enregistrement ne casse rien, et sera retentée', async () => {
      const memory = fakeMemory();
      memory.port.save.mockRejectedValueOnce(new Error('hors ligne'));
      create(memory.port);
      await runner.start();

      ax.next();
      await until(() => value('immat') === 'AB-123-CD');
      expect(lastState().memory).not.toBe('learned');
      expect(value('immat')).toBe('AB-123-CD');
    });

    it('les corrections manuelles du courtier sont apprises avec une confiance maximale', async () => {
      const memory = fakeMemory();
      create(memory.port, { obscurePhoneLabel: true });
      await runner.start();
      const phone = lastState().fields.find(f => f.label === 'Votre numéro direct')!;
      await runner.manualMap(phone.key, 'client.phone');

      ax.next();
      await until(() => value('immat') === 'AB-123-CD');

      const saved = memory.port.save.mock.calls[0][2];
      expect(saved.find(f => f.label === 'Votre numéro direct')).toMatchObject({ canonicalPath: 'client.phone', confidence: 1 });
    });
  });
});
