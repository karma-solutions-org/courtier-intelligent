import { findMatchingQuestion, labelSimilarity, mergeDiscoveredFields, schemaForInsurers, questionTypeOf, sameAnswerShape, type DiscoveredFieldInput, type QuestionnaireSection } from '@shared';
import { describe, expect, it } from 'vitest';

// Règle commune à l'extension et au serveur (shared/question-matching.ts), éprouvée sur les libellés réels de Zephir.
const ALCOOL_APP = 'La suspension ou l’annulation faisait-elle suite à une conduite sous l’emprise de l’alcool ?';
const ALCOOL_ZEPHIR = 'La suspension ou l’annulation faisait-elle suite à une conduite sous l’emprise d’un état alcoolique ?';
const STUPEFIANT = 'La suspension ou l’annulation faisait-elle suite à une conduite sous l’emprise de stupéfiant ?';
const POINTS = 'La suspension ou l’annulation faisait-elle suite à une perte de points ?';

describe('labelSimilarity : même question, autre forme', () => {
  it('« de l’alcool » = « d’un état alcoolique »', () => {
    expect(labelSimilarity(ALCOOL_APP, ALCOOL_ZEPHIR)).toBeGreaterThan(0);
  });

  it.each([
    [ALCOOL_ZEPHIR, STUPEFIANT],
    [ALCOOL_ZEPHIR, POINTS],
    [STUPEFIANT, POINTS],
  ])('questions voisines mais différentes : « %s » ≠ « %s »', (a, b) => {
    expect(labelSimilarity(a, b)).toBe(0);
  });

  it('ordre des mots, pluriel et accents ne comptent pas', () => {
    expect(labelSimilarity('Kilométrage annuel', 'annuels kilometrages')).toBeGreaterThan(0);
  });

  it('une question plus large n’est pas la même', () => {
    expect(labelSimilarity('Kilométrage annuel', 'Kilométrage annuel parcouru estimé par le conducteur')).toBe(0);
  });
});

describe('sameAnswerShape', () => {
  it('un choix Oui / Non est un oui / non', () => {
    expect(sameAnswerShape({ type: 'choice', choices: ['Oui', 'Non'] }, { type: 'boolean' })).toBe(true);
  });

  it('un texte n’est pas un oui / non', () => {
    expect(sameAnswerShape({ type: 'text' }, { type: 'boolean' })).toBe(false);
  });

  it('deux listes doivent partager au moins la moitié de leurs choix', () => {
    expect(sameAnswerShape({ type: 'choice', choices: ['Garage', 'Parking', 'Rue'] }, { type: 'choice', choices: ['Garage', 'Rue'] })).toBe(true);
    expect(sameAnswerShape({ type: 'choice', choices: ['A', 'B', 'C'] }, { type: 'choice', choices: ['X', 'Y'] })).toBe(false);
  });
});

describe('findMatchingQuestion', () => {
  it('choisit la question de même sens et de même forme de réponse', () => {
    const questions = [
      { id: 'stup', label: STUPEFIANT, shape: { type: 'boolean' as const } },
      { id: 'alcool-texte', label: ALCOOL_APP, shape: { type: 'text' as const } },
      { id: 'alcool', label: ALCOOL_APP, shape: { type: 'boolean' as const } },
    ];
    expect(findMatchingQuestion(questions, { label: ALCOOL_ZEPHIR, shape: { type: 'boolean' } })?.question.id).toBe('alcool');
  });
});

describe('mergeDiscoveredFields : plusieurs extranets, un seul questionnaire', () => {
  const yesNo = (fieldKey: string, label: string): DiscoveredFieldInput => ({
    fieldKey,
    label,
    kind: 'radio',
    inputType: 'aria-radio',
    name: null,
    section: null,
    options: [{ value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }],
    required: true,
  });

  it('une question Oui / Non découverte devient une question oui / non', () => {
    expect(questionTypeOf(yesNo('k', POINTS))).toBe('boolean');
  });

  it('la même question chez un autre assureur, avec d’autres mots, est rattachée (l’assureur est ajouté)', () => {
    const first = mergeDiscoveredFields([], [yesNo('a', ALCOOL_APP)], { insurerId: 'assureur-a', origin: 'https://a.fr' });
    const second = mergeDiscoveredFields(first.schema, [yesNo('z', ALCOOL_ZEPHIR)], { insurerId: 'zephir', origin: 'https://zeole.zephir.fr' });
    expect(second.added).toEqual([]);
    const [question] = second.schema.flatMap((section: QuestionnaireSection) => section.questions);
    expect(question.discoveredOn?.map(source => source.insurerId)).toEqual(['assureur-a', 'zephir']);
    expect(second.mapping['z']).toBe(question.canonicalPath);
  });

  it('une question voisine mais différente est ajoutée à part', () => {
    const first = mergeDiscoveredFields([], [yesNo('a', ALCOOL_ZEPHIR)], { insurerId: 'zephir', origin: 'https://zeole.zephir.fr' });
    const second = mergeDiscoveredFields(first.schema, [yesNo('b', STUPEFIANT), yesNo('c', POINTS)], { insurerId: 'zephir', origin: 'https://zeole.zephir.fr' });
    expect(second.added.map(question => question.label)).toEqual([STUPEFIANT, POINTS]);
  });
});

