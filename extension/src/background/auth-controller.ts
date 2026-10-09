import type { AuthState, ExtensionUser } from '../shared/messages';

/** Erreur dont le message est destiné au courtier (affiché tel quel dans le side panel). */
export class UserFacingError extends Error {}

/** Compte connecté, avec les informations lues dans son jeton Firebase. */
export interface AuthedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  /** Claims posés par le serveur (`ci_cabinet_id`, `ci_role`) : absents tant que le compte n'a pas de cabinet. */
  cabinetId: string | null;
  role: 'admin' | 'courtier' | null;
  /** Heure de connexion (secondes) de CE jeton : c'est elle que le serveur lie à la session de l'app. */
  authTime: number | null;
}

/** Connexion Firebase (adaptée par `firebase-adapters.ts`). */
export interface AuthPort {
  signIn(email: string, password: string): Promise<AuthedUser>;
  signOut(): Promise<void>;
  /** Utilisateur restauré depuis le stockage (le service worker redémarre souvent), ou null. */
  currentUser(): Promise<AuthedUser | null>;
}

/** Functions de session de l'extension. */
export interface BackendPort {
  /** `sessions-ouvrirExtension` : refuse si aucune session de l'app n'est ouverte sur l'appareil. */
  openExtensionSession(): Promise<void>;
  /** `sessions-fermerExtension` : échec toléré. */
  closeExtensionSession(): Promise<void>;
}

/**
 * Ce que Firestore dit de la session : `open` (avec la connexion d'extension enregistrée),
 * `closed` (plus de session, ou lecture refusée) ou `unknown` (réseau indisponible : on ne conclut rien).
 */
export type SessionRead = { kind: 'open'; extensionAuthTime: number | null } | { kind: 'closed' } | { kind: 'unknown' };

export interface SessionPort {
  read(user: AuthedUser): Promise<SessionRead>;
}

/** Messages à afficher (codes d'erreur Firebase et raisons du serveur). */
export const MESSAGES = {
  badCredentials: 'Email ou mot de passe incorrect.',
  tooManyRequests: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
  disabled: 'Ce compte a été désactivé. Contactez l’administrateur de votre cabinet.',
  network: 'Connexion impossible : vérifiez votre réseau.',
  noCabinet: 'Ce compte n’est rattaché à aucun cabinet. Créez ou rejoignez un cabinet dans l’application avant d’utiliser l’extension.',
  noAppSession: 'Ouvrez Courtier Intelligent dans votre navigateur et connectez-vous avant d’utiliser l’extension.',
  sessionClosed: 'Votre session a été fermée sur cet appareil (déconnexion de l’application, nouvelle connexion ou compte désactivé). Reconnectez-vous.',
  generic: 'Connexion impossible pour le moment. Réessayez.',
} as const;

const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': MESSAGES.badCredentials,
  'auth/wrong-password': MESSAGES.badCredentials,
  'auth/user-not-found': MESSAGES.badCredentials,
  'auth/invalid-email': MESSAGES.badCredentials,
  'auth/too-many-requests': MESSAGES.tooManyRequests,
  'auth/user-disabled': MESSAGES.disabled,
  'auth/network-request-failed': MESSAGES.network,
};

/** Message lisible pour une erreur de connexion (Firebase Auth ou Cloud Function). */
export function toUserMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  const { code, message, details } = (error ?? {}) as { code?: string; message?: string; details?: { reason?: string } };
  if (code && FIREBASE_AUTH_MESSAGES[code]) return FIREBASE_AUTH_MESSAGES[code];
  if (details?.reason === 'no_app_session') return MESSAGES.noAppSession;
  // Les functions rédigent déjà leurs refus en français pour l'utilisateur.
  if (code?.startsWith('functions/') && !['functions/internal', 'functions/unavailable'].includes(code) && message) return message;
  return MESSAGES.generic;
}

