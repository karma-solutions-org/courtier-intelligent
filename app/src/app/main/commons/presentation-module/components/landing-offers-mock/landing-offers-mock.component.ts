import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LANDING_PAGE_STRUCTURE } from '../landing-presentation/landing-page.structure';

/** Aperçu (décoratif) du comparatif d'offres de la page d'accueil. */
@Component({
  selector: 'app-landing-offers-mock',
  imports: [MatIconModule],
  templateUrl: './landing-offers-mock.component.html',
  styleUrl: './landing-offers-mock.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingOffersMockComponent {
  readonly mock = input.required<(typeof LANDING_PAGE_STRUCTURE)['mock']>();
}