describe('labelSimilarity : mots voisins mais différents', () => {
  it('« assuré » ≠ « assureur »', () => {
    expect(labelSimilarity('Nom de l’assuré', 'Nom de l’assureur')).toBe(0);
  });

  it('le féminin et le pluriel ne comptent pas', () => {
    expect(labelSimilarity('Conducteurs assurés', 'conducteur assuré')).toBeGreaterThan(0);
  });
});

describe('Même question chez Oyat et dans l’application, quelle que soit sa forme', () => {
  const field = (fieldKey: string, label: string, kind: DiscoveredFieldInput['kind'], options: { value: string; label: string }[] = []): DiscoveredFieldInput => ({
    fieldKey,
    label,
    kind,
    inputType: kind === 'select' ? 'select' : 'text',
    name: null,
    section: null,
    options,
    required: true,
  });
  const schema: QuestionnaireSection[] = [
    {
      title: 'Conducteur',
      questions: [{ canonicalPath: 'driver.profession', label: 'Profession', type: 'text', required: false }],
    },
    {
      title: 'Historique',
      questions: [{ canonicalPath: 'insuranceHistory.claimsCount', label: 'Sinistres déclarés sur les 36 derniers mois', type: 'number', required: true }],
    },
  ];

  it('« Profession » en liste (Oyat) = « Profession » en texte (application)', () => {
    const options = [{ value: '1', label: 'Professionnels de l’automobile' }, { value: '2', label: 'Enseignant' }];
    const result = mergeDiscoveredFields(schema, [field('prof', 'Profession :', 'select', options)], { insurerId: 'oyat', origin: 'https://extranet.oyat-assurances.fr' });
    expect(result.added).toEqual([]);
    expect(result.mapping.prof).toBe('driver.profession');
  });

  it('« Nombres de sinistres survenus sur les 36 derniers mois » = « Sinistres déclarés sur les 36 derniers mois »', () => {
    const result = mergeDiscoveredFields(schema, [field('nb', 'Nombres de sinistres survenus sur les 36 derniers mois :', 'text')], { insurerId: 'oyat', origin: 'https://extranet.oyat-assurances.fr' });
    expect(result.added).toEqual([]);
    expect(result.mapping.nb).toBe('insuranceHistory.claimsCount');
  });

  it('une question voisine en autre forme reste une autre question', () => {
    expect(findMatchingQuestion([{ id: 'alcool-texte', label: ALCOOL_APP, shape: { type: 'text' as const } }], { label: STUPEFIANT, shape: { type: 'boolean' } })).toBeNull();
  });
});

describe('schemaForInsurers : Oyat seul, Oyat + Zephir', () => {
  const q = (canonicalPath: string, label = canonicalPath) => ({ canonicalPath, label, type: 'text' as const, required: true });
  const discovered = (canonicalPath: string, insurerId: string) => ({
    ...q(canonicalPath),
    discoveredOn: [{ insurerId, origin: `https://${insurerId}`, fieldKey: canonicalPath, required: true }],
  });
  const schema = [
    { title: 'Souscripteur', questions: [q('client.lastName'), q('client.email')] },
    { title: 'Véhicule', questions: [q('vehicle.brand'), q('vehicle.registration')] },
    { title: 'Conducteur', questions: [q('driver.lastName'), q('driver.profession')] },
    {
      title: 'Questions des assureurs',
      discovered: true,
      questions: [discovered('extra.civilite', 'oyat'), discovered('extra.titulaire_carte_grise', 'zephir'), { ...discovered('extra.remorque', 'oyat'), discoveredOn: [...discovered('extra.remorque', 'oyat').discoveredOn, ...discovered('extra.remorque', 'zephir').discoveredOn] }],
    },
  ] as QuestionnaireSection[];
  const oyat = { id: 'oyat', questions: { auto: ['client.email', 'vehicle.registration', 'driver.lastName', 'driver.profession'] } };
  const zephir = { id: 'zephir', questions: { auto: ['client.lastName', 'vehicle.brand', 'vehicle.registration', 'driver.lastName'] } };
  const paths = (sections: QuestionnaireSection[]) => sections.flatMap(section => section.questions.map(question => question.canonicalPath));

  it('Oyat seul : seulement les questions d’Oyat', () => {
    expect(paths(schemaForInsurers(schema, [oyat], 'auto'))).toEqual([
      'client.email', 'vehicle.registration', 'driver.lastName', 'driver.profession', 'extra.civilite', 'extra.remorque',
    ]);
  });

  it('Oyat + Zephir : les questions des deux, chacune une seule fois', () => {
    const result = paths(schemaForInsurers(schema, [oyat, zephir], 'auto'));
    expect(result).toEqual([
      'client.lastName', 'client.email', 'vehicle.brand', 'vehicle.registration', 'driver.lastName', 'driver.profession',
      'extra.civilite', 'extra.titulaire_carte_grise', 'extra.remorque',
    ]);
    expect(new Set(result).size).toBe(result.length);
  });
});
