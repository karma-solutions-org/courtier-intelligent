import { askedQuestionCount, OPTIONAL_SECTION_TITLE, schemaForInsurers, schemaWithComplements, withAddedComplements, type Question, type QuestionnaireSection } from '@shared';
import { describe, expect, it } from 'vitest';

/** Questionnaire en deux niveaux (phase 2) : socle toujours posé, compléments selon les extranets choisis. */

const q = (canonicalPath: string, extra: Partial<Question> = {}): Question =>
  ({ canonicalPath, label: canonicalPath, type: 'text', required: true, ...extra }) as Question;

const SCHEMA: QuestionnaireSection[] = [
  { title: 'Souscripteur', questions: [q('client.lastName', { core: true }), q('client.email', { core: true })] },
  {
    title: 'Conducteur',
    questions: [q('driver.licenseDate', { core: true }), q('driver.licenseCountry'), q('driver.birthCountry', { required: false })],
  },
  {
    title: 'Antécédents',
    questions: [
      q('insuranceHistory.wasTerminated', { core: true, type: 'boolean' }),
      q('insuranceHistory.terminationReason', { core: true, visibleIf: { path: 'insuranceHistory.wasTerminated', equals: true } }),
      q('insuranceHistory.claimsCount', { withKnowledge: true, mustBeKnown: true }),
      q('insuranceHistory.claims.1.date', { visibleIf: { path: 'insuranceHistory.claimsCount', equals: 1 } }),
    ],
  },
];

const OYAT = { id: 'oyat', questions: { auto: ['driver.licenseCountry', 'insuranceHistory.claims.1.date'] } };
const UNKNOWN = { id: 'assureur-inconnu' };

const titles = (schema: QuestionnaireSection[]) => schema.map(section => section.title);
const paths = (section?: QuestionnaireSection) => section?.questions.map(question => question.canonicalPath) ?? [];
const optionalOf = (schema: QuestionnaireSection[]) => schema.find(section => section.optional);

