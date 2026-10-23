import type { CanonicalData, ExtensionReportIssue } from '@shared';
import type { CapturedOffer, CaptureState } from '../../shared/messages';
import type { AskAi } from '../ai-fallback';
import type { FormField } from '../analyzer';
import { hasPremium } from '../capture';
import { captureWithAi, mergeOffers } from '../capture-ai';
import { mapFields } from '../mapping';

/** Champs que le dossier peut remplir : une page de résultat n'en a presque pas. */
export function fillableCount(fields: FormField[]): number {
  return mapFields(fields).filter(m => m.status === 'mapped' && m.canonicalPath !== null).length;
}

/** L'offre lue dans le DOM manque-t-elle la prime ou les garanties (l'IA complète alors) ? */
export function needsAiCompletion(offer: CapturedOffer): boolean {
  return !hasPremium(offer) || offer.guarantees.length === 0;
}

/** Demande à l'IA ce qui manque à l'offre lue dans le DOM (prime introuvable, garanties absentes). */
export async function completeWithAi(
  offer: CapturedOffer,
  pageText: string,
  quoteData: CanonicalData,
  askAi: AskAi,
): Promise<{ offer: CapturedOffer; source: CaptureState['source']; failure: ExtensionReportIssue | null }> {
  const ai = await captureWithAi(pageText, quoteData, askAi);
  if (!ai.offer) return { offer, source: 'dom', failure: ai.failure };
  const merged = mergeOffers(offer, ai.offer);
  return { offer: merged, source: JSON.stringify(merged) !== JSON.stringify(offer) ? 'ai' : 'dom', failure: ai.failure };
}