const toExtensionUser = (user: AuthedUser): ExtensionUser => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName,
  cabinetId: user.cabinetId!,
  role: user.role ?? 'courtier',
});

/**
 * Connexion de l'extension. Règles :
 * - refus si le compte n'a pas de cabinet, ou si aucune session de l'app n'est ouverte sur l'appareil ;
 * - la connexion de l'extension est enregistrée dans la session de l'app : dès que celle-ci est coupée
 *   (déconnexion, nouvelle connexion, appareil réinitialisé, membre désactivé), `verify` déconnecte l'extension.
 */
export function createAuthController(ports: { auth: AuthPort; backend: BackendPort; sessions: SessionPort }) {
  const listeners = new Set<(state: AuthState) => void>();
  let notice: string | null = null;
  /** Dernier état connu : une connexion qui disparaît sans déconnexion volontaire est une session perdue, à signaler. */
  let known: 'unknown' | 'signed_in' | 'signed_out' = 'unknown';

  const publish = (state: AuthState): AuthState => {
    known = state.status;
    listeners.forEach(listener => listener(state));
    return state;
  };
  const signedOut = (message: string | null = null): AuthState => {
    notice = message;
    return { status: 'signed_out', notice: message };
  };

  /** L'utilisateur est « utilisable » s'il a un cabinet (les claims sont posés par le serveur). */
  const isMember = (user: AuthedUser | null): user is AuthedUser => !!user && !!user.cabinetId;

  return {
    onChange(listener: (state: AuthState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async getState(): Promise<AuthState> {
      const user = await ports.auth.currentUser();
      if (isMember(user)) {
        known = 'signed_in';
        return { status: 'signed_in', user: toExtensionUser(user) };
      }
      return { status: 'signed_out', notice };
    },

    /** Connexion du courtier : lève une `UserFacingError` si elle est refusée (le compte est alors déconnecté). */
    async signIn(email: string, password: string): Promise<AuthState> {
      let user: AuthedUser;
      try {
        user = await ports.auth.signIn(email.trim(), password);
      } catch (error) {
        throw new UserFacingError(toUserMessage(error));
      }
      if (!isMember(user)) {
        await ports.auth.signOut().catch(() => undefined);
        throw new UserFacingError(MESSAGES.noCabinet);
      }
      try {
        await ports.backend.openExtensionSession();
      } catch (error) {
        await ports.auth.signOut().catch(() => undefined);
        throw new UserFacingError(toUserMessage(error));
      }
      notice = null;
      return publish({ status: 'signed_in', user: toExtensionUser(user) });
    },

    async signOut(): Promise<AuthState> {
      // Libère la connexion de l'extension côté serveur (sans toucher à la session de l'app), puis se déconnecte.
      await ports.backend.closeExtensionSession().catch(() => undefined);
      await ports.auth.signOut().catch(() => undefined);
      return publish(signedOut());
    },

    /**
     * Vérifie que la session de l'appareil est toujours ouverte. À appeler à chaque réveil du service worker,
     * périodiquement, et quand la fiche du membre change. Une erreur réseau ne déconnecte pas.
     */
    async verify(): Promise<AuthState> {
      const user = await ports.auth.currentUser().catch(() => null);
      if (!isMember(user)) {
        // Jeton révoqué (membre désactivé, compte supprimé) ou jamais connecté.
        return known === 'signed_in' ? publish(signedOut(MESSAGES.sessionClosed)) : signedOut(notice);
      }
      const session = await ports.sessions.read(user);
      if (session.kind === 'unknown') {
        return { status: 'signed_in', user: toExtensionUser(user) };
      }
      const revoked = session.kind === 'closed' || session.extensionAuthTime !== user.authTime;
      if (!revoked) {
        return { status: 'signed_in', user: toExtensionUser(user) };
      }
      await ports.auth.signOut().catch(() => undefined);
      return publish(signedOut(MESSAGES.sessionClosed));
    },
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
