import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DashboardContainerComponent } from '../../../../cabinet/dashboard-module/components/dashboard-container/dashboard-container.component';
import { AuthStore } from '../../../authentication-module/store/auth.store';

/** Tableau de bord : salutation, puis les indicateurs du cabinet (Epic E15) dès qu'un cabinet est rattaché. */
@Component({
  selector: 'app-home-container',
  imports: [DashboardContainerComponent],
  templateUrl: './home-container.component.html',
  styleUrl: './home-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeContainerComponent {
  protected readonly authStore = inject(AuthStore);
  protected readonly firstName = computed(() => {
    const user = this.authStore.user();
    return user?.displayName?.split(' ')[0] ?? '';
  });
}
