import type { CanonicalData } from '@shared';
import { describe, expect, it, vi } from 'vitest';
import { AskAi } from './ai-fallback';
import { buildCaptureRequest, captureWithAi, mergeOffers, parseCaptureResponse, redactClientData } from './capture-ai';

const QUOTE_DATA: CanonicalData = {
  'client.lastName': 'Dupont',
  'client.firstName': 'Jean',
  'client.birthDate': '1985-03-12',
  'client.email': 'jean@example.fr',
  'client.address.street': '1 rue de la Paix',
  'vehicle.registration': 'AB-123-CD',
  'vehicle.fiscalPower': 5,
};

const PAGE = 'Votre devis n° DEV-77 pour Jean Dupont, né le 12/03/1985, 1 rue de la  Paix. Véhicule AB123CD. Tél. 06 12 34 56 78, contact : jean@example.fr. Formule à 712 € par an, ou 61,20 € par mois. Franchise 300 €.';

const EMPTY = { quoteNumber: null, premiumAnnual: null, premiumMonthly: null, deductibles: {}, guarantees: [], exclusions: [] };

describe('redactClientData', () => {
  it('masque les valeurs du dossier (dates au format de la page, plaque sans tirets) et les coordonnées', () => {
    const redacted = redactClientData(PAGE, QUOTE_DATA);
    for (const secret of ['Dupont', 'Jean', '12/03/1985', 'rue de la', 'AB123CD', '06 12 34 56 78', 'jean@example.fr']) {
      expect(redacted).not.toContain(secret);
    }
  });

  it('garde les montants et le numéro de devis (ce qu’il faut lire)', () => {
    const redacted = redactClientData(PAGE, QUOTE_DATA);
    expect(redacted).toContain('712 €');
    expect(redacted).toContain('61,20 €');
    expect(redacted).toContain('DEV-77');
  });

  it('la requête envoyée à l’IA ne contient que la page expurgée', () => {
    const request = buildCaptureRequest(PAGE, QUOTE_DATA);
    expect(request.messages[0].content).not.toContain('Dupont');
    expect(request.system).toContain('N\'invente rien');
  });
});

describe('parseCaptureResponse', () => {
  const answer = (offer: Record<string, unknown>) => `\`\`\`json\n${JSON.stringify({ isResultPage: true, ...offer })}\n\`\`\``;

  it('accepte les montants présents sur la page', () => {
    const offer = parseCaptureResponse(
      answer({ quoteNumber: 'DEV-77', premiumAnnual: 712, premiumMonthly: 61.2, generalDeductible: 300, guarantees: [{ label: 'Vol', included: true, limit: null, deductible: 300 }], exclusions: [] }),
      PAGE,
    );
    expect(offer).toEqual({
      quoteNumber: 'DEV-77',
      premiumAnnual: 712,
      premiumMonthly: 61.2,
      deductibles: { general: 300 },
      guarantees: [{ label: 'Vol', included: true, limit: null, deductible: 300 }],
      exclusions: [],
    });
  });

  it('écarte un montant ou un numéro de devis inventés (absents de la page)', () => {
    const offer = parseCaptureResponse(answer({ quoteNumber: 'XYZ-1', premiumAnnual: 699, premiumMonthly: 61.2, guarantees: [{ label: 'Vol', included: true, limit: 5000, deductible: null }] }), PAGE);
    expect(offer).toMatchObject({ quoteNumber: null, premiumAnnual: null, premiumMonthly: 61.2 });
    expect(offer?.guarantees[0].limit).toBeNull();
  });

  it('rien quand l’IA dit que ce n’est pas une page de résultat, ou quand la réponse n’est pas du JSON', () => {
    expect(parseCaptureResponse('{"isResultPage":false}', PAGE)).toBeNull();
    expect(parseCaptureResponse('Je ne sais pas.', PAGE)).toBeNull();
  });
});

describe('mergeOffers', () => {
  it('ce que le DOM a lu prime, l’IA complète le reste', () => {
    const merged = mergeOffers(
      { ...EMPTY, premiumAnnual: 640, deductibles: { general: 300 } },
      { ...EMPTY, premiumAnnual: 999, premiumMonthly: 55, deductibles: { general: 999 }, guarantees: [{ label: 'Vol', included: true, limit: null, deductible: null }] },
    );
    expect(merged).toMatchObject({ premiumAnnual: 640, premiumMonthly: 55, deductibles: { general: 300 } });
    expect(merged.guarantees).toHaveLength(1);
  });
});

describe('captureWithAi', () => {
  it('signale une IA indisponible sans lever d’erreur', async () => {
    const ask = vi.fn<AskAi>(async () => {
      throw new Error('quota');
    });
    expect(await captureWithAi(PAGE, QUOTE_DATA, ask)).toEqual({ offer: null, failure: 'ai_unavailable' });
  });

  it('signale une réponse inutilisable', async () => {
    expect(await captureWithAi(PAGE, QUOTE_DATA, async () => 'pas de JSON')).toEqual({ offer: null, failure: 'ai_unusable' });
  });
});
