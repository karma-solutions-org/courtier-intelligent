import { ActivePage, ExtensionMessage } from '../shared/messages';

const originEl = document.getElementById('page-origin')!;
const fieldsEl = document.getElementById('page-fields')!;
document.getElementById('version')!.textContent = `Version ${chrome.runtime.getManifest().version}`;

async function refreshActivePage(): Promise<void> {
  const message: ExtensionMessage = { type: 'GET_ACTIVE_PAGE' };
  const page = (await chrome.runtime.sendMessage(message)) as ActivePage | null;
  if (!page) {
    originEl.textContent = '—';
    fieldsEl.textContent = 'Aucune page analysée sur cet onglet.';
    return;
  }
  originEl.textContent = page.origin;
  fieldsEl.textContent = `${page.fieldCount} champ${page.fieldCount > 1 ? 's' : ''} de formulaire détecté${page.fieldCount > 1 ? 's' : ''}`;
}

// Mise à jour quand l'onglet actif change ou termine son chargement.
chrome.tabs.onActivated.addListener(() => refreshActivePage());
chrome.tabs.onUpdated.addListener((_tabId, info) => {
  if (info.status === 'complete') setTimeout(refreshActivePage, 300);
});

refreshActivePage();
