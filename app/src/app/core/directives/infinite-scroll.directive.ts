import { afterNextRender, DestroyRef, Directive, effect, ElementRef, inject, input, output, signal } from '@angular/core';

/**
 * Sentinelle de défilement infini : émet `reached` quand l'élément entre dans la fenêtre.
 * Si l'élément est toujours visible après un chargement (`count` change), elle réémet pour remplir l'écran.
 */
@Directive({ selector: '[appInfiniteScroll]' })
export class InfiniteScrollDirective {
  /** Plus rien à charger, ou chargement en cours : aucune émission. */
  readonly disabled = input(false, { alias: 'appInfiniteScrollDisabled' });
  /** Nombre d'éléments chargés : sert à relancer la vérification après chaque page. */
  readonly count = input(0, { alias: 'appInfiniteScrollCount' });
  readonly reached = output<void>();

  private readonly _visible = signal(false);

  constructor() {
    const element = inject(ElementRef).nativeElement as HTMLElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new IntersectionObserver(
        (entries) => this._visible.set(entries.some((entry) => entry.isIntersecting)),
        { rootMargin: '200px' },
      );
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    effect(() => {
      this.count();
      if (this._visible() && !this.disabled()) {
        this.reached.emit();
      }
    });
  }
}
