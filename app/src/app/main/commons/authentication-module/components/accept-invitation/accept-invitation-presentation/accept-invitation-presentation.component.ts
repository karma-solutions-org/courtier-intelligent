import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { LogoPresentationComponent } from '../../../../../../core/components/logo/logo-presentation/logo-presentation.component';
import { ACCEPT_INVITATION_PAGE_STRUCTURE } from './accept-invitation-page.structure';

@Component({
  selector: 'app-accept-invitation-presentation',
  imports: [RouterLink, MatButtonModule, MatProgressSpinnerModule, LogoPresentationComponent],
  templateUrl: './accept-invitation-presentation.component.html',
  styleUrls: ['../../auth-layout.scss', './accept-invitation-presentation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcceptInvitationPresentationComponent {
  readonly isValidLink = input(true);
  readonly userEmail = input<string | null>(null);
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  readonly wrongAccount = input(false);
  readonly signinUrl = input.required<string>();
  readonly signupUrl = input.required<string>();
  readonly accepted = output<void>();
  readonly switchAccount = output<void>();

  protected readonly structure = ACCEPT_INVITATION_PAGE_STRUCTURE;
}
