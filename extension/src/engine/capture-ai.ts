import { AI_MASK as MASK, CAPTURE_SYSTEM_PROMPT, type CanonicalData } from '@shared';
import type { CapturedOffer } from '../shared/messages';
import type { AiRequest, AskAi } from './ai-fallback';
import { parseAmounts } from './capture';
import { sanitizeOffer } from './offer';

/**
 * Repli sur l'IA pour lire l'offre quand le DOM n'a pas suffi (E10-2). L'IA reçoit le texte de la page de résultat
 * EXPURGÉ des données du client : toutes les valeurs du dossier (nom, adresse, immatriculation, dates…) et tout ce qui
 * ressemble à un email, un téléphone, une plaque ou un IBAN sont masqués. Sa réponse est contrôlée : un montant qui
 * n'apparaît pas sur la page est écarté (l'IA ne doit rien inventer).
 */

/** Plafond du texte envoyé à l'IA. */
const MAX_PAGE_CHARS = 12_000;
/** Contexte gardé autour de chaque montant (avant / après) quand la page en contient. */
const AMOUNT_CONTEXT_CHARS = 300;

export { CAPTURE_SYSTEM_PROMPT } from '@shared';

/** Variantes accentuées de chaque lettre : une valeur du dossier est masquée quelle que soit son écriture. */
const ACCENTS: Record<string, string> = {
  a: 'aàâäáãå',
  c: 'cç',
  e: 'eéèêë',
  i: 'iîïíì',
  n: 'nñ',
  o: 'oôöóòõ',
  u: 'uùûüú',
  y: 'yÿý',
};

/** Motif d'une valeur du dossier : sans casse ni accents, séparateurs libres (« AB-123-CD » ↔ « ab 123 cd » ↔ « AB123CD »). */
function looseValuePattern(value: string): string | null {
  const runs = value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().match(/[a-z]+|\d+/g);
  if (!runs) return null;
  const letters = (run: string) => [...run].map(char => (ACCENTS[char] ? `[${ACCENTS[char]}]` : char)).join('');
  return runs.map(letters).join("[\\s\\-'’.,/]*");
}

/** Écritures d'une date du dossier sur une page : 2019-05-01, 01/05/2019, 01-05-2019, 01.05.2019. */
function dateForms(iso: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return [];
  const [, y, m, d] = match;
  return [iso, `${d}/${m}/${y}`, `${d}-${m}-${y}`, `${d}.${m}.${y}`];
}

const MONTHS = 'janv(?:ier|\\.)?|f[ée]vr?(?:ier|\\.)?|mars|avr(?:il|\\.)?|mai|juin|juil(?:let|\\.)?|ao[uû]t|sept(?:embre|\\.)?|oct(?:obre|\\.)?|nov(?:embre|\\.)?|d[ée]c(?:embre|\\.)?';

/** Formats reconnaissables de données personnelles, masqués quel que soit le dossier. */
const PERSONAL_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // email
  /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{4}){2,7}(?:[\s-]?[A-Z0-9]{1,3})?\b/g, // IBAN
  /\b[12][\s.]?\d{2}[\s.]?(?:0[1-9]|1[0-2]|[2-9]\d)[\s.]?(?:\d{2}|2[AB])[\s.]?\d{3}[\s.]?\d{3}(?:[\s.]?\d{2})?\b/gi, // NIR (sécurité sociale)
  /(?:(?:\+|00)33[\s.-]?(?:\(0\)[\s.-]?)?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g, // téléphone français
  /\b[A-Z]{2}[\s-]?\d{3}[\s-]?[A-Z]{2}\b/g, // plaque d'immatriculation (SIV)
  /\b\d{1,4}[\s-]?[A-Z]{1,3}[\s-]?(?:\d{2}|2[AB])\b(?=\s|$|[,.;])/g, // plaque ancien format (FNI : 1234 AB 75)
  /\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}\b/g, // date jj/mm/aaaa
  /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g, // date ISO
  new RegExp(`\\b(?:1er|0?[1-9]|[12]\\d|3[01])\\s+(?:${MONTHS})\\s+(?:19|20)\\d{2}\\b`, 'gi'), // date en toutes lettres
  // Code postal suivi d'une ville (« 75008 Paris », « 69003 LYON 3e ») ; jamais un montant (« 15000 EUR »).
  /\b(?:F-)?\d{5}\s+(?!(?:EUR|EUROS?|€)\b)[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:[\s-](?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]*|\d{1,2}(?:e|er|ème)?|(?:sur|sous|en|le|la|les|de|du|des|d'|l')\b))*/g,
];

/**
 * Retire du texte les données du client : toutes les valeurs du dossier (sans casse ni accents, séparateurs libres),
 * puis les formats reconnaissables (email, téléphone, IBAN, NIR, plaques, dates, code postal + ville).
 */
