import { AccessRequest } from '../shared/messages';
import { loadInsurers, loadInsurersFor } from './jobs-service';
import { extranetPatterns, insurerForOrigin } from './origin-match';
import { originOnly, pagesByTab, signedInUser } from './worker-state';

// ── Injection à la demande du content script (extranets du catalogue seulement) ──
const CONTENT_SCRIPT_ID = 'extranets';
const CONTENT_SCRIPT_FILE = 'content/content-script.js';

/** Motifs des extranets du catalogue (vide si personne n'est connecté ou si le catalogue est illisible). */
async function catalogPatterns(): Promise<string[]> {
  if (!(await signedInUser())) return [];
  try {
    return extranetPatterns((await loadInsurers()).flatMap(insurer => insurer.extranetDomains));
  } catch {
    return [];
  }
}

/**
 * Synchronisations en file : connexion, réveil et changements d'autorisation peuvent la demander au même moment.
 * Deux exécutions simultanées enregistraient deux fois le même script (« Duplicate script ID 'extranets' ») ;
 * chacune attend maintenant la fin de la précédente, et repart de l'état réellement enregistré.
 */
let contentScriptsSync: Promise<void> = Promise.resolve();

/**
 * Enregistre le content script pour les extranets du catalogue auxquels le courtier a donné accès (permissions
 * d'hôte optionnelles) ; le retire sinon. Appelé à la connexion, au réveil et quand une permission change.
 */
export function syncContentScripts(): Promise<void> {
  contentScriptsSync = contentScriptsSync.then(syncContentScriptsNow, syncContentScriptsNow);
  return contentScriptsSync;
}

async function syncContentScriptsNow(): Promise<void> {
  try {
    const patterns = await catalogPatterns();
    const granted: string[] = [];
    for (const pattern of patterns) {
      if (await chrome.permissions.contains({ origins: [pattern] })) granted.push(pattern);
    }
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
    if (granted.length === 0) return;
    await chrome.scripting.registerContentScripts([
      { id: CONTENT_SCRIPT_ID, matches: granted, js: [CONTENT_SCRIPT_FILE], runAt: 'document_idle', allFrames: true, persistAcrossSessions: true },
    ]);
  } catch (error) {
    console.error('Enregistrement du content script impossible', error);
  }
}

/** L'onglet actif est-il l'extranet d'un assureur auquel l'extension n'a pas encore accès ? */
export async function accessRequest(): Promise<AccessRequest | null> {
  if (!(await signedInUser())) return null;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const origin = originOnly(tab?.url);
  if (!origin) return null;
  // Un extranet publié au catalogue il y a quelques minutes est reconnu tout de suite.
  const insurer = insurerForOrigin(origin, await loadInsurersFor(origin));
  if (!insurer) return null;
  const origins = extranetPatterns(insurer.extranetDomains);
  if (origins.length === 0 || (await chrome.permissions.contains({ origins }))) return null;
  return { insurerName: insurer.name, origins };
}

/** Accès accordé depuis le side panel : enregistrement, puis injection immédiate dans l'onglet actif (sans recharger). */
export async function onAccessGranted(): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const origin = originOnly(tab?.url);
  // Catalogue à jour avant l'enregistrement du script : il doit couvrir l'extranet qui vient d'être autorisé.
  const insurers = origin ? await loadInsurersFor(origin) : [];
  await syncContentScripts();
  if (tab?.id === undefined || !origin || !insurerForOrigin(origin, insurers)) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: [CONTENT_SCRIPT_FILE] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Filet de sécurité : un extranet du catalogue a fini de charger, l'accès est accordé, mais la page n'a pas signalé
 * notre script (onglet ouvert avant un rechargement de l'extension, enregistrement perdu au réveil du service worker
 * avant la connexion…). On réenregistre et on injecte directement ; le script ignore une seconde injection.
 */
export async function ensureInjected(tabId: number, url: string | undefined): Promise<void> {
  const origin = originOnly(url);
  if (!origin || !(await signedInUser())) return;
  const insurer = insurerForOrigin(origin, await loadInsurers().catch(() => []));
  if (!insurer) return;
  const origins = extranetPatterns(insurer.extranetDomains);
  if (!origins.length || !(await chrome.permissions.contains({ origins }))) return;
  // Laisse au script enregistré le temps de se signaler (PAGE_DETECTED) avant d'injecter nous-mêmes.
  await new Promise(resolve => setTimeout(resolve, 1500));
  if (pagesByTab.has(tabId)) return;
  // Vérifie si l'onglet existe toujours (l'utilisateur a pu le fermer pendant le délai).
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  if (!registered.length) await syncContentScripts();
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_SCRIPT_FILE] }).catch(error => {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes('No tab with id') && !msg.includes('tab was closed')) {
      console.warn('Injection du content script impossible', error);
    }
  });
}
