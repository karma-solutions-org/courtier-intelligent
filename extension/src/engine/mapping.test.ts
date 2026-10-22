import { CANONICAL_PATHS, parseClaimPath } from '@shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { mountAssureurA } from './__fixtures__/assureur-a';
import { analyzeForm, FormField } from './analyzer';
import { ACCEPT_THRESHOLD, asCanonicalPath, isCompatible, mapExtraPaths, mapFields, matchExtraPath, scoreCandidate } from './mapping';
import { FIELD_SYNONYMS, PATH_EXPECTED } from './field-synonyms';

const field = (overrides: Partial<FormField>): FormField => ({
  key: 'text:x',
  kind: 'text',
  inputType: 'text',
  label: '',
  placeholder: null,
  name: null,
  id: null,
  autocomplete: null,
  required: false,
  section: null,
  order: 0,
  options: [],
  pattern: null,
  maxLength: null,
  ...overrides,
});

const best = (f: Partial<FormField>) => mapFields([field(f)])[0];

describe('Dictionnaire', () => {
  it('couvre chaque chemin canonique, et lui seul (liste fermée)', () => {
    expect(Object.keys(FIELD_SYNONYMS).sort()).toEqual([...CANONICAL_PATHS].sort());
    expect(Object.keys(PATH_EXPECTED).sort()).toEqual([...CANONICAL_PATHS].sort());
  });

  it('chaque chemin se reconnaît lui-même par son premier libellé', () => {
    for (const path of CANONICAL_PATHS) {
      const label = FIELD_SYNONYMS[path].labels[0];
      const kind = PATH_EXPECTED[path] === 'boolean' ? 'radio' : PATH_EXPECTED[path] === 'choice' ? 'select' : PATH_EXPECTED[path] === 'date' ? 'date' : PATH_EXPECTED[path] === 'number' ? 'number' : 'text';
      const row = parseClaimPath(path)?.index; // un sinistre n'est reconnu que sur sa ligne du tableau
      const mapping = best({ label, kind, inputType: kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text', ...(row ? { row } : {}) });
      expect(mapping.canonicalPath, `${path} ← « ${label} »`).toBe(path);
    }
  });
});

describe('Scoring', () => {
  it('un libellé exact est très sûr', () => {
    expect(scoreCandidate(field({ label: 'Date de naissance', kind: 'date', inputType: 'date' }), 'client.birthDate')).toBeGreaterThanOrEqual(0.9);
  });

  it('un libellé qui contient le synonyme est moins sûr qu’un libellé exact', () => {
    const exact = scoreCandidate(field({ label: 'Ville' }), 'client.address.city');
    const partial = scoreCandidate(field({ label: 'Ville de votre domicile principal' }), 'client.address.city');
    expect(partial).toBeLessThan(exact);
    expect(partial).toBeGreaterThan(0.5);
  });

  it('les mots sont comparés entiers : « renommer » n’est pas « nom »', () => {
    expect(scoreCandidate(field({ label: 'Renommer le fichier' }), 'client.lastName')).toBe(0);
  });

  it("l'attribut autocomplete du navigateur est un indice fort", () => {
    expect(scoreCandidate(field({ label: 'Champ 12', autocomplete: 'postal-code' }), 'client.address.postalCode')).toBeGreaterThanOrEqual(0.95);
  });

  it('lit aussi les noms techniques (camelCase, tirets) quand le libellé ne dit rien', () => {
    expect(best({ label: '', name: 'vehicleRegistration' }).canonicalPath).toBeNull(); // trop faible seul : 0,6
    expect(scoreCandidate(field({ label: '', name: 'immatriculation' }), 'vehicle.registration')).toBeCloseTo(0.6);
  });

  it('exclut les types incompatibles (une date ne va pas dans une case à cocher)', () => {
    expect(scoreCandidate(field({ label: 'Date de naissance', kind: 'checkbox', inputType: 'checkbox' }), 'client.birthDate')).toBe(0);
    expect(scoreCandidate(field({ label: 'Nombre de sinistres', kind: 'checkbox', inputType: 'checkbox' }), 'insuranceHistory.claimsCount')).toBe(0);
  });

  it('un champ e-mail ne reçoit que l’e-mail, un champ téléphone que le téléphone', () => {
    expect(isCompatible(field({ inputType: 'email' }), 'client.firstName')).toBe(false);
    expect(isCompatible(field({ inputType: 'email' }), 'client.email')).toBe(true);
    expect(isCompatible(field({ inputType: 'tel' }), 'client.phone')).toBe(true);
    expect(isCompatible(field({ inputType: 'tel' }), 'client.lastName')).toBe(false);
  });
});

describe('Contexte : le même libellé, selon la section', () => {
  it('« Nom » du souscripteur et « Nom » du conducteur sont départagés par leur section', () => {
    const [subscriber, driver] = mapFields([
      field({ key: 'a', label: 'Nom', section: 'Vos informations' }),
      field({ key: 'b', label: 'Nom', section: 'Conducteur principal' }),
    ]);

    expect(subscriber.canonicalPath).toBe('client.lastName');
    expect(driver.canonicalPath).toBe('driver.lastName');
  });

  it('un libellé qui nomme le conducteur l’emporte sur le libellé court', () => {
    expect(best({ label: 'Nom du conducteur' }).canonicalPath).toBe('driver.lastName');
    expect(best({ label: 'Date de naissance du conducteur', kind: 'date', inputType: 'date' }).canonicalPath).toBe('driver.birthDate');
  });

  it('« Date de naissance » sans contexte précis est celle du souscripteur', () => {
    expect(best({ label: 'Date de naissance', kind: 'date', inputType: 'date', section: 'Vos informations' }).canonicalPath).toBe('client.birthDate');
  });
});

describe('Décision de mapping', () => {
  it('retient un mapping sûr', () => {
    const mapping = best({ label: 'Immatriculation' });
    expect(mapping).toMatchObject({ canonicalPath: 'vehicle.registration', status: 'mapped', source: 'heuristic' });
    expect(mapping.confidence).toBeGreaterThanOrEqual(ACCEPT_THRESHOLD);
  });

  it('un champ qui ressemble à peine à un chemin est « incertain » : pas de mapping sans l’IA', () => {
    const mapping = best({ label: '', name: 'immatriculation' });
    expect(mapping).toMatchObject({ canonicalPath: null, status: 'uncertain' });
    expect(mapping.candidates[0].path).toBe('vehicle.registration');
  });

  it('un champ inconnu est « non trouvé » : jamais de valeur inventée', () => {
    expect(best({ label: 'Civilité' })).toMatchObject({ canonicalPath: null, status: 'unmapped' });
    expect(best({ label: "J'accepte les conditions générales", kind: 'checkbox', inputType: 'checkbox' })).toMatchObject({ canonicalPath: null, status: 'unmapped' });
  });

  it('deux candidats à égalité : ambigu, donc incertain', () => {
    const mapping = best({ label: 'Date', kind: 'date', inputType: 'date', name: 'date_naissance_permis' });
    expect(mapping.canonicalPath).toBeNull();
  });

  it('deux champs ne visent pas le même chemin : le mieux noté le garde', () => {
    const [exact, vague] = mapFields([
      field({ key: 'a', label: 'Marque' }),
      field({ key: 'b', label: 'Marque préférée du conjoint' }),
    ]);

    expect(exact.canonicalPath).toBe('vehicle.brand');
    expect(vague).toMatchObject({ canonicalPath: null, status: 'uncertain' });
  });

  it('…sauf un champ de confirmation, qui reçoit la même valeur', () => {
    const mappings = mapFields([
      field({ key: 'a', label: 'Adresse e-mail', inputType: 'email' }),
      field({ key: 'b', label: 'Confirmez votre e-mail', inputType: 'email' }),
    ]);

    expect(mappings.map(m => m.canonicalPath)).toEqual(['client.email', 'client.email']);
  });
});

describe('Liste fermée', () => {
  it('seul un chemin canonique est accepté', () => {
    expect(asCanonicalPath('client.lastName')).toBe('client.lastName');
    expect(asCanonicalPath('client.inconnu')).toBeNull();
    expect(asCanonicalPath('__proto__')).toBeNull();
    expect(asCanonicalPath(42)).toBeNull();
    expect(asCanonicalPath(null)).toBeNull();
  });

  it("jamais de chemin hors liste dans un résultat, quel que soit le formulaire", () => {
    mountAssureurA(document);
    for (const mapping of mapFields(analyzeForm(document).fields)) {
      expect(mapping.canonicalPath === null || asCanonicalPath(mapping.canonicalPath) !== null).toBe(true);
      mapping.candidates.forEach(c => expect(asCanonicalPath(c.path)).not.toBeNull());
    }
  });
});

describe('Extranet de l’assureur A', () => {
  let mappings: Map<string, string | null>;
  beforeEach(() => {
    mountAssureurA(document);
    const { fields } = analyzeForm(document);
    mappings = new Map(mapFields(fields).map(m => [fields.find(f => f.key === m.fieldKey)!.label, m.canonicalPath]));
  });

  it('étape 1 : reconnaît les champs du souscripteur, et laisse de côté la civilité', () => {
    expect(Object.fromEntries(mappings)).toEqual({
      Civilité: null,
      Nom: 'client.lastName',
      Prénom: 'client.firstName',
      'Date de naissance': 'client.birthDate',
      'Adresse e-mail': 'client.email',
      'Confirmez votre e-mail': 'client.email',
      'Téléphone mobile': 'client.phone',
      Adresse: 'client.address.street',
      'Code postal': 'client.address.postalCode',
      Ville: 'client.address.city',
    });
  });

  it('étape 2 et 3 : véhicule, conducteur et historique', async () => {
    const ax = mountAssureurA(document);
    const mapStep = async () => {
      await new Promise(resolve => setTimeout(resolve, 80));
      const { fields } = analyzeForm(document);
      return Object.fromEntries(mapFields(fields).map(m => [fields.find(f => f.key === m.fieldKey)!.label, m.canonicalPath]));
    };

    ax.next();
    expect(await mapStep()).toEqual({
      Immatriculation: 'vehicle.registration',
      Marque: 'vehicle.brand',
      Modèle: 'vehicle.model',
      'Date de première mise en circulation': 'vehicle.firstRegistrationDate',
      'Puissance fiscale (CV)': 'vehicle.fiscalPower',
      'Usage du véhicule': 'vehicle.usage',
      'Lieu de stationnement la nuit': 'vehicle.parkingType',
    });

    ax.next();
    expect(await mapStep()).toEqual({
      'Nom du conducteur': 'driver.lastName',
      'Prénom du conducteur': 'driver.firstName',
      'Date de naissance du conducteur': 'driver.birthDate',
      "Date d'obtention du permis": 'driver.licenseDate',
      'Êtes-vous actuellement assuré ?': 'insuranceHistory.currentlyInsured',
      'Coefficient bonus-malus': 'insuranceHistory.bonusMalus',
      'Nombre de sinistres (36 derniers mois)': 'insuranceHistory.claimsCount',
      'Avez-vous déjà été résilié ?': 'insuranceHistory.wasTerminated',
      "J'accepte les conditions générales": null,
    });
  });
});

describe('questions ajoutées depuis un extranet, reconnues sur un autre extranet', () => {
  const extra = (label: string, overrides: Partial<FormField> = {}): FormField => field({ label, kind: 'text', inputType: 'text', ...overrides });

  it('reconnaît la même question formulée dans un autre ordre ou au pluriel', () => {
    const fields = [extra('Annuel kilométrage *')];
    const mappings = mapExtraPaths(fields, mapFields(fields), ['extra.kilometrage_annuel']);
    expect(mappings[0]).toMatchObject({ canonicalPath: 'extra.kilometrage_annuel', status: 'mapped' });
    expect(matchExtraPath(extra('Nombre de sinistres déclarés'), ['extra.nombre_sinistre_declare'])?.score).toBeGreaterThanOrEqual(0.75);
  });

  it('propose seulement à l’IA une question proche mais différente', () => {
    const fields = [extra('Kilométrage annuel parcouru estimé')];
    const [mapping] = mapExtraPaths(fields, mapFields(fields), ['extra.kilometrage_annuel']);
    expect(mapping.status).toBe('uncertain');
    expect(mapping.candidates[0].path).toBe('extra.kilometrage_annuel');
  });

  it('ne rapproche pas des questions sans rapport', () => {
    expect(matchExtraPath(extra('Usage du véhicule'), ['extra.kilometrage_annuel'])).toBeNull();
  });
});

describe('Zephir : lieu de stationnement', () => {
  it('« Ville du lieu de stationnement » est la ville, pas le type de stationnement', () => {
    expect(scoreCandidate(field({ label: 'Ville du lieu de stationnement' }), 'vehicle.parkingCity')).toBeGreaterThan(
      scoreCandidate(field({ label: 'Ville du lieu de stationnement' }), 'vehicle.parkingType'),
    );
  });
});
