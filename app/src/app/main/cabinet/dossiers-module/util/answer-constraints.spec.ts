import { answerConstraintError, latestPastDate, Question, validateAnswer } from '@shared';

/** Tests des bornes métier du questionnaire (`shared/answer-constraints.ts`), appliquées par `validateAnswer`. */
const question = (canonicalPath: string, type: Question['type'], withKnowledge = false): Question =>
  ({ canonicalPath, label: 'Champ', type, required: false, withKnowledge }) as Question;

const BONUS_MALUS = question('insuranceHistory.bonusMalus', 'number', true);
const CLAIMS = question('insuranceHistory.claimsCount', 'number', true);
const FISCAL_POWER = question('vehicle.fiscalPower', 'number');
const LICENSE_DATE = question('driver.licenseDate', 'date');
const CONTRACT_END = question('insuranceHistory.previousContractEndDate', 'date');
const CLAIM_DATE = question('insuranceHistory.claims.3.date', 'date');

/** Une date au format AAAA-MM-JJ, décalée de `days` jours. */
const isoDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('Bornes des réponses du questionnaire', () => {
  describe('nombres', () => {
    it('accepte un bonus-malus entre 0,50 et 3,50', () => {
      expect(validateAnswer(BONUS_MALUS, { value: 0.5, knowledge: 'KNOWN' })).toBeNull();
      expect(validateAnswer(BONUS_MALUS, { value: 1, knowledge: 'KNOWN' })).toBeNull();
      expect(validateAnswer(BONUS_MALUS, { value: 3.5, knowledge: 'KNOWN' })).toBeNull();
    });

    it('refuse un bonus-malus hors barème', () => {
      expect(validateAnswer(BONUS_MALUS, { value: 10, knowledge: 'KNOWN' })).toBe('« Champ » : 3,5 maximum.');
      expect(validateAnswer(BONUS_MALUS, { value: 0.3, knowledge: 'KNOWN' })).toBe('« Champ » : 0,5 minimum.');
    });

    it('refuse un nombre de sinistres négatif ou décimal', () => {
      expect(validateAnswer(CLAIMS, { value: -2, knowledge: 'KNOWN' })).toBe('« Champ » : 0 minimum.');
      expect(validateAnswer(CLAIMS, { value: 1.5, knowledge: 'KNOWN' })).toBe('« Champ » : nombre entier attendu.');
      expect(validateAnswer(CLAIMS, { value: 0, knowledge: 'KNOWN' })).toBeNull();
    });

    it("ne contrôle pas « le client ne sait pas » ni « à vérifier »", () => {
      expect(validateAnswer(CLAIMS, { value: null, knowledge: 'DECLARED_UNKNOWN' })).toBeNull();
      expect(validateAnswer(CLAIMS, { value: null, knowledge: 'UNKNOWN' })).toBeNull();
    });

    it('applique aussi les bornes à un nombre simple', () => {
      expect(validateAnswer(FISCAL_POWER, 0)).toBe('« Champ » : 1 minimum.');
      expect(validateAnswer(FISCAL_POWER, 7)).toBeNull();
    });
  });

  describe('dates', () => {
    it("accepte un permis obtenu aujourd'hui, refuse un permis futur", () => {
      expect(validateAnswer(LICENSE_DATE, isoDate(0))).toBeNull();
      expect(validateAnswer(LICENSE_DATE, isoDate(3))).toBe('« Champ » : la date ne peut pas être dans le futur.');
    });

    it('refuse une date avant 1900', () => {
      expect(validateAnswer(LICENSE_DATE, '1850-01-01')).toBe('« Champ » : date trop ancienne.');
    });

    it("accepte une échéance de contrat à venir", () => {
      expect(validateAnswer(CONTRACT_END, isoDate(200))).toBeNull();
    });

    it('applique la règle aux dates des sinistres détaillés', () => {
      expect(validateAnswer(CLAIM_DATE, isoDate(30))).toBe('« Champ » : la date ne peut pas être dans le futur.');
    });

    it("tolère la date du jour quel que soit le fuseau (serveur en UTC)", () => {
      const lateEveningUtc = Date.parse('2026-06-10T23:30:00Z');
      expect(latestPastDate(lateEveningUtc)).toBe('2026-06-11');
    });
  });

  it('ne signale rien sur un champ vide ni sur un champ sans bornes', () => {
    expect(answerConstraintError(CLAIMS, null)).toBeNull();
    expect(answerConstraintError(LICENSE_DATE, '')).toBeNull();
    expect(answerConstraintError(question('vehicle.brand', 'text'), 'Peugeot')).toBeNull();
  });
});
