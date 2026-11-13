import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { CommonRouteContainerModel } from '../../../../../../core/routing/common-routes/common-route-container.model';
import { CredentialsModel } from '../../../models/credentials.model';
import { AuthStore } from '../../../store/auth.store';
import { SigninPresentationComponent } from '../signin-presentation/signin-presentation.component';

@Component({
  selector: 'app-signin-container',
  imports: [SigninPresentationComponent],
  templateUrl: './signin-container.component.html',
  styleUrl: './signin-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SigninContainerComponent implements OnInit {
  protected readonly authStore = inject(AuthStore);
  protected readonly forgotPasswordUrl = CommonRouteContainerModel.FORGOT_PASSWORD_ROUTE.url;
  protected readonly signupUrl = CommonRouteContainerModel.SIGNUP_ROUTE.url;

  ngOnInit(): void {
    this.authStore.resetStatus();
  }

  protected signIn(credentials: CredentialsModel): void {
    this.authStore.signIn(credentials);
  }
}
