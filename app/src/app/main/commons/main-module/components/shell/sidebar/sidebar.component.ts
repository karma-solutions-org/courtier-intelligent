import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LogoComponent } from '../../../../../../core/components/logo/logo.component';
import { NavSection } from '../navigation.structure';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, MatIconModule, LogoComponent],
  template: `
    <div class="brand">
      <app-logo [size]="34" />
    </div>
    <nav aria-label="Menu principal">
      @for (section of sections(); track section.title) {
        @if (section.title) {
          <p class="section-title">{{ section.title }}</p>
        }
        @for (item of section.items; track item.url) {
          <a
            class="nav-item"
            [routerLink]="item.url"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
            (click)="navigated.emit()"
          >
            <mat-icon>{{ item.icon }}</mat-icon>
            {{ item.label }}
          </a>
        }
      }
    </nav>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #fff;
    }

    .brand {
      padding: 20px 20px 16px;
    }

    nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 12px;
    }

    .section-title {
      margin: 20px 12px 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
      text-decoration: none;
      transition: background 0.15s;

      &:hover {
        background: var(--mat-sys-surface-container);
      }

      &.active {
        color: var(--mat-sys-on-primary-container);
        background: var(--mat-sys-primary-container);
      }

      mat-icon {
        width: 22px;
        height: 22px;
        font-size: 22px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly sections = input.required<NavSection[]>();
  /** Émis au clic sur une entrée (pour refermer le menu sur mobile). */
  readonly navigated = output<void>();
}
