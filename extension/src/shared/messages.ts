/** Messages internes à l'extension (content script ↔ service worker ↔ side panel). */
export type ExtensionMessage =
  | { type: 'PAGE_DETECTED'; origin: string; title: string; fieldCount: number }
  | { type: 'GET_ACTIVE_PAGE' };

export interface ActivePage {
  origin: string;
  title: string;
  fieldCount: number;
}

/** Messages reçus depuis l'app Angular (chrome.runtime.onMessageExternal). */
export type ExternalMessage = { type: 'PING' } | { type: 'AUTH'; token: string };
