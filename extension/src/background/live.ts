import { FirebaseError } from 'firebase/app';
import { collectionGroup, doc, getDoc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getFirebase } from '../shared/firebase';
import type { CurrentJob, ExtensionUser } from '../shared/messages';
import { JobSnapshot, pickCurrentJob } from './jobs';

export interface LiveHandlers {
  /** La fiche du membre a changé (ou n'est plus lisible) : la session est à revérifier. */
  onSessionMaybeChanged(): void;
  onJob(job: CurrentJob | null): void;
}

/**
 * Suit en direct, tant que le side panel est ouvert : la session de l'appareil (perte d'accès immédiate) et le
 * job de tarification en cours du courtier. Renvoie la fonction qui arrête le suivi.
 */
export function startLiveWatch(user: ExtensionUser, handlers: LiveHandlers): () => void {
  const { firestore } = getFirebase();
  const insurerNames = new Map<string, string>();
  let lastJobs: JobSnapshot[] = [];

  const emitJob = () => handlers.onJob(pickCurrentJob(lastJobs, insurerNames));

  /** Nom de l'assureur (catalogue) : chargé une fois, puis le job est réémis avec son nom. */
  const loadInsurerName = async (insurerId: string) => {
    if (insurerNames.has(insurerId)) return;
    try {
      const snapshot = await getDoc(doc(firestore, `insurers/${insurerId}`));
      const name = snapshot.get('name');
      if (typeof name === 'string') {
        insurerNames.set(insurerId, name);
        emitJob();
      }
    } catch {
      // Le nom est un confort : l'identifiant de l'assureur s'affiche à la place.
    }
  };

  const stopMember = onSnapshot(
    doc(firestore, `cabinets/${user.cabinetId}/members/${user.uid}`),
    () => handlers.onSessionMaybeChanged(),
    error => {
      if (error instanceof FirebaseError && error.code === 'permission-denied') handlers.onSessionMaybeChanged();
    },
  );

  const stopJobs = onSnapshot(
    query(collectionGroup(firestore, 'quoteJobs'), where('ownerUid', '==', user.uid), orderBy('updatedAt', 'desc'), limit(5)),
    snapshot => {
      lastJobs = snapshot.docs.map(d => ({
        // …/dossiers/{dossierId}/quoteJobs/{insurerId}
        dossierId: d.ref.parent.parent?.id ?? '',
        insurerId: d.id,
        data: d.data(),
      }));
      emitJob();
      lastJobs.forEach(job => void loadInsurerName(job.insurerId));
    },
    error => {
      if (error instanceof FirebaseError && error.code === 'permission-denied') handlers.onSessionMaybeChanged();
    },
  );

  return () => {
    stopMember();
    stopJobs();
  };
}
