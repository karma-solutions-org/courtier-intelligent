import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { CommonRouteContainerModel } from '../../../../../../core/routing/common-routes/common-route-container.model';
import { AuthStore } from '../../../store/auth.store';
import { SignupPresentationComponent } from '../signup-presentation/signup-presentation.component';

@Component({
  selector: 'app-signup-container',
  imports: [SignupPresentationComponent],
  template: `
    <app-signup-presentation
      [isPending]="authStore.isPending()"
      [error]="authStore.error()"
      [signinUrl]="signinUrl"
      (submitted)="authStore.signUp($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupContainerComponent implements OnInit {
  protected readonly authStore = inject(AuthStore);
  protected readonly signinUrl = CommonRouteContainerModel.SIGNIN_ROUTE.url;

  ngOnInit(): void {
    this.authStore.resetStatus();
  }
}
