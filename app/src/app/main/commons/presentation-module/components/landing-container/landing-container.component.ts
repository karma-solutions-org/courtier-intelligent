import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonRouteContainerModel } from '../../../../../core/routing/common-routes/common-route-container.model';
import { AuthStore } from '../../../authentication-module/store/auth.store';
import { LandingPresentationComponent } from '../landing-presentation/landing-presentation.component';

@Component({
  selector: 'app-landing-container',
  imports: [LandingPresentationComponent],
  template: `
    <app-landing-presentation
      [isAuthenticated]="authStore.isAuthenticated()"
      [signinUrl]="signinUrl"
      [signupUrl]="signupUrl"
      [homeUrl]="homeUrl"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingContainerComponent {
  protected readonly authStore = inject(AuthStore);
  protected readonly signinUrl = CommonRouteContainerModel.SIGNIN_ROUTE.url;
  protected readonly signupUrl = CommonRouteContainerModel.SIGNUP_ROUTE.url;
  protected readonly homeUrl = CommonRouteContainerModel.HOME_ROUTE.url;
}
