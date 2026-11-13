import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Carte du design system : surface blanche, bordure, rayon et ombre légère.
 * Titre facultatif (petites capitales) avec une zone d'actions à droite (`[cardActions]`), contenu projeté.
 *
 * ```html
 * <app-card heading="Portefeuille">
 *   <button cardActions mat-button>Exporter</button>
 *   …contenu…
 * </app-card>
 * ```
 */
@Component({
  selector: 'app-card',
  templateUrl: './card-presentation.component.html',
  styleUrl: './card-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.padded]': 'padded()',
    '[class.flush]': '!padded()',
  },
})
export class CardPresentationComponent {
  /** Titre de la carte (petites capitales), affiché dans un en-tête séparé du contenu. */
  readonly heading = input<string>();
  /** Sous-titre, sous le titre. */
  readonly subtitle = input<string>();
  /** Marge intérieure autour du contenu. `false` : contenu collé aux bords (tableau, liste). */
  readonly padded = input(true);
}
