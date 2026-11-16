import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavSection } from '../navigation.structure';

/** Menu latéral (même présentation que CompliScan) : carte violette, nom de l'app, entrées en rose, déconnexion en bas. */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './sidebar-presentation.component.html',
  styleUrl: './sidebar-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarPresentationComponent {
  readonly sections = input.required<NavSection[]>();
  /** Émis au clic sur une entrée (pour refermer le menu sur mobile). */
  readonly navigated = output<void>();
  readonly signedOut = output<void>();

  /** Une seule liste, sans titres de section, comme CompliScan. */
  protected readonly items = computed(() => this.sections().flatMap((section) => section.items));
}
