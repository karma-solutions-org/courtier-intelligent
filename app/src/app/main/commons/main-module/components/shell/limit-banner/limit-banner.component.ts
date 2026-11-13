import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { UserRole } from '@shared';

/**
 * Bandeau affiché quand le cabinet dépasse la limite d'utilisateurs de son offre (baisse d'offre) :
 * rappelle le délai de grâce, puis l'accès réservé aux administrateurs.
 */
@Component({
  selector: 'app-limit-banner',
  imports: [DatePipe, MatIconModule],
  templateUrl: './limit-banner.component.html',
  styleUrl: './limit-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LimitBannerComponent {
  readonly graceEndsAt = input.required<number>();
  readonly maxUtilisateurs = input<number | null>(null);
  readonly role = input<UserRole | null>(null);

  protected readonly expired = computed(() => this.graceEndsAt() < Date.now());
}
