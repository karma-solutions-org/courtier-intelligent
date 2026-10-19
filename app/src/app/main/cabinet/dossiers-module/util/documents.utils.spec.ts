import { OcrField } from '@shared';
import { defaultOcrSelection, formatOcrValue, needsConfirmation, selectedOcrAnswers } from './documents.utils';

const fields: OcrField[] = [
  { canonicalPath: 'vehicle.registration', value: 'AB-123-CD', confidence: 0.95 },
  { canonicalPath: 'vehicle.brand', value: 'Renault', confidence: 0.8 },
  { canonicalPath: 'vehicle.fiscalPower', value: 7, confidence: 0.79 },
];

describe('pré-remplissage depuis un document', () => {
  it('décoche par défaut les valeurs sous le seuil de confiance, « à confirmer »', () => {
    expect(needsConfirmation(fields[2])).toBe(true);
    expect(needsConfirmation(fields[1])).toBe(false);
    expect(defaultOcrSelection(fields)).toEqual({ 'vehicle.registration': true, 'vehicle.brand': true, 'vehicle.fiscalPower': false });
  });

  it("n'applique que les valeurs cochées", () => {
    const selection = { ...defaultOcrSelection(fields), 'vehicle.brand': false, 'vehicle.fiscalPower': true };
    expect(selectedOcrAnswers(fields, selection)).toEqual({ 'vehicle.registration': 'AB-123-CD', 'vehicle.fiscalPower': 7 });
    expect(selectedOcrAnswers(fields, {})).toEqual({});
  });

  it('affiche les valeurs lisiblement', () => {
    expect(formatOcrValue({ value: 0.85, knowledge: 'KNOWN' })).toBe('0.85');
    expect(formatOcrValue(true)).toBe('Oui');
    expect(formatOcrValue(null)).toBe('—');
  });
});
