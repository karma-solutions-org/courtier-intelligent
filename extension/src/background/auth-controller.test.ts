import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthedUser,
  AuthPort,
  BackendPort,
  createAuthController,
  MESSAGES,
  SessionPort,
  SessionRead,
  toUserMessage,
  UserFacingError,
} from './auth-controller';

const courtier: AuthedUser = {
  uid: 'u1',
  email: 'jean@cabinet.fr',
  displayName: 'Jean Dupont',
  cabinetId: 'cabinet-1',
  role: 'courtier',
  authTime: 1_790_000_500,
};

/** Fabrique un contrôleur avec des ports simulés ; `state` permet de changer ce que Firebase et Firestore « répondent ». */
function setup() {
  const state: { user: AuthedUser | null; session: SessionRead; signInResult: AuthedUser | Error; openError: unknown } = {
    user: null,
    session: { kind: 'open', extensionAuthTime: courtier.authTime },
    signInResult: courtier,
    openError: null,
  };
  const auth: AuthPort = {
    signIn: vi.fn(async () => {
      if (state.signInResult instanceof Error) throw state.signInResult;
      state.user = state.signInResult;
      return state.signInResult;
    }),
    signOut: vi.fn(async () => {
      state.user = null;
    }),
    currentUser: vi.fn(async () => state.user),
  };
  const backend: BackendPort = {
    openExtensionSession: vi.fn(async () => {
      if (state.openError) throw state.openError;
    }),
    closeExtensionSession: vi.fn(async () => undefined),
  };
  const sessions: SessionPort = { read: vi.fn(async () => state.session) };
  const controller = createAuthController({ auth, backend, sessions });
  const changes: string[] = [];
  controller.onChange(s => changes.push(s.status === 'signed_in' ? 'signed_in' : `signed_out:${s.notice ?? ''}`));
  return { state, auth, backend, sessions, controller, changes };
}

