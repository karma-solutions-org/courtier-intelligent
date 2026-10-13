import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavSection } from '../navigation.structure';

/** Menu latéral (même présentation que CompliScan) : carte violette, nom de l'app, entrées en rose, déconnexion en bas. */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  template: `
    <nav aria-label="Menu principal">
      @for (item of items(); track item.url) {
        <a
          class="link"
          [routerLink]="item.url"
          routerLinkActive="active"
          ariaCurrentWhenActive="page"
          (click)="navigated.emit()"
        >
          <mat-icon>{{ item.icon }}</mat-icon>
          <span>{{ item.label }}</span>
        </a>
      }
    </nav>

    <div class="footer">
      <button class="link logout" type="button" (click)="signedOut.emit()">
        <mat-icon>logout</mat-icon>
        <span>Déconnexion</span>
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
      padding: 1.1rem 0.625rem 0.972rem;
      background: var(--ci-sidebar-bg);
      border-right: 1px solid var(--ci-sidebar-border);
    }

    .brand {
      margin-bottom: 1.5rem;
      padding: 0 0.625rem;
      font-family: var(--ci-font-display);
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      color: #fff;
    }

    nav {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 4px;
    }

    .link {
      display: flex;
      align-items: center;
      gap: 0.764rem;
      box-sizing: border-box;
      width: 100%;
      height: 2.639rem;
      padding: 4px 0.625rem;
      border: none;
      border-radius: 0.833rem;
      background: transparent;
      font: inherit;
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--ci-sidebar-text);
      text-align: left;
      text-decoration: none;
      cursor: pointer;
      transition:
        background-color 180ms ease,
        color 180ms ease;

      &:hover {
        color: #f8fafc;
        background: var(--ci-sidebar-hover);

        mat-icon {
          transform: scale(1.08);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--ci-accent);
        outline-offset: 2px;
      }

      &.active {
        color: #fff;
        font-weight: 600;
        background: var(--ci-sidebar-active);
        box-shadow: 0 8px 18px -12px var(--accent-deep);
      }

      mat-icon {
        flex: none;
        width: 20px;
        height: 20px;
        font-size: 20px;
        transition: transform 180ms ease;
      }
    }

    .footer {
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .logout {
      color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly sections = input.required<NavSection[]>();
  /** Émis au clic sur une entrée (pour refermer le menu sur mobile). */
  readonly navigated = output<void>();
  readonly signedOut = output<void>();

  /** Une seule liste, sans titres de section, comme CompliScan. */
  protected readonly items = computed(() => this.sections().flatMap((section) => section.items));
}
