import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { CommonRouteContainerModel } from '../../../../../../core/routing/common-routes/common-route-container.model';
import { AuthStore } from '../../../store/auth.store';
import { SignupPresentationComponent } from '../signup-presentation/signup-presentation.component';

@Component({
  selector: 'app-signup-container',
  imports: [SignupPresentationComponent],
  templateUrl: './signup-container.component.html',
  styleUrl: './signup-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupContainerComponent implements OnInit {
  protected readonly authStore = inject(AuthStore);
  protected readonly signinUrl = CommonRouteContainerModel.SIGNIN_ROUTE.url;
  /** Venu d'un lien d'invitation : il rejoint un cabinet existant au lieu d'en créer un. */
  protected readonly joiningByInvitation = computed(() =>
    (this.authStore.redirectUrl() ?? '').startsWith(CommonRouteContainerModel.INVITATION_ROUTE.url),
  );

  ngOnInit(): void {
    this.authStore.resetStatus();
  }
}
