import { Assure, Dossier } from '@shared';
import { assureDetails, dossierLink, dossierStats, initialsOf } from './assure-detail.utils';

const assure = (overrides: Partial<Assure>): Assure =>
  ({ id: 'a1', type: 'particulier', firstName: 'Élodie', lastName: 'Martin', ...overrides }) as Assure;

describe('initialsOf', () => {
  it('prend les initiales des deux premiers mots du nom', () => {
    expect(initialsOf(assure({}))).toHaveLength(2);
    expect(initialsOf(assure({ firstName: '', lastName: '' }))).toBe('?');
  });
});

describe('assureDetails', () => {
  it('met la société en premier pour un professionnel', () => {
    const labels = assureDetails(assure({ type: 'pro', companyName: 'ACME', siret: '12345678901234' })).map((field) => field.label);
    expect(labels.slice(0, 2)).toEqual(['Raison sociale', 'SIRET']);
  });

  it('affiche la date de naissance au format français', () => {
    const birth = assureDetails(assure({ birthDate: '1985-04-12' })).find((field) => field.label === 'Date de naissance');
    expect(birth?.value).toBe('12/04/1985');
  });
});

describe('dossierStats', () => {
  it('compte les dossiers en cours et souscrits', () => {
    const dossiers = [{ status: 'brouillon' }, { status: 'souscrit' }, { status: 'refuse' }] as Dossier[];
    expect(dossierStats(dossiers)).toEqual({ inProgress: 1, won: 1 });
  });
});

describe('dossierLink', () => {
  it('reprend un brouillon dans son questionnaire', () => {
    expect(dossierLink({ id: 'd1', status: 'brouillon' }).at(-1)).toBe('brouillon');
    expect(dossierLink({ id: 'd1', status: 'complet' }).at(-1)).toBe('d1');
  });
});
