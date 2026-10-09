import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DashboardContainerComponent } from '../../../../cabinet/dashboard-module/components/dashboard-container/dashboard-container.component';
import { AuthStore } from '../../../authentication-module/store/auth.store';

/** Tableau de bord : salutation, puis les indicateurs du cabinet (Epic E15) dès qu'un cabinet est rattaché. */
@Component({
  selector: 'app-home-container',
  imports: [DashboardContainerComponent],
  template: `
    <h1>Bonjour {{ firstName() }}</h1>
    @if (!authStore.cabinetId()) {
      <p class="notice">Votre compte n'est rattaché à aucun cabinet pour l'instant.</p>
    } @else {
      <app-dashboard-container />
    }
  `,
  styles: `
    h1 {
      margin: 0 0 16px;
      font-size: 26px;
      font-weight: 600;
    }

    .notice {
      margin: 0;
      padding: 14px 16px;
      border-radius: 10px;
      color: var(--mat-sys-on-tertiary-container);
      background: var(--mat-sys-tertiary-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeContainerComponent {
  protected readonly authStore = inject(AuthStore);
  protected readonly firstName = computed(() => {
    const user = this.authStore.user();
    return user?.displayName?.split(' ')[0] ?? '';
  });
}
