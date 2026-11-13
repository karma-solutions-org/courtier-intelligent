import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LANDING_PAGE_STRUCTURE } from '../landing-page.structure';

/** Aperçu (décoratif) du comparatif d'offres de la page d'accueil. */
@Component({
  selector: 'app-landing-offers-mock',
  imports: [MatIconModule],
  templateUrl: './landing-offers-mock-presentation.component.html',
  styleUrl: './landing-offers-mock-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingOffersMockPresentationComponent {
  readonly mock = input.required<(typeof LANDING_PAGE_STRUCTURE)['mock']>();
}
