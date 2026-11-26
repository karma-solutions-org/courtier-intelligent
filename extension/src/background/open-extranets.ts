import type { ExtensionUser, OpenExtranetsResponse } from '../shared/messages';
import { loadInsurers } from './jobs-service';
import { insurersForOrigin, InsurerInfo, JobRef, MatchOptions } from './origin-match';
import { pinJob } from './tab-jobs';

/** Au plus autant d'extranets ouverts d'un coup (un dossier n'en compte que quelques-uns). */
export const MAX_EXTRANETS_PER_REQUEST = 20;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const OPEN_MESSAGES = {
  signedOut: "Connectez l'extension pour tarifer sur tous les extranets.",
  invalid: 'Demande invalide.',
  generic: "L'extension n'a pas pu ouvrir les extranets. Ouvrez-les un par un avec « Ouvrir l'extranet ».",
} as const;

/**
 * Extranets à ouvrir pour une demande de l'app : seulement des adresses d'extranets du catalogue, chacune celle de
 * l'assureur annoncé (jamais une page quelconque, même si l'app était compromise). Un assureur n'est ouvert qu'une fois.
 */
export function extranetsToOpen(
  request: { dossierId?: unknown; extranets?: unknown },
  insurers: InsurerInfo[],
  options: MatchOptions = {},
): { dossierId: string; accepted: (JobRef & { url: string })[]; refused: string[] } | null {
  const { dossierId, extranets } = request;
  if (typeof dossierId !== 'string' || !ID_PATTERN.test(dossierId)) return null;
  if (!Array.isArray(extranets) || extranets.length === 0 || extranets.length > MAX_EXTRANETS_PER_REQUEST) return null;
  const accepted: (JobRef & { url: string })[] = [];
  const refused: string[] = [];
  for (const entry of extranets as { insurerId?: unknown; url?: unknown }[]) {
    const insurerId = entry?.insurerId;
    if (typeof insurerId !== 'string' || !ID_PATTERN.test(insurerId)) return null;
    if (accepted.some(a => a.insurerId === insurerId) || refused.includes(insurerId)) continue;
    let url: URL | null = null;
    try {
      url = typeof entry.url === 'string' ? new URL(entry.url) : null;
    } catch {
      url = null;
    }
    const known = !!url && insurersForOrigin(url.href, insurers, options).some(insurer => insurer.id === insurerId);
    if (known) accepted.push({ dossierId, insurerId, url: url!.href });
    else refused.push(insurerId);
  }
  return { dossierId, accepted, refused };
}

/**
 * Ouvre les extranets en arrière-plan (l'app reste affichée, avec l'avancement de chaque assureur) et épingle chaque
 * onglet à son job : il remplit ce dossier-là, jamais celui d'un autre client tarifé chez le même assureur.
 */
export async function openExtranets(user: ExtensionUser | null, request: { dossierId?: unknown; extranets?: unknown }): Promise<OpenExtranetsResponse> {
  if (!user) return { type: 'OPEN_FAILED', message: OPEN_MESSAGES.signedOut };
  try {
    const plan = extranetsToOpen(request, await loadInsurers());
    if (!plan) return { type: 'OPEN_FAILED', message: OPEN_MESSAGES.invalid };
    const opened: string[] = [];
    for (const extranet of plan.accepted) {
      const tab = await chrome.tabs.create({ url: extranet.url, active: false });
      if (tab.id === undefined) continue;
      await pinJob(tab.id, { dossierId: extranet.dossierId, insurerId: extranet.insurerId });
      opened.push(extranet.insurerId);
    }
    return { type: 'EXTRANETS_OPENED', opened, refused: plan.refused };
  } catch {
    return { type: 'OPEN_FAILED', message: OPEN_MESSAGES.generic };
  }
}
