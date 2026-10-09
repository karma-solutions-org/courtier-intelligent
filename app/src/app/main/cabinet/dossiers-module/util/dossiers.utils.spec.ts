import { Dossier, QuestionnaireSection } from '@shared';
import { EMPTY_FILTER, filterDossiers, labelsByPath, manualTransitionsFrom, sectionIndexOf } from './dossiers.utils';

const dossier = (overrides: Partial<Dossier>): Dossier =>
  ({ id: 'd', reference: '2026-000001', assureId: 'a', productId: 'auto', assignedTo: 'u1', status: 'brouillon', ...overrides }) as Dossier;

describe('filterDossiers', () => {
  const dossiers = [
    dossier({ id: '1', status: 'brouillon', productId: 'auto', assignedTo: 'u1' }),
    dossier({ id: '2', status: 'complet', productId: 'auto', assignedTo: 'u2' }),
    dossier({ id: '3', status: 'complet', productId: 'habitation', assignedTo: 'u1' }),
  ];
  const ids = (filter: Partial<typeof EMPTY_FILTER>, uid: string | null = 'u1') =>
    filterDossiers(dossiers, { ...EMPTY_FILTER, ...filter }, uid).map(d => d.id);

  it('sans filtre, garde tous les dossiers', () => {
    expect(ids({})).toEqual(['1', '2', '3']);
  });

  it('filtre par statut, par produit et par courtier', () => {
    expect(ids({ status: 'complet' })).toEqual(['2', '3']);
    expect(ids({ productId: 'habitation' })).toEqual(['3']);
    expect(ids({ assignedTo: 'u2' })).toEqual(['2']);
  });

  it('cumule les filtres', () => {
    expect(ids({ status: 'complet', assignedTo: 'u1' })).toEqual(['3']);
    expect(ids({ status: 'brouillon', productId: 'habitation' })).toEqual([]);
  });

  it('« Mes dossiers » ne garde que ceux de l’utilisateur connecté', () => {
    expect(ids({ mine: true }, 'u1')).toEqual(['1', '3']);
    expect(ids({ mine: true }, 'u2')).toEqual(['2']);
    expect(ids({ mine: true }, null)).toEqual([]);
  });

  it('« Mes dossiers » l’emporte sur le filtre par courtier', () => {
    expect(ids({ mine: true, assignedTo: 'u2' }, 'u1')).toEqual(['1', '3']);
  });
});

describe('manualTransitionsFrom', () => {
  it('propose ce que le courtier peut déclencher, parmi les transitions de la machine à états', () => {
    expect(manualTransitionsFrom('brouillon')).toEqual(['complet', 'sans_suite']);
    expect(manualTransitionsFrom('complet')).toEqual(['brouillon', 'sans_suite']);
  });

  it("ne propose rien pour un dossier terminé, ni les statuts poussés par d'autres étapes", () => {
    expect(manualTransitionsFrom('sans_suite')).toEqual([]);
    expect(manualTransitionsFrom('souscrit')).toEqual([]);
    expect(manualTransitionsFrom('tarification')).toEqual(['sans_suite']);
  });
});

describe('Questionnaire', () => {
  const schema: QuestionnaireSection[] = [
    { title: 'A', questions: [{ canonicalPath: 'client.lastName', label: 'Nom', type: 'text', required: true }] },
    { title: 'B', questions: [{ canonicalPath: 'vehicle.brand', label: 'Marque', type: 'text', required: true }] },
  ];

  it('retrouve le libellé et la section d’un champ', () => {
    expect(labelsByPath(schema).get('vehicle.brand')).toBe('Marque');
    expect(sectionIndexOf(schema, 'client.lastName')).toBe(0);
    expect(sectionIndexOf(schema, 'vehicle.brand')).toBe(1);
    expect(sectionIndexOf(schema, 'driver.phone')).toBe(0);
  });
});
