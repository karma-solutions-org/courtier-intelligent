import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ExtensionPing } from '../../../../../../core/providers/extension.provider';
import { ExtensionIndicatorComponent } from '../../../../extension-module/components/extension-indicator/extension-indicator.component';

@Component({
  selector: 'app-topbar',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatDividerModule, ExtensionIndicatorComponent],
  template: `
    @if (showMenuButton()) {
      <button class="icon-btn" type="button" (click)="menuToggled.emit()" aria-label="Ouvrir le menu">
        <mat-icon>menu</mat-icon>
      </button>
    }

    <div class="logo-container" aria-label="Courtier Intelligent">
      <span class="logo-ba">courtier</span><span class="logo-zz">intelligent</span>
    </div>

    @if (moduleTitle()) {
      <nav class="nav-links" aria-label="Module courant">
        <span class="nav-link active">{{ moduleTitle() }}</span>
      </nav>
    }

    <div class="actions">
      <app-extension-indicator class="extension" [ping]="extension()" />

      <button class="user-profile" type="button" [matMenuTriggerFor]="userMenu" [title]="displayName()" aria-label="Menu utilisateur">
        <span class="avatar">{{ initials() }}</span>
      </button>
    </div>

    <mat-menu #userMenu="matMenu" xPosition="before" class="ci-menu-panel">
      <div class="menu-identity">
        <span class="identity-avatar" aria-hidden="true">{{ initials() }}</span>
        <span class="identity-text">
          <span class="identity-name">{{ displayName() }}</span>
          <span class="identity-role">{{ roleLabel() }}</span>
          @if (email(); as mail) {
            <span class="identity-role">{{ mail }}</span>
          }
        </span>
      </div>
      <mat-divider />
      <button mat-menu-item class="danger" (click)="signedOut.emit()">
        <mat-icon>logout</mat-icon>
        Se déconnecter
      </button>
    </mat-menu>
  `,
  styles: `
    /* Barre du haut BAZZ-CRM : blanche, pleine largeur, logo bicolore, onglet actif souligné. */
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      flex: none;
      box-sizing: border-box;
      height: 4.375rem;
      padding: 0 2rem;
      position: sticky;
      top: 0;
      z-index: 50;
      white-space: nowrap;
      background: var(--ci-surface);
      border-bottom: 1px solid var(--ci-border);
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.02);
    }

    .logo-container {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      font-size: 1.8rem;
      font-weight: 800;
      letter-spacing: -0.05em;
      user-select: none;
    }

    .logo-ba {
      color: var(--ci-navy-900);
    }

    .logo-zz {
      color: var(--ci-accent);
    }

    .nav-links {
      display: flex;
      align-items: center;
      align-self: stretch;
      flex: 1 1 auto;
      min-width: 0;
    }

    .nav-link {
      position: relative;
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 0.5rem;
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--ci-text-muted);

      &::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        width: 100%;
        height: 3px;
        background: var(--ci-accent);
        border-radius: 9999px 9999px 0 0;
        transform: scaleX(0);
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }

      &.active {
        color: var(--ci-text);
        font-weight: 600;

        &::after {
          transform: scaleX(1);
        }
      }
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-shrink: 0;
    }

    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.5rem;
      border: none;
      border-radius: 9999px;
      background: none;
      color: var(--ci-text-muted);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: var(--ci-navy-100);
        color: var(--ci-accent);
      }
    }

    .user-profile {
      display: flex;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
    }

    .avatar {
      display: grid;
      place-items: center;
      width: 2.361rem;
      height: 2.361rem;
      box-sizing: border-box;
      border-radius: 9999px;
      border: 2px solid var(--ci-border);
      background: var(--ci-accent);
      color: #fff;
      font-size: 0.875rem;
      font-weight: 600;
      transition: border-color 0.15s ease;

      &:hover {
        border-color: var(--ci-accent);
      }
    }

    .menu-identity {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem 1rem;
    }

    .identity-avatar {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 2.222rem;
      height: 2.222rem;
      border-radius: 9999px;
      background: var(--ci-accent);
      color: #fff;
      font-weight: 600;
    }

    .identity-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.3;
    }

    .identity-name {
      font-weight: 600;
      color: var(--ci-text);
    }

    .identity-role {
      font-size: 0.8125rem;
      color: var(--ci-text-muted);
    }

    .danger {
      color: var(--ci-danger);

      mat-icon {
        color: var(--ci-danger);
      }
    }

    @media (max-width: 600px) {
      :host {
        padding: 0 1rem;
        gap: 0.75rem;
      }

      .logo-container {
        font-size: 1.3rem;
      }

      .nav-links {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopbarComponent {
  /** Module de la page affichée (« Clients », « Corbeille »…). */
  readonly moduleTitle = input('');
  readonly displayName = input('');
  readonly email = input<string | null>(null);
  readonly roleLabel = input('');
  readonly showMenuButton = input(false);
  /** Résultat de la détection de l'extension Chrome (null : pas encore vérifié). */
  readonly extension = input<ExtensionPing | null>(null);
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
