import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LANDING_PAGE_STRUCTURE } from '../landing-page.structure';

/** Bandeau des chiffres clés de la page d'accueil. */
@Component({
  selector: 'app-landing-stats',
  templateUrl: './landing-stats-presentation.component.html',
  styleUrl: './landing-stats-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingStatsPresentationComponent {
  readonly stats = input.required<(typeof LANDING_PAGE_STRUCTURE)['stats']>();
}
