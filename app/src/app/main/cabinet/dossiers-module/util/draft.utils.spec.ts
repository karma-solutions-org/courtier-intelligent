import { OcrField, QuestionnaireSection } from '@shared';
import { boundedSectionIndex, clientPieceAnswers, missingInSection } from './draft.utils';

describe('boundedSectionIndex', () => {
  it('borne la reprise au questionnaire', () => {
    expect(boundedSectionIndex(5, 3)).toBe(2);
    expect(boundedSectionIndex(1, 3)).toBe(1);
    expect(boundedSectionIndex(2, 0)).toBe(0);
  });
});

describe('missingInSection', () => {
  it('ne garde que les manques de la section affichée', () => {
    const sections = [{ questions: [{ canonicalPath: 'vehicle.brand' }] }] as unknown as QuestionnaireSection[];
    expect(missingInSection(sections, ['vehicle.brand', 'client.lastName'])).toEqual(['vehicle.brand']);
  });
});

describe('clientPieceAnswers', () => {
  const fields: OcrField[] = [
    { canonicalPath: 'vehicle.registration', value: 'AB-123-CD', confidence: 0.95 },
    { canonicalPath: 'vehicle.brand', value: 'Renault', confidence: 0.95 },
    { canonicalPath: 'vehicle.fiscalPower', value: 7, confidence: 0.5 },
  ];

  it('écrit seulement les valeurs sûres, dans les champs vides', () => {
    const paths = clientPieceAnswers(fields, { 'vehicle.brand': 'Peugeot' }).map((field) => field.canonicalPath);
    expect(paths).toEqual(['vehicle.registration']);
  });
});
