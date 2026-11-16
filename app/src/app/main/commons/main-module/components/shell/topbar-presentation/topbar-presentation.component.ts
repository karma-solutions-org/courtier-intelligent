import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ExtensionPing } from '../../../../../../core/providers/extension.provider';
import { ExtensionIndicatorPresentationComponent } from '../../../../extension-module/components/extension-indicator/extension-indicator-presentation/extension-indicator-presentation.component';

@Component({
  selector: 'app-topbar',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatDividerModule, ExtensionIndicatorPresentationComponent],
  templateUrl: './topbar-presentation.component.html',
  styleUrl: './topbar-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopbarPresentationComponent {
  /** Module de la page affichée (« Clients », « Corbeille »…). */
  readonly moduleTitle = input('');
  readonly displayName = input('');
  /** Logo du cabinet (Paramètres → Cabinet) : affiché à la place des initiales quand il existe. */
  readonly logoUrl = input<string | null>(null);
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
