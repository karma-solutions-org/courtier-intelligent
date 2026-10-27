/** Parcours en plusieurs étapes : où en est-on, la page est-elle chargée, est-ce la dernière étape ? */
import { FORBIDDEN_NAV_LABEL } from '@shared';

export interface StepHint {
  current: number | null;
  total: number | null;
}

const STEP_TEXT = /(?:etape|étape|step)\s*(\d+)\s*(?:\/|sur|of|de)\s*(\d+)/i;
const NEXT_BUTTON = /^(suivant|continuer|etape suivante|étape suivante|next|poursuivre|passer a l etape)/i;
const FINAL_BUTTON =
  /((obtenir|calculer|voir|decouvrir|découvrir|connaitre|connaître)\b.{0,25}(tarif|devis|prix|offre|cotisation))|^(valider|envoyer|souscrire|terminer|finaliser|confirmer)\b/i;
const LOADING = '[aria-busy="true"], .loading, .spinner, [class*="loader"], [class*="spinner"], [role="progressbar"]:not([aria-valuenow])';

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** Texte du bouton, sans flèche ni puce décorative au début (« > Continuer Devis » chez Oyat, « › Suivant »). */
const labelOf = (el: HTMLElement) => clean(el instanceof HTMLInputElement ? el.value : el.textContent).replace(/^[^\p{L}\p{N}]+/u, '');

/** Boutons visibles et actifs (et liens qui en jouent le rôle). */
function visibleButtons(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="button"], a[role="button"]')].filter(
    el => !el.hasAttribute('hidden') && !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled && labelOf(el) !== '',
  );
}

/** Texte des boutons visibles (et des liens qui en jouent le rôle). */
export function buttonLabels(doc: Document): string[] {
  return visibleButtons(doc).map(labelOf);
}

/**
 * Bouton « Suivant » de l'étape, s'il y en a un seul sans ambiguïté. Jamais un bouton qui lance le calcul, valide
 * ou engage le client (« Obtenir mon tarif », « Valider », « Continuer vers la souscription ») : le courtier le clique.
 */
