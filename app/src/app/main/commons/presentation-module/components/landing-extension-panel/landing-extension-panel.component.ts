import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LANDING_PAGE_STRUCTURE } from '../landing-presentation/landing-page.structure';

/** Aperçu (décoratif) du panneau de l'extension en cours de remplissage. */
@Component({
  selector: 'app-landing-extension-panel',
  imports: [MatIconModule],
  templateUrl: './landing-extension-panel.component.html',
  styleUrl: './landing-extension-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingExtensionPanelComponent {
  readonly extension = input.required<(typeof LANDING_PAGE_STRUCTURE)['extension']>();
}
