import { Injectable } from '@angular/core';
import { map, Observable, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Résultat de la détection de l'extension Chrome.
 * `unsupported` : navigateur sans extensions Chrome (Firefox, Safari) · `unconfigured` : identifiant de l'extension
 * non renseigné dans l'environnement · `absent` : navigateur compatible, mais l'extension ne répond pas.
 */
export type ExtensionPing =
  | {
      status: 'installed';
      version: string;
      /** L'extension est connectée, et à quel compte (`uid`) : l'app ne la connecte automatiquement que si besoin. */
      signedIn: boolean;
      uid: string | null;
    }
  | { status: 'absent' }
  | { status: 'unsupported' }
  | { status: 'unconfigured' };

/** Résultat de la connexion automatique de l'extension. `message` : raison affichable du refus. */
export type ExtensionConnectResult = { ok: true } | { ok: false; message: string };

/** Port « extension du navigateur » : l'app ne connaît que cette classe, jamais l'API `chrome`. */
export abstract class ExtensionProvider {
  /**
   * [deviceId] : appareil de l'app, transmis à l'extension pour qu'elle ouvre sa session sur le MÊME appareil
   * (le serveur vérifie qu'il est lié au compte).
   */
  abstract ping(deviceId?: string): Observable<ExtensionPing>;

  /**
   * Transmet à l'extension le jeton de connexion émis par le serveur (`sessions-emettreJetonExtension`) :
   * elle s'y connecte avec le compte de l'app, sans mot de passe.
   */
  abstract connect(token: string, deviceId: string): Observable<ExtensionConnectResult>;

  /**
   * « Tarifer sur tous les extranets » : l'extension ouvre l'extranet de chaque assureur (une page web ne peut ouvrir
   * qu'un onglet par clic) et rattache chaque onglet au job du dossier. Ne lève jamais : un refus est un résultat.
   */
  abstract openExtranets(dossierId: string, extranets: ExtranetToOpen[]): Observable<ExtensionOpenResult>;
}

/** Extranet à ouvrir pour un assureur dont le job vient d'être écrit. */
export interface ExtranetToOpen {
  insurerId: string;
  url: string;
}

/** Assureurs dont l'extranet est ouvert, et ceux refusés par l'extension ; ou la raison de l'échec. */
export type ExtensionOpenResult =
  | { ok: true; opened: string[]; refused: string[] }
  | { ok: false; message: string };

/** Réponse brute de l'extension (PONG, CONNECTED, CONNECT_FAILED, EXTRANETS_OPENED ou OPEN_FAILED). */
interface ExtensionResponse {
  type?: string;
  version?: string;
  signedIn?: boolean;
  uid?: string | null;
  message?: string;
  opened?: string[];
  refused?: string[];
}

/** Surface de `chrome.runtime` utilisée depuis une page web (autorisée par `externally_connectable`). */
interface ChromeRuntime {
  sendMessage(extensionId: string, message: unknown, callback: (response?: ExtensionResponse) => void): void;
  lastError?: unknown;
}

/** Une extension absente peut ne jamais répondre : on conclut après ce délai. */
const PING_TIMEOUT_MS = 2000;
/** La connexion passe par Firebase Auth puis une function : délai plus large que le simple PING. */
const CONNECT_TIMEOUT_MS = 20_000;
const CONNECT_FAILED_MESSAGE = "L'extension n'a pas pu se connecter. Ouvrez-la et connectez-vous manuellement.";
/** Ouvrir les onglets est immédiat ; l'extension relit au plus le catalogue des assureurs. */
const OPEN_TIMEOUT_MS = 10_000;
export const OPEN_FAILED_MESSAGE =
  "L'extension n'a pas ouvert les extranets (absente ou trop ancienne : mettez-la à jour). Ouvrez-les un par un avec « Ouvrir l'extranet ».";

@Injectable()
export class ChromeExtensionProvider extends ExtensionProvider {
  ping(deviceId?: string): Observable<ExtensionPing> {
    const extensionId = environment.extensionId;
    if (!extensionId) {
      return of({ status: 'unconfigured' });
    }
    const runtime = chromeRuntime();
    // Chrome n'expose `chrome.runtime` à une page web que si une extension l'y autorise : son absence veut dire
    // « extension non installée » dans un navigateur Chromium, et « non supporté » ailleurs.
    if (!runtime?.sendMessage) {
      return of({ status: isChromium() ? 'absent' : 'unsupported' });
    }
    return send(runtime, extensionId, { type: 'PING', ...(deviceId ? { deviceId } : {}) }).pipe(
      map((response): ExtensionPing =>
        response?.type === 'PONG'
          ? { status: 'installed', version: response.version ?? '', signedIn: response.signedIn === true, uid: response.uid ?? null }
          : { status: 'absent' },
      ),
      timeout({ first: PING_TIMEOUT_MS, with: () => of<ExtensionPing>({ status: 'absent' }) }),
    );
  }

  connect(token: string, deviceId: string): Observable<ExtensionConnectResult> {
    const extensionId = environment.extensionId;
    const runtime = chromeRuntime();
    if (!extensionId || !runtime?.sendMessage) {
      return of({ ok: false, message: CONNECT_FAILED_MESSAGE });
    }
    return send(runtime, extensionId, { type: 'CONNECT', token, deviceId }).pipe(
      map((response): ExtensionConnectResult => {
        if (response?.type === 'CONNECTED') return { ok: true };
        return { ok: false, message: response?.type === 'CONNECT_FAILED' && response.message ? response.message : CONNECT_FAILED_MESSAGE };
      }),
      timeout({ first: CONNECT_TIMEOUT_MS, with: () => of<ExtensionConnectResult>({ ok: false, message: CONNECT_FAILED_MESSAGE }) }),
    );
  }

  openExtranets(dossierId: string, extranets: ExtranetToOpen[]): Observable<ExtensionOpenResult> {
    const extensionId = environment.extensionId;
    const runtime = chromeRuntime();
    if (!extensionId || !runtime?.sendMessage) {
      return of({ ok: false, message: OPEN_FAILED_MESSAGE });
    }
    return send(runtime, extensionId, { type: 'OPEN_EXTRANETS', dossierId, extranets }).pipe(
      map((response): ExtensionOpenResult => {
        if (response?.type === 'EXTRANETS_OPENED') {
          return { ok: true, opened: response.opened ?? [], refused: response.refused ?? [] };
        }
        return { ok: false, message: response?.type === 'OPEN_FAILED' && response.message ? response.message : OPEN_FAILED_MESSAGE };
      }),
      timeout({ first: OPEN_TIMEOUT_MS, with: () => of<ExtensionOpenResult>({ ok: false, message: OPEN_FAILED_MESSAGE }) }),
    );
  }
}

function chromeRuntime(): ChromeRuntime | undefined {
  return (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
}

/** Envoie un message à l'extension. Émet `undefined` si elle ne répond pas (absente, désactivée, erreur). */
function send(runtime: ChromeRuntime, extensionId: string, message: unknown): Observable<ExtensionResponse | undefined> {
  return new Observable<ExtensionResponse | undefined>(subscriber => {
    try {
      runtime.sendMessage(extensionId, message, response => {
        // `lastError` doit être lu dans le callback pour ne pas être signalé comme erreur non gérée.
        subscriber.next(runtime.lastError ? undefined : response);
        subscriber.complete();
      });
    } catch {
      subscriber.next(undefined);
      subscriber.complete();
    }
  });
}

function isChromium(): boolean {
  return /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);
}