export function findNextButton(doc: Document): HTMLElement | null {
  const candidates = visibleButtons(doc).filter(el => {
    const label = labelOf(el);
    return NEXT_BUTTON.test(label) && !FINAL_BUTTON.test(label) && !FORBIDDEN_NAV_LABEL.test(label);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

const SEARCH_BUTTON = /^(rechercher|recherche|chercher|trouver|valider la recherche|search)$/i;

/**
 * Bouton « Rechercher » du bloc qu'on vient de remplir (recherche du véhicule « Par caractéristique ») : parmi les
 * boutons de recherche, celui dont le bloc contient le plus de champs remplis. Chaque bloc s'arrête avant d'englober
 * un autre bouton de recherche. Égalité ou aucun champ rempli : `null`.
 */
export function findSearchButton(doc: Document, filled: readonly HTMLElement[]): HTMLElement | null {
  const buttons = visibleButtons(doc).filter(el => SEARCH_BUTTON.test(labelOf(el)) && !FORBIDDEN_NAV_LABEL.test(labelOf(el)));
  const scored = buttons.map(button => {
    let block: HTMLElement = button;
    for (let parent = button.parentElement; parent && !buttons.some(other => other !== button && parent!.contains(other)); parent = parent.parentElement) {
      block = parent;
    }
    return { button, count: filled.filter(el => block.contains(el)).length };
  });
  scored.sort((a, b) => b.count - a.count);
  const [best, second] = scored;
  return best && best.count > 0 && (!second || best.count > second.count) ? best.button : null;
}

/** Lignes de résultats d'une recherche (tableau visible à en-têtes) : `null` sans tableau de résultats. */
export function findResultRows(doc: Document): { headers: string[]; rows: HTMLTableRowElement[] } | null {
  for (const table of doc.querySelectorAll('table')) {
    if (table.closest('[hidden]')) continue;
    const headers = [...table.querySelectorAll('thead th, thead td')].map(cell => clean(cell.textContent));
    const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].filter(row => row.cells.length >= 2);
    if (headers.length >= 2 && rows.length > 0) return { headers, rows };
  }
  return findRadioResultRows(doc);
}

/**
 * Tableau sans <thead> (Oyat : liste de véhicules à boutons radio, en-tête dans une ligne ordinaire) : les lignes qui
 * portent un bouton radio sont les résultats, tant qu'aucune n'est déjà choisie.
 */
export function findRadioResultRows(doc: Document): { headers: string[]; rows: HTMLTableRowElement[] } | null {
  for (const table of doc.querySelectorAll('table')) {
    if (table.closest('[hidden]')) continue;
    const rows = [...table.querySelectorAll<HTMLTableRowElement>('tr')].filter(
      row => row.cells.length >= 3 && row.querySelector('input[type="radio"]'),
    );
    if (rows.length < 2 || rows.some(row => row.querySelector<HTMLInputElement>('input[type="radio"]')?.checked)) continue;
    const headerRow = [...table.querySelectorAll<HTMLTableRowElement>('tr')].find(row => !row.querySelector('input[type="radio"]') && row.cells.length >= 3);
    return { headers: [...(headerRow?.cells ?? [])].map(cell => clean(cell.textContent)), rows };
  }
  return null;
}

/**
 * Ligne de résultat à choisir : la plus proche de la valeur du véhicule au dossier (colonne « Valeur »), sinon la
 * première. Le courtier n'intervient pas : il faut un véhicule pour obtenir le tarif.
 */
export function pickResultRow(found: { headers: string[]; rows: HTMLTableRowElement[] }, vehicleValue: number | null, hint = ''): HTMLTableRowElement {
  // Modèle et version du dossier (carte grise) : la ligne qui en reprend le plus de mots l'emporte.
  const words = (text: string) => new Set(clean(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9+]+/).filter(w => w.length >= 3));
  const wanted = words(hint);
  if (wanted.size) {
    const score = (row: HTMLTableRowElement) => [...words(row.textContent ?? '')].filter(w => wanted.has(w)).length;
    const best = found.rows.reduce((a, b) => (score(b) > score(a) ? b : a));
    if (score(best) > 0) return best;
  }
  const column = found.headers.findIndex(header => /valeur|prix/i.test(header));
  if (vehicleValue === null || column < 0) return found.rows[0];
  const amount = (row: HTMLTableRowElement) => Number((row.cells[column]?.textContent ?? '').replace(/[^\d]/g, ''));
  const distance = (row: HTMLTableRowElement) => (amount(row) ? Math.abs(amount(row) - vehicleValue) : Infinity);
  return found.rows.reduce((best, row) => (distance(row) < distance(best) ? row : best));
}

/** Clique la ligne : son bouton, lien ou bouton radio s'il en a un, sinon la ligne elle-même. */
export function clickRow(row: HTMLTableRowElement): void {
  const target = row.querySelector<HTMLElement>('input[type="radio"], input[type="checkbox"], button, a') ?? row.cells[0] ?? row;
  target.click();
  if (target !== row) row.click();
}

const ERROR_SELECTOR =
  '[aria-invalid="true"], [role="alert"], .error, .errors, .invalid-feedback, .field-error, .form-error, [class*="error-message"]';

/** L'extranet affiche-t-il une erreur de saisie (champ invalide, message d'alerte) ? */
export function hasValidationErrors(doc: Document): boolean {
  return [...doc.querySelectorAll<HTMLElement>(ERROR_SELECTOR)].some(
    el =>
      !el.closest('[hidden]') &&
      doc.defaultView?.getComputedStyle(el).display !== 'none' &&
      (el.getAttribute('aria-invalid') === 'true' || clean(el.textContent) !== ''),
  );
}

/**
 * Étape courante et nombre d'étapes, d'après l'indicateur de l'extranet : « Étape 2 sur 5 », un élément
 * `aria-current="step"` dans une liste, ou une barre de progression. `null` quand la page n'en dit rien.
 */
export function detectStepHint(doc: Document): StepHint {
  const textMatch = STEP_TEXT.exec(clean(doc.body?.textContent));
  if (textMatch) return { current: Number(textMatch[1]), total: Number(textMatch[2]) };

  const currentItem = doc.querySelector('[aria-current="step"]');
  const list = currentItem?.parentElement;
  if (currentItem && list && list.children.length > 1) {
    return { current: [...list.children].indexOf(currentItem) + 1, total: list.children.length };
  }
  const progress = doc.querySelector('[role="progressbar"][aria-valuenow][aria-valuemax]');
  if (progress) {
    const now = Number(progress.getAttribute('aria-valuenow'));
    const max = Number(progress.getAttribute('aria-valuemax'));
    if (Number.isFinite(now) && Number.isFinite(max) && max > 1 && max <= 20 && Number.isInteger(now)) return { current: now, total: max };
  }
  return { current: null, total: null };
}

/**
 * Dernière étape ? Oui si l'indicateur le dit, ou si la page propose de lancer le calcul (« Obtenir mon tarif »)
 * sans proposer de passer à l'étape suivante. L'extension ne clique jamais sur ce bouton final : le courtier soumet lui-même.
 */
export function isFinalStep(doc: Document, hint: StepHint): boolean {
  if (hint.current !== null && hint.total !== null) return hint.current >= hint.total;
  const labels = buttonLabels(doc);
  if (labels.some(label => NEXT_BUTTON.test(label))) return false;
  return labels.some(label => FINAL_BUTTON.test(label));
}

/** Un chargement est-il en cours (indicateur d'attente visible) ? */
export function isLoading(doc: Document): boolean {
  return [...doc.querySelectorAll(LOADING)].some(el => !el.hasAttribute('hidden') && doc.defaultView?.getComputedStyle(el).display !== 'none');
}

/**
 * Attend que la page ait fini de charger : plus aucune modification du DOM pendant `quietMs` et aucun indicateur
 * d'attente. Renvoie `false` si la page n'est pas stable après `timeoutMs` (on continue quand même).
 */
export function waitForSettled(doc: Document, { quietMs = 400, timeoutMs = 8000 }: { quietMs?: number; timeoutMs?: number } = {}): Promise<boolean> {
  return new Promise(resolve => {
    let quietTimer: ReturnType<typeof setTimeout>;
    const done = (settled: boolean) => {
      clearTimeout(quietTimer);
      clearTimeout(deadline);
      observer.disconnect();
      resolve(settled);
    };
    const armQuietTimer = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => (isLoading(doc) ? armQuietTimer() : done(true)), quietMs);
    };
    const observer = new MutationObserver(armQuietTimer);
    observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    const deadline = setTimeout(() => done(false), timeoutMs);
    armQuietTimer();
  });
}

/**
 * Le formulaire a-t-il changé d'étape ? Oui si l'indicateur de l'extranet a changé ; sans indicateur, si les champs
 * ont été en grande partie remplacés (un champ qui apparaît sous une réponse ne change pas d'étape).
 */
export function isNewStep(previous: { keys: string[]; hint: StepHint }, next: { keys: string[]; hint: StepHint }): boolean {
  if (previous.hint.current !== null && next.hint.current !== null) return previous.hint.current !== next.hint.current;
  if (previous.keys.length === 0) return next.keys.length > 0;
  const kept = previous.keys.filter(key => next.keys.includes(key)).length;
  return kept / previous.keys.length < 0.5;
}
