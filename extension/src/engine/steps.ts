/** Parcours en plusieurs étapes : où en est-on, la page est-elle chargée, est-ce la dernière étape ? */

export interface StepHint {
  current: number | null;
  total: number | null;
}

const STEP_TEXT = /(?:etape|étape|step)\s*(\d+)\s*(?:\/|sur|of|de)\s*(\d+)/i;
const NEXT_BUTTON = /^(suivant|continuer|etape suivante|étape suivante|next|poursuivre|passer a l etape|valider cette etape|valider cette étape)/i;
const FINAL_BUTTON =
  /((obtenir|calculer|voir|decouvrir|découvrir|connaitre|connaître)\b.{0,25}(tarif|devis|prix|offre|cotisation))|^(valider|envoyer|souscrire|terminer|finaliser|confirmer)\b/i;
const LOADING = '[aria-busy="true"], .loading, .spinner, [class*="loader"], [class*="spinner"], [role="progressbar"]:not([aria-valuenow])';

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** Texte des boutons visibles (et des liens qui en jouent le rôle). */
export function buttonLabels(doc: Document): string[] {
  return [...doc.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="button"], a[role="button"]')]
    .filter(el => !el.hasAttribute('hidden') && !(el as HTMLButtonElement).disabled)
    .map(el => clean(el instanceof HTMLInputElement ? el.value : el.textContent))
    .filter(Boolean);
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
 * sans proposer de passer à l'étape suivante. L'extension ne clique jamais sur ces boutons : le courtier soumet lui-même.
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