export function redactClientData(text: string, quoteData: CanonicalData): string {
  const values = new Set<string>();
  for (const value of Object.values(quoteData)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length < 3) continue;
    values.add(trimmed);
    dateForms(trimmed).forEach(form => values.add(form));
  }
  let redacted = text;
  // Les plus longues d'abord (« 1 rue de la Paix » avant « Paix »).
  for (const value of [...values].sort((a, b) => b.length - a.length)) {
    const pattern = looseValuePattern(value);
    if (!pattern) continue;
    // Pas au milieu d'un mot (« Paix » ne masque pas « Paixon ») ; \p{L} pour les lettres accentuées.
    redacted = redacted.replace(new RegExp(`(?<![\\p{L}\\d])${pattern}(?![\\p{L}\\d])`, 'giu'), MASK);
  }
  for (const pattern of PERSONAL_PATTERNS) redacted = redacted.replace(pattern, MASK);
  return redacted;
}

/**
 * Ne garde que les passages autour des montants (là où se trouvent prime, franchises et plafonds), séparés par « … ».
 * Sans montant, le début du texte. Le résultat est toujours plafonné.
 */
export function amountRegions(text: string, context = AMOUNT_CONTEXT_CHARS, max = MAX_PAGE_CHARS): string {
  const amounts = parseAmounts(text);
  if (amounts.length === 0) return text.slice(0, max);
  const ranges: [number, number][] = [];
  for (const { index, end } of amounts) {
    const from = Math.max(0, index - context);
    const to = Math.min(text.length, end + context);
    const last = ranges[ranges.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else ranges.push([from, to]);
  }
  return ranges
    .map(([from, to]) => text.slice(from, to).trim())
    .join('\n…\n')
    .slice(0, max);
}

export function buildCaptureRequest(pageText: string, quoteData: CanonicalData): AiRequest {
  return {
    purpose: 'capture',
    system: CAPTURE_SYSTEM_PROMPT,
    // Masquage sur la page entière (une valeur à cheval sur deux extraits reste masquée), puis extraits.
    messages: [{ role: 'user', content: amountRegions(redactClientData(pageText, quoteData)) }],
    maxTokens: 2000,
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Offre lue par l'IA, contrôlée : types et longueurs (voir `sanitizeOffer`), et chaque montant doit figurer sur la page.
 * `null` si la réponse est inutilisable ou si l'IA estime que ce n'est pas une page de résultat.
 */
export function parseCaptureResponse(text: string, pageText: string): CapturedOffer | null {
  const json = extractJson(text);
  if (!json || json['isResultPage'] === false) return null;
  const onPage = parseAmounts(pageText).map(a => a.value);
  const seen = (value: number | null) => (value !== null && onPage.some(v => Math.abs(v - value) < 0.005) ? value : null);

  const offer = sanitizeOffer({
    ...json,
    deductibles: typeof json['generalDeductible'] === 'number' ? { general: json['generalDeductible'] } : {},
  });
  return {
    ...offer,
    premiumAnnual: seen(offer.premiumAnnual),
    premiumMonthly: seen(offer.premiumMonthly),
    deductibles: Object.fromEntries(Object.entries(offer.deductibles).filter(([, v]) => seen(v) !== null)),
    guarantees: offer.guarantees.map(g => ({ ...g, limit: seen(g.limit), deductible: seen(g.deductible) })),
    // Le numéro de devis doit lui aussi figurer sur la page.
    quoteNumber: offer.quoteNumber && pageText.includes(offer.quoteNumber) ? offer.quoteNumber : null,
  };
}

/** Complète l'offre du DOM avec celle de l'IA : ce que le DOM a lu prime toujours. */
export function mergeOffers(dom: CapturedOffer, ai: CapturedOffer): CapturedOffer {
  return {
    quoteNumber: dom.quoteNumber ?? ai.quoteNumber,
    premiumAnnual: dom.premiumAnnual ?? ai.premiumAnnual,
    premiumMonthly: dom.premiumMonthly ?? ai.premiumMonthly,
    deductibles: { ...ai.deductibles, ...dom.deductibles },
    guarantees: dom.guarantees.length ? dom.guarantees : ai.guarantees,
    exclusions: dom.exclusions.length ? dom.exclusions : ai.exclusions,
  };
}

/** Demande l'offre à l'IA. Renvoie `null` (sans lever) si l'appel échoue ou si la réponse est inutilisable. */
export async function captureWithAi(
  pageText: string,
  quoteData: CanonicalData,
  ask: AskAi,
): Promise<{ offer: CapturedOffer | null; failure: 'ai_unavailable' | 'ai_unusable' | null }> {
  let answer: string;
  try {
    answer = await ask(buildCaptureRequest(pageText, quoteData));
  } catch {
    return { offer: null, failure: 'ai_unavailable' };
  }
  const offer = parseCaptureResponse(answer, pageText);
  return { offer, failure: offer ? null : 'ai_unusable' };
}
