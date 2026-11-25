import { reusableAnswers, type Question, type QuestionnaireSection } from '@shared';
import { describe, expect, it } from 'vitest';

/** Reprise du dernier dossier du client (phase 2, lot C) : ce qui est repris, et ce qui reste « à vérifier ». */

const q = (canonicalPath: string, extra: Partial<Question> = {}): Question =>
  ({ canonicalPath, label: canonicalPath, type: 'text', required: true, ...extra }) as Question;

const SCHEMA: QuestionnaireSection[] = [
  { title: 'Client', questions: [q('client.lastName')] },
  {
    title: 'Véhicule',
    questions: [
      q('vehicle.brand'),
      q('vehicle.usage', { type: 'choice', choices: [{ value: 'prive', label: 'Privé' }] }),
    ],
  },
  { title: 'Conducteur', questions: [q('driver.licenseDate', { type: 'date' })] },
  {
    title: 'Antécédents',
    questions: [
      q('insuranceHistory.previousInsurer'),
      q('insuranceHistory.bonusMalus', { type: 'number', withKnowledge: true }),
    ],
  },
];

describe('Reprise du dernier dossier du client', () => {
  it('reprend véhicule, conducteur et antécédents, pas le client ; les antécédents sont à vérifier', () => {
    const { data, toVerify } = reusableAnswers(SCHEMA, {
      'client.lastName': 'Ancien nom',
      'vehicle.brand': 'Peugeot',
      'driver.licenseDate': '2010-05-01',
      'insuranceHistory.previousInsurer': 'MAAF',
      'insuranceHistory.bonusMalus': { value: 0.85, knowledge: 'KNOWN' },
    } as never);

    expect(data).toEqual({
      'vehicle.brand': 'Peugeot',
      'driver.licenseDate': '2010-05-01',
      'insuranceHistory.previousInsurer': 'MAAF',
      'insuranceHistory.bonusMalus': { value: 0.85, knowledge: 'KNOWN' },
    });
    expect(toVerify).toEqual(['insuranceHistory.previousInsurer', 'insuranceHistory.bonusMalus']);
  });

  it("ignore les réponses vides, hors questionnaire ou devenues invalides", () => {
    const { data, toVerify } = reusableAnswers(SCHEMA, {
      'vehicle.brand': '',
      'vehicle.usage': 'choix-retire',
      'vehicle.model': 'Clio',
      'driver.licenseDate': null,
      'insuranceHistory.bonusMalus': { value: 9, knowledge: 'KNOWN' },
    } as never);

    expect(data).toEqual({});
    expect(toVerify).toEqual([]);
  });
});
