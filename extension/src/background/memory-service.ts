import type { FormMemoryField } from '@shared';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { LoadedMemory, memoryKeyFor } from '../engine/memory';
import { getFirebase } from '../shared/firebase';

/**
 * Mémoire valide d'un formulaire d'extranet. Lue directement dans Firestore (les règles l'autorisent à l'extension
 * connectée) ; une mémoire invalidée est ignorée : le formulaire est analysé de nouveau, puis réappris.
 */
export async function loadMemory(origin: string, fingerprint: string): Promise<LoadedMemory | null> {
  const key = await memoryKeyFor(origin, fingerprint);
  const snapshot = await getDoc(doc(getFirebase().firestore, 'formMemories', key));
  if (!snapshot.exists() || snapshot.get('invalidatedAt')) return null;
  const fields = snapshot.get('fields');
  return Array.isArray(fields) ? { key, fields: fields as FormMemoryField[] } : null;
}

/** Les écritures passent par les functions `memoires-*` : elles valident la structure (jamais de valeur) avant d'écrire. */
export async function saveMemory(origin: string, fingerprint: string, fields: FormMemoryField[]): Promise<void> {
  await httpsCallable(getFirebase().functions, 'memoires-enregistrer')({ origin, formFingerprint: fingerprint, fields });
}

export async function touchMemory(key: string): Promise<void> {
  await httpsCallable(getFirebase().functions, 'memoires-utiliser')({ key });
}

export async function invalidateMemory(key: string): Promise<void> {
  await httpsCallable(getFirebase().functions, 'memoires-invalider')({ key });
}
