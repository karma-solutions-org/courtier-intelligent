import { AuthState, ConnectResponse, ExternalMessage, PongResponse } from '../shared/messages';
import { MESSAGES, toUserMessage, UserFacingError } from './auth-controller';
import { syncContentScripts } from './content-scripts';
import { APP_DEVICE_KEY } from './firebase-adapters';
import { externalOriginsFromMatches } from './sender-guard';
import { auth, originOnly } from './worker-state';

// Messages de l'app Angular (domaines autorisés dans manifest.json → externally_connectable).
// L'app transmet son identifiant d'appareil (PING) et, pour la connexion automatique (CONNECT), un jeton destiné à
// l'extension émis par le serveur : jamais son propre jeton. L'extension en tire sa propre connexion Firebase, et le
// serveur vérifie qu'elle s'ouvre sur l'appareil lié de la session de l'app.
const EXTERNAL_ORIGINS = externalOriginsFromMatches(chrome.runtime.getManifest().externally_connectable?.matches);

/** Écouteur de `chrome.runtime.onMessageExternal` : `true` quand la réponse est asynchrone. */
export function onExternalMessage(message: ExternalMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void): boolean {
  // Seules les origines de l'app déclarées dans le manifest sont écoutées (jamais une autre extension).
  const origin = sender.origin ?? originOnly(sender.url);
  if (sender.id !== undefined && sender.id !== chrome.runtime.id) return false;
  if (!origin || !EXTERNAL_ORIGINS.has(origin)) return false;
  switch (message?.type) {
    case 'PING':
      if (isDeviceId(message.deviceId)) {
        void chrome.storage.local.set({ [APP_DEVICE_KEY]: message.deviceId }).catch(() => undefined);
      }
      // L'app apprend aussi si l'extension est connectée (et à quel compte) : elle ne propose la connexion
      // automatique que si besoin.
      auth
        .getState()
        .catch((): AuthState => ({ status: 'signed_out', notice: null }))
        .then(state => {
          const response: PongResponse = {
            type: 'PONG',
            version: chrome.runtime.getManifest().version,
            signedIn: state.status === 'signed_in',
            uid: state.status === 'signed_in' ? state.user.uid : null,
          };
          sendResponse(response);
        });
      return true;

    case 'CONNECT':
      if (!isDeviceId(message.deviceId) || typeof message.token !== 'string' || !message.token || message.token.length > MAX_CUSTOM_TOKEN_LENGTH) {
        sendResponse({ type: 'CONNECT_FAILED', message: MESSAGES.generic } satisfies ConnectResponse);
        return false;
      }
      void connectFromApp(message.token, message.deviceId).then(sendResponse);
      return true;
  }
  return false;
}

/** Format de l'identifiant d'appareil généré par l'app (UUID), même règle que le serveur. */
function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(value);
}

/** Un custom token Firebase fait moins d'un ko : au-delà, le message est rejeté sans être traité. */
const MAX_CUSTOM_TOKEN_LENGTH = 4096;

/** Connexion automatique en cours : plusieurs onglets de l'app peuvent l'envoyer en même temps. */
let pendingConnect: Promise<ConnectResponse> | null = null;

/**
 * Connexion automatique demandée par l'app : l'appareil est enregistré d'abord (le serveur le vérifie à
 * l'ouverture de la session d'extension), puis le jeton est échangé contre la connexion de l'extension.
 * Une connexion existante (autre compte) est fermée avant.
 */
function connectFromApp(token: string, deviceId: string): Promise<ConnectResponse> {
  pendingConnect ??= (async (): Promise<ConnectResponse> => {
    try {
      await chrome.storage.local.set({ [APP_DEVICE_KEY]: deviceId });
      const current = await auth.getState().catch(() => null);
      if (current?.status === 'signed_in') await auth.signOut();
      const state = await auth.signInWithToken(token);
      if (state.status !== 'signed_in') return { type: 'CONNECT_FAILED', message: MESSAGES.generic };
      void syncContentScripts();
      return { type: 'CONNECTED', uid: state.user.uid };
    } catch (error) {
      return { type: 'CONNECT_FAILED', message: error instanceof UserFacingError ? error.message : toUserMessage(error) };
    } finally {
      pendingConnect = null;
    }
  })();
  return pendingConnect;
}
