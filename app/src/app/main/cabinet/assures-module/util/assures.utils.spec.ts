import { FormControl } from '@angular/forms';
import { Assure } from '@shared';
import {
  birthDateValidator,
  displayName,
  findDuplicates,
  matchesSearch,
  normalize,
  phoneValidator,
  siretValidator,
} from './assures.utils';

const assure = (overrides: Partial<Assure> = {}): Assure => ({
  id: 'a1',
  type: 'particulier',
  firstName: 'Jean',
  lastName: 'Dupont',
  birthDate: '1985-03-12',
  email: 'jean.dupont@example.fr',
  phone: '06 12 34 56 78',
  address: { city: 'Lyon', postalCode: '69003' },
  createdBy: 'uid',
  ...overrides,
});

describe('Validation des formats', () => {
  const valid = (validator: (c: FormControl) => unknown, value: string) => validator(new FormControl(value)) === null;

  it.each(['06 12 34 56 78', '0612345678', '+33 6 12 34 56 78', '06.12.34.56.78', '', '  '])(
    'accepte le téléphone « %s »',
    value => expect(valid(phoneValidator, value)).toBe(true),
  );

  it.each(['12345', '06 12 34 56', '0012345678', 'abcdefghij', '+44 7911 123456'])(
    'refuse le téléphone « %s »',
    value => expect(valid(phoneValidator, value)).toBe(false),
  );

  it('accepte un SIRET de 14 chiffres, avec ou sans espaces', () => {
    expect(valid(siretValidator, '12345678901234')).toBe(true);
    expect(valid(siretValidator, '123 456 789 01234')).toBe(true);
    expect(valid(siretValidator, '1234567890123')).toBe(false);
    expect(valid(siretValidator, '1234567890123A')).toBe(false);
  });

  it('refuse une date de naissance future, trop ancienne ou invalide', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().substring(0, 10);
    expect(valid(birthDateValidator, '1985-03-12')).toBe(true);
    expect(valid(birthDateValidator, tomorrow)).toBe(false);
    expect(valid(birthDateValidator, '1850-01-01')).toBe(false);
    expect(valid(birthDateValidator, '2020-13-45')).toBe(false);
  });
});

describe('displayName', () => {
  it("affiche la raison sociale d'un professionnel, sinon prénom et nom", () => {
    expect(displayName(assure())).toBe('Jean Dupont');
    expect(displayName(assure({ type: 'pro', companyName: 'Dupont SARL' }))).toBe('Dupont SARL');
  });
});

describe('matchesSearch', () => {
  it('ignore la casse et les accents', () => {
    expect(matchesSearch(assure({ lastName: 'Élodie-Martin' }), 'elodie')).toBe(true);
    expect(matchesSearch(assure(), 'DUPONT')).toBe(true);
  });

  it('exige que tous les mots se retrouvent', () => {
    expect(matchesSearch(assure(), 'jean lyon')).toBe(true);
    expect(matchesSearch(assure(), 'jean paris')).toBe(false);
  });

  it("cherche dans l'email, le téléphone (sans espaces) et la société", () => {
    expect(matchesSearch(assure(), 'jean.dupont@example')).toBe(true);
    expect(matchesSearch(assure(), '0612345678')).toBe(true);
    expect(matchesSearch(assure({ type: 'pro', companyName: 'Boulangerie Soleil' }), 'soleil')).toBe(true);
  });

  it('une recherche vide garde tout le monde', () => {
    expect(matchesSearch(assure(), '   ')).toBe(true);
  });
});

describe('findDuplicates', () => {
  const existing = [assure(), assure({ id: 'a2', firstName: 'Marie', lastName: 'Curie', email: 'marie@example.fr', birthDate: '1990-01-01' })];

  it('repère le même email, sans tenir compte de la casse', () => {
    expect(findDuplicates({ email: 'JEAN.DUPONT@example.fr' }, existing).map(a => a.id)).toEqual(['a1']);
  });

  it('repère les mêmes nom, prénom et date de naissance, sans tenir compte des accents', () => {
    const candidate = { firstName: 'jean', lastName: 'DÙPONT', birthDate: '1985-03-12' };
    expect(findDuplicates(candidate, existing).map(a => a.id)).toEqual(['a1']);
  });

  it('un homonyme né un autre jour n’est pas un doublon', () => {
    expect(findDuplicates({ firstName: 'Jean', lastName: 'Dupont', birthDate: '1970-01-01' }, existing)).toEqual([]);
  });

  it('sans date de naissance, le nom seul ne suffit pas', () => {
    expect(findDuplicates({ firstName: 'Jean', lastName: 'Dupont' }, existing)).toEqual([]);
  });

  it("un email vide ne ressemble à aucun assuré sans email", () => {
    expect(findDuplicates({ email: '' }, [assure({ email: null })])).toEqual([]);
  });

  it("écarte l'assuré en cours de modification", () => {
    expect(findDuplicates({ email: 'jean.dupont@example.fr' }, existing, 'a1')).toEqual([]);
  });
});

describe('normalize', () => {
  it('retire accents, majuscules et espaces superflus', () => {
    expect(normalize('  Éric   DE  la Tour ')).toBe('eric de la tour');
    expect(normalize(null)).toBe('');
  });
});
