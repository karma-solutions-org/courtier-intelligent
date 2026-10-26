/**
 * Constat des champs d'un extranet : tous les champs vus pendant un parcours (toutes pages, toutes étapes), envoyés au
 * serveur une fois le tarif enregistré. Le serveur met à jour les questions découvertes (libellé, choix) et compte
 * celles dont le champ a disparu (voir applySighting, shared/discovered-fields.ts). Structure seulement.
 *
 * Les champs sont gardés dans chrome.storage.session : un extranet multi-pages recharge le content script à chaque page.
 */
import { httpsCallable } from 'firebase/functions';
import { SIGHTING_MAX_FIELDS, type DiscoveredFieldInput } from '@shared';
import { getFirebase } from '../shared/firebase';

const PREFIX = 'sighting:';

interface StoredSighting {
  /** Job du parcours (dossier + assureur) : un autre job sur le même onglet repart de zéro. */
  job: string;
  fields: DiscoveredFieldInput[];
}

const jobKey = (job: { dossierId: string; insurerId: string }) => `${job.dossierId}/${job.insurerId}`;

async function read(tabId: number): Promise<StoredSighting | null> {
  const stored = await chrome.storage.session.get(`${PREFIX}${tabId}`).catch(() => ({}) as Record<string, unknown>);
  return (stored[`${PREFIX}${tabId}`] as StoredSighting | undefined) ?? null;
}

/** Ajoute les champs d'une étape au parcours de l'onglet (un champ déjà vu garde sa dernière description). */
export async function addSeenFields(tabId: number, job: { dossierId: string; insurerId: string }, fields: DiscoveredFieldInput[]): Promise<void> {
  const current = await read(tabId);
  const byKey = new Map((current?.job === jobKey(job) ? current.fields : []).map(field => [field.fieldKey, field]));
  for (const field of fields) byKey.set(field.fieldKey, field);
  const next: StoredSighting = { job: jobKey(job), fields: [...byKey.values()].slice(0, SIGHTING_MAX_FIELDS) };
  await chrome.storage.session.set({ [`${PREFIX}${tabId}`]: next }).catch(() => undefined);
}

/** Tarif enregistré : le parcours est complet, son constat part au serveur (une panne n'empêche rien). */
export async function sendSighting(tabId: number, job: { dossierId: string; insurerId: string }, origin: string): Promise<void> {
  const current = await read(tabId);
  await forgetSighting(tabId);
  if (!current || current.job !== jobKey(job) || !current.fields.length || !origin) return;
  await httpsCallable(getFirebase().functions, 'champs-constater')({ insurerId: job.insurerId, origin, fields: current.fields }).catch(() => undefined);
}

export async function forgetSighting(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`${PREFIX}${tabId}`).catch(() => undefined);
}
