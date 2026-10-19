import { afterEach, describe, expect, it } from 'vitest';
import { mountAssureurA } from './__fixtures__/assureur-a';
import { RESULT_EMPTY, RESULT_LIST, RESULT_TABLE } from './__fixtures__/resultats';
import { analyzeForm } from './analyzer';
import { detectResultPage, extractFromDom, extractQuoteNumber, parseAmounts, sanitizeOffer } from './capture';
import { mapFields } from './mapping';

const mount = (html: string) => {
  document.body.innerHTML = html;
  return extractFromDom(document);
};

/** Champs de la page que l'extension saurait remplir avec le dossier. */
const fillable = () => mapFields(analyzeForm(document).fields).filter(m => m.status === 'mapped' && m.canonicalPath !== null).length;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('parseAmounts', () => {
  it('lit les montants en euros des formats courants', () => {
    expect(parseAmounts('642,30 € — 1 234,50 € — 1.234 € — € 53,20 — 640 EUR — 15 000 €').map(a => a.value)).toEqual([
      642.3, 1234.5, 1234, 53.2, 640, 15000,
    ]);
  });

  it('ignore les nombres sans devise (dates, numéros, puissance fiscale)', () => {
    expect(parseAmounts('Né le 12/03/1985, 5 CV, devis 2026-0042')).toEqual([]);
  });
});

describe('extractQuoteNumber', () => {
  it('reconnaît les tournures usuelles, et exige un chiffre', () => {
    expect(extractQuoteNumber('Devis n° DEV-2026-0042 · valable')).toBe('DEV-2026-0042');
    expect(extractQuoteNumber('Référence du devis : Q7781-B')).toBe('Q7781-B');
    expect(extractQuoteNumber('Numéro de proposition : 88123')).toBe('88123');
    expect(extractQuoteNumber('Devis n° gratuit')).toBeNull();
  });
});

describe('extractFromDom', () => {
  it('lit primes, numéro de devis, franchise générale, garanties et exclusions (tableau)', () => {
    const { offer, resultHeading } = mount(RESULT_TABLE);

    expect(resultHeading).toBe(true);
    expect(offer).toMatchObject({ quoteNumber: 'DEV-2026-0042', premiumAnnual: 642.3, premiumMonthly: 53.53, deductibles: { general: 300 } });
    expect(offer.guarantees).toEqual([
      { label: 'Responsabilité civile', included: true, limit: null, deductible: null },
      { label: 'Vol', included: true, limit: 15000, deductible: 300 },
      { label: 'Bris de glace', included: false, limit: null, deductible: 150 },
      { label: 'Assistance 0 km', included: true, limit: null, deductible: null },
    ]);
    expect(offer.exclusions).toEqual(['Conduite sans permis valide', 'Conduite sous l’emprise d’un état alcoolique']);
  });

  it('ne prend pour une prime ni une franchise, ni un plafond, ni des frais de dossier', () => {
    const { offer } = mount(RESULT_TABLE);
    expect([offer.premiumAnnual, offer.premiumMonthly]).not.toContain(300);
    expect([offer.premiumAnnual, offer.premiumMonthly]).not.toContain(25);
    expect([offer.premiumAnnual, offer.premiumMonthly]).not.toContain(15000);
  });

  it('lit une offre présentée en liste de définitions et en liste à puces', () => {
    const { offer } = mount(RESULT_LIST);

    expect(offer).toMatchObject({ quoteNumber: 'Q7781-B', premiumAnnual: 586.8, premiumMonthly: 48.9 });
    expect(offer.guarantees).toEqual([
      { label: 'Responsabilité civile', included: true, limit: null, deductible: null },
      { label: 'Incendie', included: true, limit: 20000, deductible: 250 },
      { label: 'Défense pénale', included: false, limit: null, deductible: null },
    ]);
  });

  it('n’invente rien : sans tarif affiché, primes nulles et listes vides', () => {
    const { offer } = mount(RESULT_EMPTY);
    expect(offer).toEqual({ quoteNumber: null, premiumAnnual: null, premiumMonthly: null, deductibles: {}, guarantees: [], exclusions: [] });
  });
});

describe('detectResultPage', () => {
  it('reconnaît la page de résultat, et la page probable dont aucune prime n’a été lue', () => {
    expect(detectResultPage(mount(RESULT_TABLE), fillable())).toBe('found');
    expect(detectResultPage(mount(RESULT_EMPTY), fillable())).toBe('likely');
  });

  it('une étape du formulaire n’est pas une page de résultat, même avec un prix affiché', () => {
    mountAssureurA(document);
    document.body.insertAdjacentHTML('afterbegin', '<h2>Votre tarif estimé</h2><p>Prime annuelle : 640 €</p>');
    expect(detectResultPage(extractFromDom(document), fillable())).toBe('none');
  });

  it('une page sans titre de résultat ni numéro de devis n’est pas retenue', () => {
    expect(detectResultPage(mount('<h1>Mon compte</h1><p>Dernier paiement : 53 € par mois</p>'), 0)).toBe('none');
  });
});

describe('sanitizeOffer', () => {
  it('écarte ce qui n’a pas le bon type ou dépasse les bornes, sans rien remplacer', () => {
    const offer = sanitizeOffer({
      quoteNumber: '<script>',
      premiumAnnual: -4,
      premiumMonthly: 53.531,
      deductibles: { general: 300, 'bad key!': 1, vol: 'x' },
      guarantees: [{ label: 'Vol', included: true, limit: 1e12, deductible: null }, { label: '', included: true }, { label: 'RC' }],
      exclusions: ['  Alcool  ', 42, ''],
    });
    expect(offer).toEqual({
      quoteNumber: null,
      premiumAnnual: null,
      premiumMonthly: 53.53,
      deductibles: { general: 300 },
      guarantees: [{ label: 'Vol', included: true, limit: null, deductible: null }],
      exclusions: ['Alcool'],
    });
  });
});
