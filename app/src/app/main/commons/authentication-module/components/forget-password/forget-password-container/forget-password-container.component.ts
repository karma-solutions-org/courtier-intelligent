import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { CommonRouteContainerModel } from '../../../../../../core/routing/common-routes/common-route-container.model';
import { AuthStore } from '../../../store/auth.store';
import { ForgetPasswordPresentationComponent } from '../forget-password-presentation/forget-password-presentation.component';

@Component({
  selector: 'app-forget-password-container',
  imports: [ForgetPasswordPresentationComponent],
  template: `
    <app-forget-password-presentation
      [isPending]="authStore.isPending()"
      [error]="authStore.error()"
      [emailSent]="authStore.resetEmailSent()"
      [signinUrl]="signinUrl"
      (submitted)="authStore.sendPasswordReset($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgetPasswordContainerComponent implements OnInit {
  protected readonly authStore = inject(AuthStore);
  protected readonly signinUrl = CommonRouteContainerModel.SIGNIN_ROUTE.url;

  ngOnInit(): void {
    this.authStore.resetStatus();
  }
}
