import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../../../core/components/logo/logo.component';
import { LANDING_PAGE_STRUCTURE } from './landing-page.structure';

@Component({
  selector: 'app-landing-presentation',
  imports: [RouterLink, MatButtonModule, MatIconModule, LogoComponent],
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
