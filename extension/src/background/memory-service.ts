import type { FormMemoryField, DiscoveredFieldInput } from '@shared';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { LoadedMemory, memoryKeyFor, type MemorySaveOutcome } from '../engine/memory';
import { getFirebase } from '../shared/firebase';

/**
 * Mémoire valide d'un formulaire d'extranet. Lue directement dans Firestore (les règles l'autorisent à l'extension
 * connectée) ; une mémoire invalidée est ignorée : le formulaire est analysé de nouveau, puis réappris.
 */
export async function loadMemory(origin: string, fingerprint: string, cabinetId?: string | null): Promise<LoadedMemory | null> {
  const key = await memoryKeyFor(origin, fingerprint);
  const { firestore } = getFirebase();
  // Copie du cabinet d'abord (elle sert tout de suite), puis la mémoire commune (accord de plusieurs cabinets).
  const paths = [...(cabinetId ? [`ci_cabinets/${cabinetId}/ci_formMemories/${key}`] : []), `ci_formMemories/${key}`];
  for (const path of paths) {
    const snapshot = await getDoc(doc(firestore, path)).catch(() => null);
    if (!snapshot?.exists() || snapshot.get('invalidatedAt')) continue;
    const fields = snapshot.get('fields');
    if (Array.isArray(fields)) return { key, fields: fields as FormMemoryField[] };
  }
  return null;
}

/** Les écritures passent par les functions `memoires-*` : elles valident la structure (jamais de valeur) avant d'écrire. */
export async function saveMemory(origin: string, fingerprint: string, fields: FormMemoryField[]): Promise<MemorySaveOutcome> {
  const result = await httpsCallable<unknown, { outcome?: MemorySaveOutcome }>(getFirebase().functions, 'memoires-enregistrer')({
    origin,
    formFingerprint: fingerprint,
    fields,
  });
  return result.data?.outcome ?? 'created';
}

/** Signale les champs sans équivalent d'un formulaire d'extranet : le serveur les ajoute au questionnaire. */
export async function reportDiscoveredFields(
  insurerId: string,
  origin: string,
  fingerprint: string,
  fields: DiscoveredFieldInput[],
  requiredPaths: string[] = [],
): Promise<void> {
  await httpsCallable(getFirebase().functions, 'champs-signaler')({ insurerId, origin, formFingerprint: fingerprint, fields, requiredPaths });
}

export async function touchMemory(key: string): Promise<void> {
  await httpsCallable(getFirebase().functions, 'memoires-utiliser')({ key });
}

export async function invalidateMemory(key: string): Promise<void> {
  await httpsCallable(getFirebase().functions, 'memoires-invalider')({ key });
}
