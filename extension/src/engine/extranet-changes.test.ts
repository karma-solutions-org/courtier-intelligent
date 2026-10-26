import { ABSENT_AFTER_RUNS, applySighting, mergeDiscoveredFields, schemaForCabinet, type DiscoveredFieldInput, type Question, type QuestionnaireSection } from '@shared';
import { describe, expect, it } from 'vitest';

// Un extranet modifie ou retire une question : le questionnaire suit (shared/discovered-fields.ts), sans rien supprimer.
const ORIGIN = 'https://extranet.assureur-a.fr';
const OTHER = 'https://extranet.assureur-b.fr';

const usage = (overrides: Partial<Question> = {}): Question => ({
  canonicalPath: 'extra.usage_vehicule',
  label: 'Usage du véhicule',
  type: 'choice',
  required: true,
  choices: [
    { value: 'P', label: 'Privé' },
    { value: 'T', label: 'Trajet travail' },
  ],
  discoveredOn: [{ insurerId: 'assureur-a', origin: ORIGIN, fieldKey: 'select:usage' }],
  ...overrides,
});

const schemaWith = (question: Question): QuestionnaireSection[] => [{ title: 'Questions des assureurs', discovered: true, questions: [question] }];

const seen = (overrides: Partial<DiscoveredFieldInput> = {}): DiscoveredFieldInput => ({
  fieldKey: 'select:usage',
  label: 'Usage du véhicule',
  kind: 'select',
  inputType: 'select',
  name: 'usage',
  section: null,
  options: [
    { value: 'P', label: 'Privé' },
    { value: 'T', label: 'Trajet travail' },
  ],
  ...overrides,
});

const only = (schema: QuestionnaireSection[]) => schema[0].questions[0];

describe('applySighting : constat d’un parcours mené jusqu’au tarif', () => {
  it('champ inchangé : rien à enregistrer', () => {
    expect(applySighting(schemaWith(usage()), [seen()], ORIGIN).changed).toBe(false);
  });

  it('libellé et choix modifiés par l’extranet : la question est mise à jour', () => {
    const options = [
      { value: 'P', label: 'Privé' },
      { value: 'PRO', label: 'Professionnel' },
    ];
    const result = applySighting(schemaWith(usage()), [seen({ label: 'Utilisation du véhicule *', options })], ORIGIN);
    expect(result.changed).toBe(true);
    expect(only(result.schema).label).toBe('Utilisation du véhicule');
    expect(only(result.schema).choices).toEqual(options);
  });

  it('question partagée avec un autre extranet : son libellé n’est pas réécrit', () => {
    const shared = usage({ discoveredOn: [...usage().discoveredOn!, { insurerId: 'assureur-b', origin: OTHER, fieldKey: 'usage' }] });
    const result = applySighting(schemaWith(shared), [seen({ label: 'Utilisation du véhicule' })], ORIGIN);
    expect(only(result.schema).label).toBe('Usage du véhicule');
  });

  it(`champ disparu : la question n’est plus posée après ${ABSENT_AFTER_RUNS} parcours, sans être supprimée`, () => {
    let schema = schemaWith(usage());
    for (let run = 1; run < ABSENT_AFTER_RUNS; run++) schema = applySighting(schema, [], ORIGIN).schema;
    expect(only(schema).discoveredOn![0].absent).toBeUndefined();
    expect(schemaForCabinet(schema, [])[0].questions).toHaveLength(1);

    schema = applySighting(schema, [], ORIGIN).schema;
    expect(only(schema).discoveredOn![0].absent).toBe(true);
    expect(schemaForCabinet(schema, [])).toEqual([]);
    expect(schemaForCabinet(schema, ['assureur-a'])).toEqual([]);
  });

  it('champ revu après sa disparition : la question revient', () => {
    let schema = schemaWith(usage());
    for (let run = 0; run < ABSENT_AFTER_RUNS; run++) schema = applySighting(schema, [], ORIGIN).schema;
    schema = applySighting(schema, [seen()], ORIGIN).schema;
    expect(only(schema).discoveredOn![0]).toEqual({ insurerId: 'assureur-a', origin: ORIGIN, fieldKey: 'select:usage' });
    expect(schemaForCabinet(schema, [])[0].questions).toHaveLength(1);
  });

  it('un parcours sur un autre extranet ne compte pas le champ comme disparu', () => {
    expect(applySighting(schemaWith(usage()), [], OTHER).changed).toBe(false);
  });

  it('disparu d’un extranet mais posé par un autre : la question reste pour l’autre', () => {
    let schema = schemaWith(usage({ discoveredOn: [...usage().discoveredOn!, { insurerId: 'assureur-b', origin: OTHER, fieldKey: 'usage' }] }));
    for (let run = 0; run < ABSENT_AFTER_RUNS; run++) schema = applySighting(schema, [], ORIGIN).schema;
    expect(schemaForCabinet(schema, ['assureur-a'])).toEqual([]);
    expect(schemaForCabinet(schema, ['assureur-b'])[0].questions).toHaveLength(1);
  });

  it('les questions du catalogue ne sont jamais touchées', () => {
    const catalogue: QuestionnaireSection[] = [{ title: 'Véhicule', questions: [usage()] }];
    expect(applySighting(catalogue, [], ORIGIN)).toEqual({ schema: catalogue, changed: false });
  });

  it('ne modifie pas le questionnaire reçu', () => {
    const schema = schemaWith(usage());
    applySighting(schema, [], ORIGIN);
    expect(only(schema).discoveredOn![0].missedRuns).toBeUndefined();
  });
});

describe('mergeDiscoveredFields : même champ, libellé modifié', () => {
  it('le champ reconnu à sa clé met la question à jour au lieu d’en créer une seconde', () => {
    const result = mergeDiscoveredFields(schemaWith(usage()), [seen({ label: 'Utilisation principale du véhicule', required: true })], {
      insurerId: 'assureur-a',
      origin: ORIGIN,
    });
    expect(result.added).toEqual([]);
    expect(result.mapping).toEqual({ 'select:usage': 'extra.usage_vehicule' });
    expect(only(result.schema).label).toBe('Utilisation principale du véhicule');
  });
});
