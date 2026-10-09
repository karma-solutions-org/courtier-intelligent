import type { CanonicalData } from '@shared';
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

const MAX_PAGE_CHARS = 20_000;
const MASK = '[masqué]';

const SYSTEM_PROMPT =
  "Tu lis le texte de la page de résultat d'un extranet d'assurance auto, après que le courtier a demandé un tarif. " +
  'Extrais l’offre affichée. Réponds UNIQUEMENT par un objet JSON de la forme ' +
  '{"isResultPage":true|false,"quoteNumber":string|null,"premiumAnnual":number|null,"premiumMonthly":number|null,' +
  '"generalDeductible":number|null,"guarantees":[{"label":string,"included":true|false,"limit":number|null,"deductible":number|null}],' +
  '"exclusions":[string]}. Montants en euros, sous forme de nombres (640.5, pas "640,50 €"). ' +
  "N'invente rien : une information absente de la page vaut null (ou n'apparaît pas dans les listes). " +
  "Une prime dont la périodicité (annuelle ou mensuelle) n'est pas indiquée vaut null. " +
  `Les passages "${MASK}" sont des données personnelles retirées : ignore-les. Aucun texte hors du JSON.`;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Écritures d'une date du dossier sur une page : 2019-05-01, 01/05/2019, 01-05-2019, 01.05.2019. */
function dateForms(iso: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return [];
  const [, y, m, d] = match;
  return [iso, `${d}/${m}/${y}`, `${d}-${m}-${y}`, `${d}.${m}.${y}`];
}

/** Retire du texte les données du client : valeurs du dossier, puis formats reconnaissables. */
export function redactClientData(text: string, quoteData: CanonicalData): string {
  const values = new Set<string>();
  for (const value of Object.values(quoteData)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length < 3) continue;
    values.add(trimmed);
    dateForms(trimmed).forEach(form => values.add(form));
    // Une immatriculation peut s'écrire avec ou sans tirets.
    if (/^[A-Z]{2}-?\d{3}-?[A-Z]{2}$/i.test(trimmed)) values.add(trimmed.replace(/-/g, ''));
  }
  let redacted = text;
  // Les plus longues d'abord (« 1 rue de la Paix » avant « Paix »).
  for (const value of [...values].sort((a, b) => b.length - a.length)) {
    redacted = redacted.replace(new RegExp(escape(value).replace(/\s+/g, '\\s+'), 'gi'), MASK);
  }
  return redacted
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, MASK) // email
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/g, MASK) // IBAN
    .replace(/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}\b/g, MASK) // téléphone
    .replace(/\b[A-Z]{2}[\s-]?\d{3}[\s-]?[A-Z]{2}\b/g, MASK); // plaque d'immatriculation
}

export function buildCaptureRequest(pageText: string, quoteData: CanonicalData): AiRequest {
  return {
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: redactClientData(pageText, quoteData).slice(0, MAX_PAGE_CHARS) }],
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
