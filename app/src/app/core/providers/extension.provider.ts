import { Injectable } from '@angular/core';
import { Observable, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Résultat de la détection de l'extension Chrome.
 * `unsupported` : navigateur sans extensions Chrome (Firefox, Safari) · `unconfigured` : identifiant de l'extension
 * non renseigné dans l'environnement · `absent` : navigateur compatible, mais l'extension ne répond pas.
 */
export type ExtensionPing =
  | { status: 'installed'; version: string }
  | { status: 'absent' }
  | { status: 'unsupported' }
  | { status: 'unconfigured' };

/** Port « extension du navigateur » : l'app ne connaît que cette classe, jamais l'API `chrome`. */
export abstract class ExtensionProvider {
  abstract ping(): Observable<ExtensionPing>;
}

/** Surface de `chrome.runtime` utilisée depuis une page web (autorisée par `externally_connectable`). */
interface ChromeRuntime {
  sendMessage(extensionId: string, message: unknown, callback: (response?: { type?: string; version?: string }) => void): void;
  lastError?: unknown;
}

/** Une extension absente peut ne jamais répondre : on conclut après ce délai. */
const PING_TIMEOUT_MS = 2000;

@Injectable()
export class ChromeExtensionProvider extends ExtensionProvider {
  ping(): Observable<ExtensionPing> {
    const extensionId = environment.extensionId;
    if (!extensionId) {
      return of({ status: 'unconfigured' });
    }
    const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
    // Chrome n'expose `chrome.runtime` à une page web que si une extension l'y autorise : son absence veut dire
    // « extension non installée » dans un navigateur Chromium, et « non supporté » ailleurs.
    if (!runtime?.sendMessage) {
      return of({ status: isChromium() ? 'absent' : 'unsupported' });
    }
    return new Observable<ExtensionPing>(subscriber => {
      try {
        runtime.sendMessage(extensionId, { type: 'PING' }, response => {
          // `lastError` doit être lu dans le callback pour ne pas être signalé comme erreur non gérée.
          const failed = !!runtime.lastError || response?.type !== 'PONG';
          subscriber.next(failed ? { status: 'absent' } : { status: 'installed', version: response?.version ?? '' });
          subscriber.complete();
        });
      } catch {
        subscriber.next({ status: 'absent' });
        subscriber.complete();
      }
    }).pipe(timeout({ first: PING_TIMEOUT_MS, with: () => of<ExtensionPing>({ status: 'absent' }) }));
  }
}

function isChromium(): boolean {
  return /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);
}
