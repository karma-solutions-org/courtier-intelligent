import { ExtensionMessage } from '../shared/messages';

/** Compte les champs de formulaire visibles : première brique de l'analyse des extranets (Epic E7). */
function countVisibleFields(): number {
  return [...document.querySelectorAll<HTMLElement>('input, select, textarea')].filter(
    el => !(el instanceof HTMLInputElement && el.type === 'hidden') && el.offsetParent !== null,
  ).length;
}

const message: ExtensionMessage = {
  type: 'PAGE_DETECTED',
  origin: location.origin,
  title: document.title,
  fieldCount: countVisibleFields(),
};

chrome.runtime.sendMessage(message).catch(() => {
  // Le service worker peut être en cours de redémarrage : rien à faire.
});
