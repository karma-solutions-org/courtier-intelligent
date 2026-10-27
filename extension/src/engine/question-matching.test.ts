import { applySighting, buildJobQuoteData, findMatchingQuestion, labelSimilarity, learnInsurerQuestions, mergeDiscoveredFields, mergeDuplicateQuestions, questionTypeOf, sameAnswerShape, schemaForCabinet, schemaForInsurers, type DiscoveredFieldInput, type Question, type QuestionnaireSection } from '@shared';
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

describe('Questionnaire tenu à jour par les parcours', () => {
  const ORIGIN = 'https://extranet.oyat-assurances.fr';
  const catalog: QuestionnaireSection = {
    title: 'Conducteur',
    questions: [
      { canonicalPath: 'driver.profession', label: 'Profession', type: 'text', required: true },
      { canonicalPath: 'insuranceHistory.claimsCount', label: 'Sinistres déclarés sur les 36 derniers mois', type: 'number', required: true },
    ],
  };
  const extra = (canonicalPath: string, label: string, more: Partial<Question> = {}): Question => ({
    canonicalPath: canonicalPath as Question['canonicalPath'],
    label,
    type: 'text',
    required: true,
    discoveredOn: [{ insurerId: 'oyat', origin: ORIGIN, fieldKey: `text:${canonicalPath.slice(6)}`, required: true }],
    ...more,
  });
  const discovered = (...questions: Question[]): QuestionnaireSection => ({ title: 'Questions des assureurs', discovered: true, questions });
  const paths = (sections: QuestionnaireSection[]) => sections.flatMap(section => section.questions.map(q => q.canonicalPath));

  it('les doublons du catalogue sont fusionnés et ne sont plus posés', () => {
    const schema = [
      catalog,
      discovered(
        extra('extra.profession', 'Profession'),
        extra('extra.nombres_sinistres', 'Nombres de sinistres survenus sur les 36 derniers mois'),
        extra('extra.remorque', 'Possédez-vous une remorque de plus de 500Kg ?'),
      ),
    ];
    const result = mergeDuplicateQuestions(schema);
    expect(result.changed).toBe(true);
    expect(result.schema[1].questions.map(q => q.mergedInto ?? null)).toEqual(['driver.profession', 'insuranceHistory.claimsCount', null]);
    expect(paths(schemaForCabinet(result.schema, ['oyat']))).toEqual(['driver.profession', 'insuranceHistory.claimsCount', 'extra.remorque']);
    expect(mergeDuplicateQuestions(result.schema).changed).toBe(false);
  });

  it('une liste que l’extranet impose (keepSeparate) n’est jamais fusionnée', () => {
    const choices = [{ value: '104', label: 'Salarié Sédentaire' }, { value: '105', label: 'Artisan' }];
    const schema = [catalog, discovered(extra('extra.profession', 'Profession', { type: 'choice', choices, keepSeparate: true }))];
    expect(mergeDuplicateQuestions(schema).changed).toBe(false);
  });

  it('un champ dont l’extranet refuse la réponse du catalogue reste à part (needsChoice)', () => {
    const field: DiscoveredFieldInput = {
      fieldKey: 'select:oprofession',
      label: 'Profession',
      kind: 'select',
      inputType: 'select',
      name: null,
      section: null,
      required: true,
      needsChoice: true,
      options: [{ value: '104', label: 'Salarié Sédentaire' }, { value: '105', label: 'Artisan' }],
    };
    const result = mergeDiscoveredFields([catalog], [field], { insurerId: 'oyat', origin: ORIGIN });
    expect(result.added).toHaveLength(1);
    expect(result.added[0].keepSeparate).toBe(true);
  });

  it('la réponse de la question du catalogue remplit le champ de la question fusionnée', () => {
    const schema = mergeDuplicateQuestions([catalog, discovered(extra('extra.profession', 'Profession'))]).schema;
    expect(buildJobQuoteData(schema, { 'driver.profession': 'Enseignant' })['extra.profession']).toBe('Enseignant');
    expect(buildJobQuoteData(schema, { 'extra.profession': 'Ancienne réponse' })['extra.profession']).toBe('Ancienne réponse');
  });

  it('constat : forme réelle du champ, exigence actuelle et assureur retrouvé', () => {
    const schema = [
      discovered(extra('extra.utilisation_professionnelle', 'Utilisation Professionnelle du véhicule ?'), {
        ...extra('extra.immatriculation_nom_devis', 'Immatriculation ou nom, n° devis'),
        discoveredOn: [{ insurerId: null, origin: ORIGIN, fieldKey: 'text:immatriculation_nom_devis', required: true }],
      }),
    ];
    const result = applySighting(
      schema,
      [
        {
          fieldKey: 'text:utilisation_professionnelle',
          label: 'Utilisation Professionnelle du véhicule ?',
          kind: 'radio',
          inputType: 'radio',
          required: true,
          options: [{ value: '1', label: 'Oui' }, { value: '0', label: 'Non' }],
        },
        { fieldKey: 'text:immatriculation_nom_devis', label: 'Immatriculation ou nom, n° devis', kind: 'text', inputType: 'text', required: false, options: [] },
      ],
      ORIGIN,
      'oyat',
    );
    const [usage, devis] = result.schema[0].questions;
    expect(usage.type).toBe('boolean');
    expect(devis.discoveredOn?.[0]).toMatchObject({ insurerId: 'oyat', required: false });
    // Facultatif sur Oyat : il ne bloque plus un dossier Oyat.
    expect(schemaForCabinet(result.schema, ['oyat'])[0].questions[1].required).toBe(false);
  });

  it('questions apprises : chemins remplis et questions découvertes, ajoutées sans jamais en retirer', () => {
    const schema = mergeDuplicateQuestions([catalog, discovered(extra('extra.profession', 'Profession'), extra('extra.remorque', 'Remorque'))]).schema;
    const first = learnInsurerQuestions(
      schema,
      undefined,
      [
        { fieldKey: 'text:remorque', label: 'Remorque', options: [] },
        { fieldKey: 'text:profession', label: 'Profession', options: [] },
        { fieldKey: 'number:nb', label: 'Sinistres', options: [], canonicalPath: 'insuranceHistory.claimsCount' },
        { fieldKey: 'text:inconnu', label: 'Inconnu', options: [], canonicalPath: 'vehicle.brand' },
      ],
      ORIGIN,
    );
    expect(first.questions).toEqual(['driver.profession', 'insuranceHistory.claimsCount', 'extra.remorque']);
    expect(learnInsurerQuestions(schema, first.questions, [], ORIGIN)).toEqual({ questions: first.questions, changed: false });
  });

  it('Oyat + Zephir : listes apprises réunies, chaque question une seule fois', () => {
    const schema: QuestionnaireSection[] = [
      {
        title: 'Q',
        questions: ['client.email', 'vehicle.brand', 'driver.lastName', 'vehicle.usage'].map(p => ({ canonicalPath: p as Question['canonicalPath'], label: p, type: 'text' as const, required: true })),
      },
    ];
    const learned = { oyat: ['client.email', 'driver.lastName'], zephir: ['vehicle.brand', 'driver.lastName'] };
    expect(paths(schemaForInsurers(schema, [{ id: 'oyat' }], 'auto', learned))).toEqual(['client.email', 'driver.lastName']);
    expect(paths(schemaForInsurers(schema, [{ id: 'oyat' }, { id: 'zephir' }], 'auto', learned))).toEqual(['client.email', 'vehicle.brand', 'driver.lastName']);
  });
});
