import type { CapturedOffer } from '../shared/messages';

/** Offre capturée sur un extranet : contrôles communs au content script, à l'IA et au service worker (sans DOM). */

const MAX_AMOUNT = 10_000_000;
const MAX_GUARANTEES = 60;
const MAX_EXCLUSIONS = 30;
const MAX_TEXT = 300;

export const hasPremium = (offer: CapturedOffer | null | undefined): boolean =>
  !!offer && (offer.premiumAnnual !== null || offer.premiumMonthly !== null);

// ── Contrôle d'une offre (avant écriture, ou reçue de l'IA) ─────────────────

const amountOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT ? Math.round(value * 100) / 100 : null;
const textOrNull = (value: unknown, max = MAX_TEXT): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text === '' ? null : text;
};

/** Offre nettoyée : types, bornes et longueurs contrôlés. Tout ce qui ne convient pas est retiré (jamais remplacé). */
export function sanitizeOffer(raw: unknown): CapturedOffer {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const deductibles: Record<string, number> = {};
  if (typeof o['deductibles'] === 'object' && o['deductibles'] !== null) {
    for (const [key, value] of Object.entries(o['deductibles'] as Record<string, unknown>).slice(0, 20)) {
      const amount = amountOrNull(value);
      if (amount !== null && /^[a-z0-9_]{1,40}$/i.test(key)) deductibles[key] = amount;
    }
  }
  const guarantees = Array.isArray(o['guarantees'])
    ? (o['guarantees'] as Record<string, unknown>[]).flatMap(g => {
        const label = textOrNull(g?.['label']);
        return label && typeof g['included'] === 'boolean'
          ? [{ label, included: g['included'] as boolean, limit: amountOrNull(g['limit']), deductible: amountOrNull(g['deductible']) }]
          : [];
      })
    : [];
  const exclusions = Array.isArray(o['exclusions']) ? (o['exclusions'] as unknown[]).map(e => textOrNull(e)).filter((e): e is string => e !== null) : [];
  const quoteNumber = textOrNull(o['quoteNumber'], 60);
  return {
    quoteNumber: quoteNumber && /^[\p{L}0-9\-/_. ]+$/u.test(quoteNumber) ? quoteNumber : null,
    premiumAnnual: amountOrNull(o['premiumAnnual']),
    premiumMonthly: amountOrNull(o['premiumMonthly']),
    deductibles,
    guarantees: guarantees.slice(0, MAX_GUARANTEES),
    exclusions: exclusions.slice(0, MAX_EXCLUSIONS),
  };
}
