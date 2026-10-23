import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeForm } from '../engine/analyzer';
import { findNextButton } from '../engine/steps';
import { createFloatingBar } from './floating-bar';

/** La racine fermée n'est pas accessible depuis la page : on la récupère à sa création, pour les tests seulement. */
function mountBar(actions = { pause: vi.fn(), resume: vi.fn(), save: vi.fn(async () => true) }) {
  let root: ShadowRoot | null = null;
  const original = Element.prototype.attachShadow;
  const spy = vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init) {
    root = original.call(this, init);
    return root;
  });
  const bar = createFloatingBar(document, actions);
  spy.mockRestore();
  const button = (action: string) => root!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  return { bar, actions, button, status: () => root!.querySelector('.status')!.textContent };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('barre flottante', () => {
  it('Pause puis Reprendre appellent l’extension et changent le bouton', () => {
    const { actions, button, status } = mountBar();
    button('pause').click();
    expect(actions.pause).toHaveBeenCalledOnce();
    expect(button('pause').getAttribute('aria-label')).toContain('Reprendre');
    expect(status()).toContain('En pause');
    button('pause').click();
    expect(actions.resume).toHaveBeenCalledOnce();
    expect(button('pause').getAttribute('aria-label')).toContain('pause');
  });

  it('Sauvegarder n’apparaît que lorsqu’un tarif est affiché', () => {
    const { bar, button } = mountBar();
    expect(button('save').classList.contains('hidden')).toBe(true);
    bar.setSaveVisible(true);
    expect(button('save').classList.contains('hidden')).toBe(false);
  });

  it('Sauvegarder lance la lecture du tarif', async () => {
    const { actions, button, status } = mountBar();
    button('save').click();
    expect(actions.save).toHaveBeenCalledOnce();
    expect(status()).toContain('Lecture du tarif');
    expect(button('save').textContent).toBe('');
  });

  it('une seule barre par page, retirée par destroy', () => {
    mountBar();
    const { bar } = mountBar();
    expect(document.querySelectorAll('[data-courtier-intelligent-bar]')).toHaveLength(1);
    bar.destroy();
    expect(document.querySelectorAll('[data-courtier-intelligent-bar]')).toHaveLength(0);
  });

  it('invisible pour l’analyse du formulaire et la recherche du bouton « Suivant »', () => {
    document.body.innerHTML = '<form><label for="n">Nom</label><input id="n" /><button type="button">Suivant</button></form>';
    mountBar();
    expect(analyzeForm(document).fields).toHaveLength(1);
    expect(findNextButton(document)?.textContent).toBe('Suivant');
    expect(document.body.textContent).not.toContain('Sauvegarder');
  });
});
