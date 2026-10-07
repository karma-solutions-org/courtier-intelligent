import { ActivePage, ExtensionMessage, ExternalMessage } from '../shared/messages';

// Un clic sur l'icône de l'extension ouvre le side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

/** Dernière page analysée par onglet. */
const pagesByTab = new Map<number, ActivePage>();

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  switch (message.type) {
    case 'PAGE_DETECTED':
      if (sender.tab?.id !== undefined) {
        pagesByTab.set(sender.tab.id, { origin: message.origin, title: message.title, fieldCount: message.fieldCount });
      }
      return false;

    case 'GET_ACTIVE_PAGE':
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        sendResponse(tab?.id !== undefined ? (pagesByTab.get(tab.id) ?? null) : null);
      });
      return true; // réponse asynchrone
  }
});

chrome.tabs.onRemoved.addListener(tabId => pagesByTab.delete(tabId));

// Messages de l'app Angular (domaines autorisés dans manifest.json → externally_connectable).
// L'app ne transmet aucun identifiant : l'extension a sa propre connexion Firebase (Epic E6).
chrome.runtime.onMessageExternal.addListener((message: ExternalMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'PING':
      sendResponse({ type: 'PONG', version: chrome.runtime.getManifest().version });
      return false;
  }
});
