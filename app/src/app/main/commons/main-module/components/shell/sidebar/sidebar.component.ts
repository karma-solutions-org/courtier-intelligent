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
      color: #dbe4ff;
      background: #0b1f4d;
    }

    .brand {
      padding: 14px 16px;
      margin: 12px;
      border-radius: 8px;
      background: var(--ci-surface);
    }

    nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 12px;
    }

    .section-title {
      margin: 20px 12px 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #9aa8c7;
    }

    .nav-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      font-weight: 500;
      color: #d5def5;
      text-decoration: none;
      transition: background 0.15s, color 0.15s;

      &:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }

      &:focus-visible {
        outline: 2px solid #7fdde0;
        outline-offset: 2px;
      }

      mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
        color: #9aa8c7;
      }

      &.active {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);

        mat-icon {
          color: #fff;
        }
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