describe('Connexion (E6-1)', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('connecte un courtier de cabinet dont la session de l’app est ouverte', async () => {
    const result = await t.controller.signIn(' jean@cabinet.fr ', 'secret');

    expect(t.auth.signIn).toHaveBeenCalledWith('jean@cabinet.fr', 'secret');
    expect(t.backend.openExtensionSession).toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: 'signed_in',
      user: { uid: 'u1', email: 'jean@cabinet.fr', displayName: 'Jean Dupont', cabinetId: 'cabinet-1', role: 'courtier' },
    });
    expect(t.changes).toEqual(['signed_in']);
  });

  it('refuse un compte sans cabinet, et le déconnecte', async () => {
    t.state.signInResult = { ...courtier, cabinetId: null, role: null };

    await expect(t.controller.signIn('a@b.fr', 'x')).rejects.toThrow(MESSAGES.noCabinet);

    expect(t.backend.openExtensionSession).not.toHaveBeenCalled();
    expect(t.auth.signOut).toHaveBeenCalledOnce();
    expect(await t.controller.getState()).toEqual({ status: 'signed_out', notice: null });
  });

  it('refuse quand aucune session de l’app n’est ouverte sur l’appareil, et déconnecte', async () => {
    t.state.openError = { code: 'functions/failed-precondition', message: 'peu importe', details: { reason: 'no_app_session' } };

    await expect(t.controller.signIn('a@b.fr', 'x')).rejects.toThrow(MESSAGES.noAppSession);

    expect(t.auth.signOut).toHaveBeenCalledOnce();
    expect(await t.controller.getState()).toEqual({ status: 'signed_out', notice: null });
    expect(t.changes).toEqual([]);
  });

  it('refuse un mauvais mot de passe avec un message clair', async () => {
    t.state.signInResult = Object.assign(new Error('x'), { code: 'auth/invalid-credential' });

    await expect(t.controller.signIn('a@b.fr', 'mauvais')).rejects.toThrow(MESSAGES.badCredentials);
    expect(t.backend.openExtensionSession).not.toHaveBeenCalled();
  });

  it('refuse un compte désactivé par le serveur (cabinet désactivé, membre désactivé)', async () => {
    t.state.openError = { code: 'functions/permission-denied', message: 'Ce cabinet est désactivé.' };

    await expect(t.controller.signIn('a@b.fr', 'x')).rejects.toThrow('Ce cabinet est désactivé.');
    expect(t.auth.signOut).toHaveBeenCalled();
  });

  it('les erreurs de connexion sont des UserFacingError (message affichable tel quel)', async () => {
    t.state.signInResult = Object.assign(new Error('x'), { code: 'auth/network-request-failed' });

    await expect(t.controller.signIn('a@b.fr', 'x')).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe('Messages d’erreur', () => {
  it.each([
    [{ code: 'auth/invalid-credential' }, MESSAGES.badCredentials],
    [{ code: 'auth/user-not-found' }, MESSAGES.badCredentials],
    [{ code: 'auth/too-many-requests' }, MESSAGES.tooManyRequests],
    [{ code: 'auth/user-disabled' }, MESSAGES.disabled],
    [{ code: 'auth/network-request-failed' }, MESSAGES.network],
    [{ code: 'functions/failed-precondition', details: { reason: 'no_app_session' } }, MESSAGES.noAppSession],
    [{ code: 'functions/resource-exhausted', message: 'Limite atteinte.' }, 'Limite atteinte.'],
    [{ code: 'functions/internal', message: 'INTERNAL' }, MESSAGES.generic],
    [{ code: 'functions/unavailable', message: 'x' }, MESSAGES.generic],
    [new Error('inattendu'), MESSAGES.generic],
    [undefined, MESSAGES.generic],
  ])('%j', (error, expected) => {
    expect(toUserMessage(error)).toBe(expected);
  });
});

describe('Garde de la session (E6-3)', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(async () => {
    t = setup();
    await t.controller.signIn('jean@cabinet.fr', 'secret');
    t.changes.length = 0;
  });

  it('reste connecté tant que la connexion de l’extension est enregistrée dans la session de l’app', async () => {
    expect(await t.controller.verify()).toMatchObject({ status: 'signed_in' });
    expect(t.auth.signOut).not.toHaveBeenCalled();
    expect(t.changes).toEqual([]);
  });

  it('perd l’accès dès que la session de l’app est coupée (déconnexion, appareil réinitialisé, membre désactivé)', async () => {
    t.state.session = { kind: 'closed' };

    const state = await t.controller.verify();

    expect(state).toEqual({ status: 'signed_out', notice: MESSAGES.sessionClosed });
    expect(t.auth.signOut).toHaveBeenCalledOnce();
    expect(t.changes).toEqual([`signed_out:${MESSAGES.sessionClosed}`]);
    expect(await t.controller.getState()).toEqual({ status: 'signed_out', notice: MESSAGES.sessionClosed });
  });

  it('perd l’accès quand l’app s’est reconnectée (la session ne porte plus la connexion de l’extension)', async () => {
    t.state.session = { kind: 'open', extensionAuthTime: null };
    expect((await t.controller.verify()).status).toBe('signed_out');
  });

  it('perd l’accès quand la session porte la connexion d’une autre extension (autre auth_time)', async () => {
    t.state.session = { kind: 'open', extensionAuthTime: 999 };
    expect((await t.controller.verify()).status).toBe('signed_out');
  });

  it('ne déconnecte pas sur une simple erreur réseau', async () => {
    t.state.session = { kind: 'unknown' };

    expect(await t.controller.verify()).toMatchObject({ status: 'signed_in' });
    expect(t.auth.signOut).not.toHaveBeenCalled();
  });

  it('signale la perte quand le jeton a été révoqué par le serveur (membre désactivé)', async () => {
    t.state.user = null; // Firebase n'a plus d'utilisateur : le jeton ne peut plus être rafraîchi

    expect(await t.controller.verify()).toEqual({ status: 'signed_out', notice: MESSAGES.sessionClosed });
    expect(t.changes).toEqual([`signed_out:${MESSAGES.sessionClosed}`]);
  });

  it('ne signale rien quand personne n’était connecté', async () => {
    const fresh = setup();

    expect(await fresh.controller.verify()).toEqual({ status: 'signed_out', notice: null });
    expect(fresh.changes).toEqual([]);
    expect(fresh.sessions.read).not.toHaveBeenCalled();
  });

  it('retrouve la connexion au réveil du service worker (jeton restauré), sans nouvelle saisie', async () => {
    const woken = createAuthController({ auth: t.auth, backend: t.backend, sessions: t.sessions });

    expect(await woken.getState()).toMatchObject({ status: 'signed_in', user: { uid: 'u1' } });
    expect(await woken.verify()).toMatchObject({ status: 'signed_in' });
  });

  it('un compte sans cabinet restauré n’est pas considéré connecté', async () => {
    t.state.user = { ...courtier, cabinetId: null, role: null };

    expect((await t.controller.verify()).status).toBe('signed_out');
  });
});

describe('Déconnexion', () => {
  it('libère la connexion de l’extension côté serveur puis se déconnecte, même si le serveur est injoignable', async () => {
    const t = setup();
    await t.controller.signIn('jean@cabinet.fr', 'secret');
    vi.mocked(t.backend.closeExtensionSession).mockRejectedValueOnce(new Error('réseau'));

    const state = await t.controller.signOut();

    expect(state).toEqual({ status: 'signed_out', notice: null });
    expect(t.backend.closeExtensionSession).toHaveBeenCalledOnce();
    expect(t.auth.signOut).toHaveBeenCalledOnce();
  });

  it('une déconnexion volontaire n’affiche pas de message de session perdue', async () => {
    const t = setup();
    await t.controller.signIn('jean@cabinet.fr', 'secret');
    await t.controller.signOut();

    expect(await t.controller.verify()).toEqual({ status: 'signed_out', notice: null });
  });
});