describe('Questionnaire : socle et compléments', () => {
  it("un extranet sans liste connue reçoit le socle, pas tout le questionnaire", () => {
    const schema = schemaWithComplements(SCHEMA, [UNKNOWN], 'auto');

    expect(paths(schema[0])).toEqual(['client.lastName', 'client.email']);
    expect(schema.flatMap(section => (section.optional ? [] : paths(section)))).toEqual([
      'client.lastName',
      'client.email',
      'driver.licenseDate',
      'insuranceHistory.wasTerminated',
      'insuranceHistory.terminationReason',
    ]);
    // Avant : un extranet sans liste ne filtrait rien.
    expect(schemaForInsurers(SCHEMA, [UNKNOWN], 'auto').flatMap(paths)).toHaveLength(9);
  });

  it("ajoute les compléments demandés par un extranet choisi, avec la question qui les conditionne", () => {
    const schema = schemaWithComplements(SCHEMA, [OYAT, UNKNOWN], 'auto');
    const asked = schema.filter(section => !section.optional).flatMap(paths);

    expect(asked).toContain('driver.licenseCountry');
    expect(asked).toContain('insuranceHistory.claims.1.date');
    // Condition d'affichage du détail du sinistre : le nombre de sinistres est posé aussi.
    expect(asked).toContain('insuranceHistory.claimsCount');
    expect(paths(optionalOf(schema))).toEqual(['driver.birthCountry']);
  });

  it('range les compléments non demandés dans une section facultative, jamais obligatoire', () => {
    const optional = optionalOf(schemaWithComplements(SCHEMA, [UNKNOWN], 'auto'))!;

    expect(optional.title).toBe(OPTIONAL_SECTION_TITLE);
    expect(paths(optional)).toEqual(['driver.licenseCountry', 'driver.birthCountry', 'insuranceHistory.claimsCount', 'insuranceHistory.claims.1.date']);
    expect(optional.questions.every(question => !question.required)).toBe(true);
    expect(optional.questions.find(question => question.canonicalPath === 'insuranceHistory.claimsCount')?.mustBeKnown).toBe(false);
    // La section facultative est la dernière.
    expect(titles(schemaWithComplements(SCHEMA, [UNKNOWN], 'auto')).at(-1)).toBe(OPTIONAL_SECTION_TITLE);
  });

  it('garde les questions apprises des parcours comme des compléments demandés', () => {
    const schema = schemaWithComplements(SCHEMA, [UNKNOWN], 'auto', { 'assureur-inconnu': ['driver.birthCountry'] });

    expect(schema.filter(section => !section.optional).flatMap(paths)).toContain('driver.birthCountry');
  });

  it("garde les questions découvertes sur les extranets choisis hors de la section facultative", () => {
    const discovered: QuestionnaireSection = {
      title: 'Questions des extranets',
      discovered: true,
      questions: [q('extra.kilometrage', { discoveredOn: [{ insurerId: 'oyat', origin: 'https://x', at: '' } as never] })],
    };
    const schema = schemaWithComplements([...SCHEMA, discovered], [OYAT], 'auto');

    expect(schema.find(section => section.discovered)?.questions.map(question => question.canonicalPath)).toEqual(['extra.kilometrage']);
    expect(paths(optionalOf(schema))).not.toContain('extra.kilometrage');
  });

  it('ancien catalogue sans socle : même résultat que le filtrage par extranets', () => {
    const legacy = SCHEMA.map(section => ({ ...section, questions: section.questions.map(({ core: _core, ...rest }) => rest) }));

    expect(schemaWithComplements(legacy, [OYAT], 'auto')).toEqual(schemaForInsurers(legacy, [OYAT], 'auto'));
  });

  describe('assureur ajouté pendant la tarification', () => {
    const frozen = schemaWithComplements(SCHEMA, [UNKNOWN], 'auto');

    it('ajoute au questionnaire figé les compléments du nouvel assureur, obligatoires, et les retire du facultatif', () => {
      const { schema, added } = withAddedComplements(frozen, schemaWithComplements(SCHEMA, [UNKNOWN, OYAT], 'auto'));

      expect(added).toEqual(['driver.licenseCountry', 'insuranceHistory.claimsCount', 'insuranceHistory.claims.1.date']);
      const conducteur = schema.find(section => section.title === 'Conducteur')!;
      expect(paths(conducteur)).toEqual(['driver.licenseDate', 'driver.licenseCountry']);
      expect(conducteur.questions[1].required).toBe(true);
      expect(paths(optionalOf(schema))).toEqual(['driver.birthCountry']);
      // Les sections existantes gardent leur ordre ; la section facultative reste la dernière.
      expect(titles(schema)).toEqual(['Souscripteur', 'Conducteur', 'Antécédents', OPTIONAL_SECTION_TITLE]);
    });

    it("ne change rien si le nouvel assureur n'ajoute aucune question", () => {
      const result = withAddedComplements(frozen, schemaWithComplements(SCHEMA, [UNKNOWN, { id: 'autre' }], 'auto'));

      expect(result).toEqual({ schema: frozen, added: [] });
    });

    it('crée la section manquante avant la section facultative', () => {
      const fresh: QuestionnaireSection[] = [...SCHEMA, { title: 'Véhicule', questions: [q('vehicle.parkingCity')] }];
      const withVehicle = { id: 'v', questions: { auto: ['vehicle.parkingCity'] } };
      const { schema } = withAddedComplements(frozen, schemaWithComplements(fresh, [UNKNOWN, withVehicle], 'auto'));

      expect(titles(schema).slice(-2)).toEqual(['Véhicule', OPTIONAL_SECTION_TITLE]);
    });
  });

  it('compte les questions posées et les facultatives', () => {
    expect(askedQuestionCount(schemaWithComplements(SCHEMA, [UNKNOWN], 'auto'))).toEqual({ asked: 5, optional: 4 });
    expect(askedQuestionCount(SCHEMA)).toEqual({ asked: 9, optional: 0 });
  });
});
