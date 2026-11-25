import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { TabQueryParamDirective } from '../../../../../../core/directives/tab-query-param.directive';
import { AuthStore } from '../../../../../commons/authentication-module/store/auth.store';
import { SettingsStore } from '../../../store/settings.store';
import { MembersPanelPresentationComponent } from '../members-panel-presentation/members-panel-presentation.component';
import { SETTINGS_STRUCTURE } from '../settings.structure';
import { AuditLogPanelPresentationComponent } from '../audit-log-panel-presentation/audit-log-panel-presentation.component';
import { CatalogPanelPresentationComponent } from '../catalog-panel-presentation/catalog-panel-presentation.component';
import { CabinetFormPresentationComponent } from '../cabinet-form-presentation/cabinet-form-presentation.component';
import { ReliabilityPanelContainerComponent } from '../reliability-panel-container/reliability-panel-container.component';
import { ExtranetReliabilityStore } from '../../../store/extranet-reliability.store';

@Component({
  selector: 'app-settings-container',
  imports: [MatTabsModule, TabQueryParamDirective, CabinetFormPresentationComponent, MembersPanelPresentationComponent, CatalogPanelPresentationComponent, ReliabilityPanelContainerComponent, AuditLogPanelPresentationComponent],
  // Bilan de fiabilité : gardé par la page, calculé à la première ouverture de son onglet.
  providers: [ExtranetReliabilityStore],
  templateUrl: './settings-container.component.html',
  styleUrl: './settings-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsContainerComponent {
  protected readonly store = inject(SettingsStore);
  protected readonly authStore = inject(AuthStore);
  protected readonly structure = SETTINGS_STRUCTURE;
  private readonly _snackBar = inject(MatSnackBar);

  constructor() {
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 3000 });
        this.store.clearMessage();
      }
    });
  }
}
