import { Insurer } from './models';

/**
 * Assureurs propres à un cabinet : ajoutés par son admin (`cabinets/{c}/insurers/{id}`), en plus du catalogue global.
 * Leur identifiant porte un préfixe : on sait sans lecture où trouver la fiche, et il ne peut pas recouvrir un assureur
 * du catalogue.
 */
export const CABINET_INSURER_PREFIX = 'cab-';

export const CABINET_INSURER_NAME_MAX = 80;
export const CABINET_INSURERS_MAX = 50;

export function isCabinetInsurerId(insurerId: string): boolean {
  return insurerId.startsWith(CABINET_INSURER_PREFIX);
}

/** Chemin Firestore de la fiche d'un assureur, qu'il vienne du catalogue ou du cabinet. */
export function insurerDocPath(cabinetId: string, insurerId: string): string {
  return isCabinetInsurerId(insurerId) ? `ci_cabinets/${cabinetId}/ci_insurers/${insurerId}` : `ci_insurers/${insurerId}`;
}

/**
 * Suffixes publics les plus courants, sous lesquels n'importe qui peut obtenir un sous-domaine (hébergeurs, domaines de
 * second niveau des pays). Un extranet ne peut pas être déclaré sur l'un d'eux : l'extension injecterait son script et
 * les données du client sur les sites de tous les autres titulaires. Liste volontairement courte (pas la Public Suffix
 * List complète) ; les « co.xx », « com.xx »… des pays sont couverts par motif.
 */
const PUBLIC_SUFFIXES = new Set([
  // Hébergeurs et plateformes
  'github.io', 'gitlab.io', 'web.app', 'firebaseapp.com', 'appspot.com', 'run.app', 'cloudfunctions.net',
  'googleusercontent.com', 'blogspot.com', 'sites.google.com', 'netlify.app', 'vercel.app', 'herokuapp.com',
  'pages.dev', 'workers.dev', 'trycloudflare.com', 'azurewebsites.net', 'azurestaticapps.net', 'cloudapp.net',
  'cloudfront.net', 'amazonaws.com', 's3.amazonaws.com', 'elasticbeanstalk.com', 'onrender.com', 'fly.dev',
  'glitch.me', 'repl.co', 'surge.sh', 'ngrok.io', 'ngrok-free.app', 'ngrok.app', 'wixsite.com', 'wordpress.com',
  'myshopify.com', 'sharepoint.com', 'webflow.io', 'framer.website', 'notion.site', 'ovh.net',
  // Second niveau ouvert à tous (France et Tunisie)
  'asso.fr', 'nom.fr', 'prd.fr', 'presse.fr', 'tm.fr', 'gouv.fr', 'com.fr', 'ens.tn', 'fin.tn', 'info.tn', 'nat.tn',
]);

/** Second niveau générique d'un domaine de pays : « co.uk », « com.tn », « org.au », « gov.fr »… */
const COUNTRY_SECOND_LEVEL = /^(?:co|com|org|net|gov|gouv|edu|ac|or|ne|go|mil|ltd|plc|biz|info)\.[a-z]{2}$/;

/** Le domaine est-il un suffixe public (et donc trop large pour désigner un extranet) ? */
export function isPublicSuffix(domain: string): boolean {
  const host = domain.trim().toLowerCase().replace(/^\*?\./, '').replace(/\.$/, '');
  return PUBLIC_SUFFIXES.has(host) || COUNTRY_SECOND_LEVEL.test(host);
}

/**
 * Adresse de l'extranet saisie par le courtier : https uniquement (http accepté pour localhost, démo),
 * sans identifiants dans l'URL, et jamais un suffixe public (« github.io », « co.uk »…).
 * Renvoie l'URL normalisée et son domaine, ou null si elle est refusée.
 */
export function parseExtranetUrl(raw: string): { url: string; domain: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  if (url.username || url.password) return null;
  if (!local && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
  if (!local && isPublicSuffix(url.hostname)) return null;
  // localhost : le port fait partie du domaine (« localhost:8091 »), comme dans l'extension.
  const domain = url.hostname === 'localhost' ? url.host : url.hostname;
  return { url: url.toString().slice(0, 500), domain: domain.toLowerCase() };
}

/** Assureurs du catalogue global remplacés ou retirés par le cabinet (fiches archivées comprises). */
export function replacedInsurerIds(insurers: Insurer[]): Set<string> {
  return new Set(insurers.map(insurer => insurer.replaces).filter((id): id is string => !!id));
}

/**
 * Catalogue vu par un cabinet : les assureurs globaux qu'il n'a ni modifiés ni retirés, puis les siens (hors archivés),
 * triés par nom.
 */
export function mergeInsurers(global: Insurer[], cabinet: Insurer[]): Insurer[] {
  const replaced = replacedInsurerIds(cabinet);
  return [...global.filter(insurer => !replaced.has(insurer.id)), ...cabinet.filter(insurer => !insurer.archived)].sort((a, b) =>
    a.name.localeCompare(b.name, 'fr'),
  );
}
