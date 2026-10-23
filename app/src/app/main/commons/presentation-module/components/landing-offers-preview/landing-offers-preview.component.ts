import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LANDING_PAGE_STRUCTURE } from '../landing-presentation/landing-page.structure';

/** Aperçu (décoratif) du comparatif d'offres de la page d'accueil. */
@Component({
  selector: 'app-landing-offers-preview',
  imports: [MatIconModule],
  templateUrl: './landing-offers-preview.component.html',
  styleUrl: './landing-offers-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingOffersPreviewComponent {
  readonly preview = input.required<(typeof LANDING_PAGE_STRUCTURE)['preview']>();
}
