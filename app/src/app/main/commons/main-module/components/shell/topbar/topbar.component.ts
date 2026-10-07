import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

@Component({
  selector: 'app-topbar',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatDividerModule],
  template: `
    @if (showMenuButton()) {
      <button mat-icon-button (click)="menuToggled.emit()" aria-label="Ouvrir le menu">
        <mat-icon>menu</mat-icon>
      </button>
    }

    <button class="user" [matMenuTriggerFor]="userMenu" aria-label="Menu utilisateur">
      <span class="avatar">{{ initials() }}</span>
      <span class="user-text">
        <span class="user-name">{{ displayName() }}</span>
        <span class="user-role">{{ roleLabel() }}</span>
      </span>
      <mat-icon>expand_more</mat-icon>
    </button>

    <mat-menu #userMenu="matMenu" xPosition="before">
      <div class="menu-header">
        <p class="menu-name">{{ displayName() }}</p>
        <p class="menu-email">{{ email() }}</p>
      </div>
      <mat-divider />
      <button mat-menu-item (click)="signedOut.emit()">
        <mat-icon>logout</mat-icon>
        Se déconnecter
      </button>
    </mat-menu>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 64px;
      padding: 0 16px 0 20px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      background: #fff;
    }

    .user {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
      padding: 6px 8px;
      border: none;
      border-radius: 10px;
      font: inherit;
      color: inherit;
      background: none;
      cursor: pointer;

      &:hover {
        background: var(--mat-sys-surface-container);
      }
    }

    .avatar {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      font-weight: 600;
      color: #fff;
      background: #00082b;
    }

    .user-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1.2;
    }

    .user-name {
      font-weight: 600;
    }

    .user-role {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .menu-header {
      padding: 12px 16px;
    }

    .menu-name,
    .menu-email {
      margin: 0;
    }

    .menu-name {
      font-weight: 600;
    }

    .menu-email {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    @media (max-width: 600px) {
      .user-text {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopbarComponent {
  readonly displayName = input('');
  readonly email = input<string | null>(null);
  readonly roleLabel = input('');
  readonly showMenuButton = input(false);
  readonly menuToggled = output<void>();
  readonly signedOut = output<void>();

  protected readonly initials = computed(() =>
    this.displayName()
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]!.toUpperCase())
      .join(''),
  );
}
