import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ExtensionPing } from '../../../../../core/providers/extension.provider';

/** Indicateur « Extension installée » de la barre du haut (rien n'est affiché si la détection est impossible). */
@Component({
  selector: 'app-extension-indicator',
  imports: [MatIconModule],
  template: `
    @if (view(); as view) {
      <span class="indicator" [class.installed]="view.installed" role="status" [attr.title]="view.title">
        <mat-icon>{{ view.installed ? 'check_circle' : 'extension_off' }}</mat-icon>
        <span class="text">{{ view.text }}</span>
      </span>
    }
  `,
  styles: `
    .indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
      background: var(--mat-sys-surface-container);

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }

      &.installed {
        color: #1e7d50;
        background: #e3f5ec;
      }
    }

    @media (max-width: 600px) {
      .text {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtensionIndicatorComponent {
  readonly ping = input<ExtensionPing | null>(null);

  protected readonly view = computed(() => {
    const ping = this.ping();
    switch (ping?.status) {
      case 'installed':
        return { installed: true, text: 'Extension installée', title: ping.version ? `Version ${ping.version}` : null };
      case 'absent':
        return { installed: false, text: 'Extension non installée', title: "Installez l'extension Chrome pour remplir les extranets des assureurs" };
      default:
        // Pas encore vérifié, navigateur sans extensions Chrome ou détection non configurée : on n'affiche rien.
        return null;
    }
  });
}
