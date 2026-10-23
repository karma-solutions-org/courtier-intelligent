/**
 * Simulateur d'extranet pour les tests de parcours : une suite de pages (HTML relevé sur l'extranet réel) qui se
 * comporte comme l'application de l'assureur. Chaque extranet le configure dans son `fixture.ts` ; le comportement
 * (refus de « Suivant », boutons bascule, ajout de ligne) est commun et testé une fois.
 */

export interface SimulatedPage {
  /** Nom court de la page (« vehicule », « declarations »…), pour les attentes du test. */
  name: string;
  html: string;
}

export interface ExtranetSimulatorConfig {
  pages: readonly SimulatedPage[];
  /** HTML autour du formulaire, présent sur toutes les pages (menu, volet de synthèse…). */
  chrome?: string;
  /** HTML du bouton « Suivant » ajouté à chaque page sauf la dernière ; doit contenir un élément `nextSelector`. */
  nextButton: string;
  nextSelector: string;
  /**
   * Sélecteur des questions obligatoires encore sans réponse : s'il en reste une, « Suivant » est refusé (l'extranet
   * reste sur la page), comme le font les extranets qui ne marquent leurs champs obligatoires qu'à la validation.
   */
  unansweredSelector?: string;
  /** Boutons bascule : un groupe dont un bouton `aria-pressed` est cliqué devient répondu. */
  toggleGroupSelector?: string;
  /** Classe ôtée / ajoutée au groupe quand il reçoit une réponse (Angular : ng-invalid → ng-valid). */
  toggleAnsweredClass?: { remove: string; add: string };
  /** « Ajouter une ligne » : élément cliquable, et ligne ajoutée au `tbody` du tableau de la page (n = rang). */
  addRow?: { selector: string; row: (n: number) => string };
  /** Délai de chargement d'une page après « Suivant » (application d'une seule page). */
  loadMs?: number;
}

export interface ExtranetSimulator {
  /** Nom de la page affichée. */
  page(): string;
  /** Pages traversées, dans l'ordre. */
  readonly visited: string[];
  /** Pages dont « Suivant » a été refusé. */
  readonly refused: string[];
  /** Relevés faits juste avant chaque changement de page (voir `onLeave`). */
  readonly snapshots: Record<string, unknown>;
  /** Fonction appelée au clic sur « Suivant », avant le changement de page : relève ce qui a été rempli. */
  onLeave(record: (page: string, form: HTMLElement) => Record<string, unknown>): void;
}

/** Monte le simulateur dans `doc`. */
export function mountExtranet(doc: Document, config: ExtranetSimulatorConfig): ExtranetSimulator {
  let index = 0;
  let recorder: ((page: string, form: HTMLElement) => Record<string, unknown>) | null = null;
  const visited: string[] = [];
  const refused: string[] = [];
  const snapshots: Record<string, unknown> = {};
  doc.body.innerHTML = `<main><form id="sim-form" novalidate></form></main>${config.chrome ?? ''}`;
  const form = doc.getElementById('sim-form')!;

  const render = () => {
    const page = config.pages[index];
    visited.push(page.name);
    form.innerHTML = page.html + (index < config.pages.length - 1 ? config.nextButton : '');
  };

  doc.body.addEventListener('click', event => {
    const target = event.target as Element;
    const toggle = config.toggleGroupSelector ? target.closest('button[aria-pressed]') : null;
    const group = toggle?.closest(config.toggleGroupSelector!);
    if (toggle && group) {
      group.querySelectorAll('button[aria-pressed]').forEach(button => button.setAttribute('aria-pressed', String(button === toggle)));
      if (config.toggleAnsweredClass) {
        group.classList.remove(config.toggleAnsweredClass.remove);
        group.classList.add(config.toggleAnsweredClass.add);
      }
      return;
    }
    if (config.addRow && target.closest(config.addRow.selector)) {
      const body = form.querySelector('tbody');
      body?.insertAdjacentHTML('beforeend', config.addRow.row(body.rows.length + 1));
      return;
    }
    if (target.closest(config.nextSelector)) {
      event.preventDefault();
      const name = config.pages[index].name;
      if (config.unansweredSelector && form.querySelector(config.unansweredSelector)) {
        refused.push(name);
        return;
      }
      if (recorder) for (const [key, value] of Object.entries(recorder(name, form))) snapshots[`${name}:${key}`] = value;
      setTimeout(() => {
        index = Math.min(index + 1, config.pages.length - 1);
        render();
      }, config.loadMs ?? 30);
    }
  });

  render();
  return {
    page: () => config.pages[index].name,
    visited,
    refused,
    snapshots,
    onLeave: record => void (recorder = record),
  };
}
