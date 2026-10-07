import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Logo Courtier Intelligent : symbole seul, ou symbole + nom sur deux lignes. */
@Component({
  selector: 'app-logo',
  template: `
    <img
      class="symbol"
      [src]="inverse() ? 'logo/logo-symbol-white.svg' : 'logo/logo-symbol.svg'"
      [style.height.px]="size()"
      alt=""
    />
    @if (withName()) {
      <span class="name" [class.inverse]="inverse()" [style.font-size.px]="size() * 0.4">Courtier<br />Intelligent</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.6em;
    }

    .symbol {
      display: block;
      width: auto;
    }

    .name {
      font-weight: 700;
      line-height: 1.05;
      letter-spacing: -0.01em;
      color: #00082b;
    }

    .inverse {
      color: #fff;
    }
  `,
  host: { role: 'img', 'aria-label': 'Courtier Intelligent' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogoComponent {
  /** Hauteur du symbole en pixels. */
  readonly size = input(40);
  readonly withName = input(true);
  /** Version blanche, pour les fonds sombres. */
  readonly inverse = input(false);
}
