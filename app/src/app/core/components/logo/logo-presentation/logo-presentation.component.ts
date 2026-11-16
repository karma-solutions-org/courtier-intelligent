import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Logo Courtier Intelligent : symbole seul, ou symbole + nom sur deux lignes. */
@Component({
  selector: 'app-logo',
  templateUrl: './logo-presentation.component.html',
  styleUrl: './logo-presentation.component.scss',
  host: { role: 'img', 'aria-label': 'Courtier Intelligent' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogoPresentationComponent {
  /** Hauteur du symbole en pixels. */
  readonly size = input(40);
  readonly withName = input(true);
  /** Version blanche, pour les fonds sombres. */
  readonly inverse = input(false);
}
