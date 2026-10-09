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
  template: `
    <div class="banner" role="status" [class.expired]="expired()">
      <mat-icon>warning</mat-icon>
      <p>
        @if (expired()) {
          Votre cabinet dépasse la limite de son offre ({{ maxUtilisateurs() }} utilisateurs) :
          @if (role() === 'admin') {
            seuls les administrateurs ont accès pour le moment. Désactivez des membres dans Paramètres → Membres pour rétablir
            l'accès de toute l'équipe.
          } @else {
            l'accès est réservé aux administrateurs.
          }
        } @else {
          Votre offre autorise {{ maxUtilisateurs() }} utilisateurs, votre cabinet en compte davantage.
          @if (role() === 'admin') {
            Désactivez des membres avant le {{ graceEndsAt() | date: 'd MMMM y' }} : les invitations sont bloquées et, après
            cette date, seuls les administrateurs auront accès.
          } @else {
            Après le {{ graceEndsAt() | date: 'd MMMM y' }}, l'accès sera réservé aux administrateurs.
          }
        }
      </p>
    </div>
  `,
  styles: `
    .banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 32px;
      color: var(--mat-sys-on-tertiary-container);
      background: var(--mat-sys-tertiary-container);

      &.expired {
        color: var(--mat-sys-on-error-container);
        background: var(--mat-sys-error-container);
      }
    }

    p {
      margin: 0;
    }

    @media (max-width: 600px) {
      .banner {
        padding: 12px 16px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LimitBannerComponent {
  readonly graceEndsAt = input.required<number>();
  readonly maxUtilisateurs = input<number | null>(null);
  readonly role = input<UserRole | null>(null);

  protected readonly expired = computed(() => this.graceEndsAt() < Date.now());
}
