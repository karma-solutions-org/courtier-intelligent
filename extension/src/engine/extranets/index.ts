import type { ExtranetAdapter } from './adapter';
import { genericAdapter } from './generic';
import { EXTRANETS } from './registry';

export type { ExtranetAdapter, ExtranetDefinition, RepeatableTable } from './adapter';
export { genericAdapter } from './generic';
export { EXTRANETS } from './registry';

/** Le nom d'hôte de `origin` est-il `host` ou l'un de ses sous-domaines ? */
function matchesHost(origin: string, host: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === host || hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

/**
 * Adaptateur de l'extranet du job : d'abord par l'assureur (clé du catalogue, fiable), sinon par le domaine de la
 * page, sinon le comportement générique.
 */
export function adapterFor({ insurerId, origin }: { insurerId?: string | null; origin?: string | null }): ExtranetAdapter {
  const byInsurer = insurerId ? EXTRANETS.find(extranet => extranet.insurerId === insurerId) : undefined;
  if (byInsurer) return byInsurer.adapter;
  const byHost = origin ? EXTRANETS.find(extranet => extranet.hosts.some(host => matchesHost(origin, host))) : undefined;
  return byHost?.adapter ?? genericAdapter;
}
