import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ExtranetReliabilityStore } from '../../../store/extranet-reliability.store';
import { SettingsStore } from '../../../store/settings.store';
import { ReliabilityPanelPresentationComponent } from '../reliability-panel-presentation/reliability-panel-presentation.component';

/**
 * Onglet « Fiabilité des extranets » : affiché à la première ouverture de l'onglet (contenu des onglets créé à la
 * demande), il demande alors le bilan. Le store est fourni par la page : revenir sur l'onglet ne relance pas le calcul.
 */
@Component({
  selector: 'app-reliability-panel-container',
  imports: [ReliabilityPanelPresentationComponent],
  templateUrl: './reliability-panel-container.component.html',
  styleUrl: './reliability-panel-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReliabilityPanelContainerComponent {
  protected readonly store = inject(ExtranetReliabilityStore);
  protected readonly settingsStore = inject(SettingsStore);

  constructor() {
    this.store.ensureLoaded();
  }
}
