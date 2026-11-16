/**
 * Barre flottante posée sur l'extranet pendant un remplissage : mettre l'extension en pause / la reprendre, et
 * sauvegarder le tarif affiché (le courtier peut changer de formule, annuel ↔ mensuel, et sauvegarder à nouveau).
 *
 * Shadow DOM FERMÉ : invisible pour l'analyse du formulaire (deepQueryAll ne voit que les shadowRoot ouverts) et pour
 * la lecture du tarif (textContent de la page), à l'abri des styles de l'extranet.
 */
export interface FloatingBarActions {
  pause(): void;
  resume(): void;
  /** Lit et enregistre le tarif affiché ; `false` si la lecture n'a pas pu être lancée. */
  save(): Promise<boolean>;
}

export interface FloatingBar {
  setPaused(paused: boolean): void;
  /** Le bouton « Sauvegarder le tarif » n'apparaît que lorsqu'un tarif est affiché. */
  setSaveVisible(visible: boolean): void;
  /** Message court sous les boutons (« Tarif enregistré », « En pause »…). */
  setStatus(text: string): void;
  destroy(): void;
}

const HOST_ATTRIBUTE = 'data-courtier-intelligent-bar';

/** Logo Courtier Intelligent (public/logo/logo-symbol.svg), en clair pour le fond sombre de la barre. */
const LOGO =
  '<svg viewBox="0 0 100 120" aria-hidden="true"><path d="M86 36V24L50 8 14 24v42c0 20 14 34 36 44 13-6 23-13 29-23" fill="none" stroke="#fff" stroke-width="13" stroke-linejoin="round"/><rect x="44" y="48" width="12" height="44" fill="#fff"/><rect x="44" y="30" width="12" height="12" fill="#F24104"/></svg>';

const ICONS = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/></svg>',
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/></svg>',
};

const STYLE = `
  :host { all: initial; }
  .bar {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    display: flex; align-items: center; gap: 2px; height: 36px; padding: 0 4px 0 2px;
    background: rgba(15, 27, 61, .92); color: #fff; border-radius: 999px;
    box-shadow: 0 4px 16px rgba(15, 27, 61, .28), 0 0 0 1px rgba(255, 255, 255, .08) inset;
    backdrop-filter: blur(6px);
    font: 500 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .grip { display: flex; align-items: center; height: 100%; padding: 0 2px 0 6px; color: #7d8bb3; cursor: grab; }
  .grip:active { cursor: grabbing; }
  .logo { display: flex; align-items: center; margin: 0 6px 0 2px; }
  .logo svg { width: 14px; height: 17px; }
  .save.hidden { display: none; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #34d399; margin: 0 6px 0 2px; box-shadow: 0 0 0 3px rgba(52, 211, 153, .18); }
  .bar.paused .dot { background: #fbbf24; box-shadow: 0 0 0 3px rgba(251, 191, 36, .18); }
  .sep { width: 1px; height: 18px; background: rgba(255, 255, 255, .14); margin: 0 4px; }
  button {
    all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 50%; cursor: pointer; color: #dbe4ff; transition: background .15s, color .15s;
  }
  button:hover { background: rgba(255, 255, 255, .12); color: #fff; }
  button:focus-visible { outline: 2px solid #8fb3ff; outline-offset: 1px; }
  button.save { color: #fff; background: #2f6bff; }
  button.save:hover { background: #4a7fff; }
  button[disabled] { opacity: .5; cursor: default; }
  button.busy svg { animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; } }
  svg { width: 15px; height: 15px; fill: currentColor; }
  .status {
    max-width: 0; overflow: hidden; white-space: nowrap; color: #c7d2f0;
    transition: max-width .25s ease, margin .25s ease; margin: 0;
  }
  .status.shown { max-width: 260px; margin: 0 6px 0 4px; }
`;

/** Pose la barre sur la page (une seule par page) ; `destroy` la retire. */
export function createFloatingBar(doc: Document, actions: FloatingBarActions): FloatingBar {
  doc.querySelector(`[${HOST_ATTRIBUTE}]`)?.remove();
  const host = doc.createElement('div');
  host.setAttribute(HOST_ATTRIBUTE, '');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="bar" role="toolbar" aria-label="Courtier Intelligent">
      <span class="grip" title="Déplacer">${ICONS.grip}</span>
      <span class="logo" title="Courtier Intelligent">${LOGO}</span>
      <span class="dot" aria-hidden="true"></span>
      <button data-action="pause" type="button"></button>
      <button class="save hidden" data-action="save" type="button" title="Sauvegarder le tarif affiché" aria-label="Sauvegarder le tarif affiché">${ICONS.save}</button>
      <span class="status" role="status" aria-live="polite"></span>
    </div>`;
  (doc.body ?? doc.documentElement).appendChild(host);

  const bar = root.querySelector<HTMLElement>('.bar')!;
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
  const saveButton = root.querySelector<HTMLButtonElement>('[data-action="save"]')!;
  const status = root.querySelector<HTMLElement>('.status')!;
  let paused = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  /** Message bref à côté des boutons, qui se replie seul (la barre reste fine). */
  const say = (text: string, sticky = false) => {
    status.textContent = text;
    status.classList.toggle('shown', text !== '');
    clearTimeout(hideTimer);
    if (!sticky && text) hideTimer = setTimeout(() => status.classList.remove('shown'), 4000);
  };

  const renderPause = () => {
    const label = paused ? 'Reprendre le remplissage' : 'Mettre le remplissage en pause';
    pauseButton.innerHTML = paused ? ICONS.play : ICONS.pause;
    pauseButton.title = label;
    pauseButton.setAttribute('aria-label', label);
    bar.classList.toggle('paused', paused);
  };
  renderPause();

  pauseButton.addEventListener('click', () => {
    paused = !paused;
    renderPause();
    if (paused) {
      actions.pause();
      say('En pause', true);
    } else {
      actions.resume();
      say('Repris');
    }
  });

  saveButton.addEventListener('click', () => {
    saveButton.disabled = true;
    saveButton.classList.add('busy');
    say('Lecture du tarif…', true);
    void actions
      .save()
      .then(ok => {
        if (!ok) say('Lecture impossible');
      })
      .finally(() => {
        saveButton.disabled = false;
        saveButton.classList.remove('busy');
      });
  });

  // Déplaçable par la poignée : la barre ne doit jamais cacher un bouton de l'extranet.
  const grip = root.querySelector<HTMLElement>('.grip')!;
  grip.addEventListener('pointerdown', event => {
    event.preventDefault();
    const rect = bar.getBoundingClientRect();
    const dx = event.clientX - rect.left;
    const dy = event.clientY - rect.top;
    const move = (e: PointerEvent) => {
      bar.style.left = `${Math.max(0, Math.min(e.clientX - dx, innerWidth - rect.width))}px`;
      bar.style.top = `${Math.max(0, Math.min(e.clientY - dy, innerHeight - rect.height))}px`;
      bar.style.right = 'auto';
      bar.style.bottom = 'auto';
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });

  return {
    setPaused(next) {
      paused = next;
      renderPause();
    },
    setSaveVisible(visible) {
      saveButton.classList.toggle('hidden', !visible);
    },
    setStatus(text) {
      say(text);
    },
    destroy() {
      host.remove();
    },
  };
}
