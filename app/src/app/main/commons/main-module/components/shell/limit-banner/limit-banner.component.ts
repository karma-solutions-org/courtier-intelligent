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
      margin: 16px 32px 0;
      padding: 12px 18px;
      border-radius: 8px;
      border: 1px solid #ffd08a;
      color: var(--ci-warning);
      background: var(--ci-warning-soft);

      mat-icon {
        flex-shrink: 0;
        color: var(--ci-warning);
      }

      &.expired {
        border-color: #ffb3c0;
        color: var(--ci-danger);
        background: var(--ci-danger-soft);

        mat-icon {
          color: var(--ci-danger);
        }
      }
    }

    p {
      margin: 0;
    }

    @media (max-width: 600px) {
      .banner {
        margin: 12px 16px 0;
        padding: 12px 14px;
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
