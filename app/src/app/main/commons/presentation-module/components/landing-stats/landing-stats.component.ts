import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LANDING_PAGE_STRUCTURE } from '../landing-presentation/landing-page.structure';

/** Bandeau des chiffres clés de la page d'accueil. */
@Component({
  selector: 'app-landing-stats',
  templateUrl: './landing-stats.component.html',
  styleUrl: './landing-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingStatsComponent {
  readonly stats = input.required<(typeof LANDING_PAGE_STRUCTURE)['stats']>();
}
