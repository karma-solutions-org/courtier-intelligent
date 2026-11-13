import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LANDING_PAGE_STRUCTURE } from '../landing-page.structure';

/** Aperçu (décoratif) du panneau de l'extension en cours de remplissage. */
@Component({
  selector: 'app-landing-extension-panel',
  imports: [MatIconModule],
  templateUrl: './landing-extension-panel-presentation.component.html',
  styleUrl: './landing-extension-panel-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingExtensionPanelPresentationComponent {
  readonly extension = input.required<(typeof LANDING_PAGE_STRUCTURE)['extension']>();
}
