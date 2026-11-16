import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ExtensionPing } from '../../../../../../core/providers/extension.provider';

/** Indicateur « Extension installée » de la barre du haut (rien n'est affiché si la détection est impossible). */
@Component({
  selector: 'app-extension-indicator',
  imports: [MatIconModule],
  templateUrl: './extension-indicator-presentation.component.html',
  styleUrl: './extension-indicator-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtensionIndicatorPresentationComponent {
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
