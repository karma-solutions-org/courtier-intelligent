import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LANDING_PAGE_STRUCTURE } from '../landing-page.structure';

/** Aperçu (décoratif) du comparatif d'offres de la page d'accueil. */
@Component({
  selector: 'app-landing-offers-preview',
  imports: [MatIconModule],
  templateUrl: './landing-offers-preview-presentation.component.html',
  styleUrl: './landing-offers-preview-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingOffersPreviewPresentationComponent {
  readonly preview = input.required<(typeof LANDING_PAGE_STRUCTURE)['preview']>();
}
