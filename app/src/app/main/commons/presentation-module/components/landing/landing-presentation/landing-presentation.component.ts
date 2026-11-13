import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { LogoPresentationComponent } from '../../../../../../core/components/logo/logo-presentation/logo-presentation.component';
import { LandingExtensionPanelPresentationComponent } from '../landing-extension-panel-presentation/landing-extension-panel-presentation.component';
import { LandingStatsPresentationComponent } from '../landing-stats-presentation/landing-stats-presentation.component';
import { LandingOffersMockPresentationComponent } from '../landing-offers-mock-presentation/landing-offers-mock-presentation.component';
import { LANDING_PAGE_STRUCTURE } from '../landing-page.structure';

@Component({
  selector: 'app-landing-presentation',
  imports: [RouterLink, MatButtonModule, MatIconModule, LogoPresentationComponent, LandingOffersMockPresentationComponent, LandingExtensionPanelPresentationComponent, LandingStatsPresentationComponent],
  templateUrl: './landing-presentation.component.html',
  styleUrl: './landing-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPresentationComponent {
  readonly isAuthenticated = input(false);
  readonly signinUrl = input.required<string>();
  readonly signupUrl = input.required<string>();
  readonly homeUrl = input.required<string>();

  protected readonly structure = LANDING_PAGE_STRUCTURE;
}
