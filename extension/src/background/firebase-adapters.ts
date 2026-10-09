import { FirebaseError } from 'firebase/app';
import { getIdTokenResult, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebase } from '../shared/firebase';
import type { AuthedUser, AuthPort, BackendPort, SessionPort, SessionRead } from './auth-controller';

/** Lit l'utilisateur Firebase et ses claims (cabinet, rôle, heure de connexion de ce jeton). */
async function toAuthedUser(user: User): Promise<AuthedUser> {
  const { claims } = await getIdTokenResult(user);
  const role = claims['ci_role'];
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    cabinetId: typeof claims['ci_cabinet_id'] === 'string' ? claims['ci_cabinet_id'] : null,
    role: role === 'admin' || role === 'courtier' ? role : null,
    authTime: Number(claims['auth_time']) || null,
  };
}

export const firebaseAuthPort: AuthPort = {
  async signIn(email, password) {
    const { auth } = getFirebase();
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    return toAuthedUser(user);
  },

  async signOut() {
    await signOut(getFirebase().auth);
  },

  async currentUser() {
    const { auth } = getFirebase();
    // Le service worker vient peut-être de se réveiller : attend la restauration de la connexion depuis IndexedDB.
    await auth.authStateReady();
    if (!auth.currentUser) return null;
    try {
      // Rafraîchit le jeton s'il est proche de l'expiration (automatique) ; échoue s'il a été révoqué.
      return await toAuthedUser(auth.currentUser);
    } catch (error) {
      if (error instanceof FirebaseError && error.code.startsWith('auth/')) {
        await signOut(auth).catch(() => undefined);
        return null;
      }
      throw error;
    }
  },
};

export const firebaseBackendPort: BackendPort = {
  async openExtensionSession() {
    await httpsCallable(getFirebase().functions, 'sessions-ouvrirExtension')({});
  },
  async closeExtensionSession() {
    await httpsCallable(getFirebase().functions, 'sessions-fermerExtension')({});
  },
};

/**
 * Relit la fiche du membre : la connexion d'extension enregistrée dans sa session doit être celle de CE jeton.
 * Un refus (règles Firestore) ou une fiche sans session = session perdue ; une erreur réseau = on ne sait pas.
 */
export const firestoreSessionPort: SessionPort = {
  async read(user): Promise<SessionRead> {
    try {
      const snapshot = await getDoc(doc(getFirebase().firestore, `cabinets/${user.cabinetId}/members/${user.uid}`));
      const session = snapshot.get('session') as { extensionAuthTime?: number } | undefined;
      if (!snapshot.exists() || !session) return { kind: 'closed' };
      return { kind: 'open', extensionAuthTime: session.extensionAuthTime ?? null };
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'permission-denied') return { kind: 'closed' };
      return { kind: 'unknown' };
    }
  },
};
