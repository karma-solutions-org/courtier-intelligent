import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { CommonRouteContainerModel } from '../../../../../../core/routing/common-routes/common-route-container.model';
import { AuthStore } from '../../../store/auth.store';
import { InvitationStore } from '../../../store/invitation.store';
import { AcceptInvitationPresentationComponent } from '../accept-invitation-presentation/accept-invitation-presentation.component';

/** Page /invitation?cabinet=...&invitation=... ouverte depuis l'email d'invitation. */
@Component({
  selector: 'app-accept-invitation-container',
  imports: [AcceptInvitationPresentationComponent],
  providers: [InvitationStore],
  template: `
    <app-accept-invitation-presentation
      [isValidLink]="!!cabinet() && !!invitation()"
      [userEmail]="authStore.user()?.email ?? null"
      [isPending]="invitationStore.isPending()"
      [error]="invitationStore.error()"
      [signinUrl]="signinUrl"
      [signupUrl]="signupUrl"
      (accepted)="invitationStore.accept({ cabinetId: cabinet(), invitationId: invitation() })"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcceptInvitationContainerComponent {
  protected readonly authStore = inject(AuthStore);
  protected readonly invitationStore = inject(InvitationStore);
  private readonly _router = inject(Router);

  /** Paramètres de l'URL, liés par withComponentInputBinding. */
  readonly cabinet = input('');
  readonly invitation = input('');

  protected readonly signinUrl = CommonRouteContainerModel.SIGNIN_ROUTE.url;
  protected readonly signupUrl = CommonRouteContainerModel.SIGNUP_ROUTE.url;

  constructor() {
    // Après connexion ou inscription, revenir sur cette invitation.
    effect(() => {
      if (!this.authStore.isAuthenticated()) {
        this.authStore.setRedirectUrl(this._router.url);
      }
    });
  }
}
