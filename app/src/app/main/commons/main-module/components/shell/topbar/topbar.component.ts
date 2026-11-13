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
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopbarComponent {
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
