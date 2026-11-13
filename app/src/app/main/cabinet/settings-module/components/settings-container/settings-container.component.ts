import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { TabQueryParamDirective } from '../../../../../core/directives/tab-query-param.directive';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { SettingsStore } from '../../store/settings.store';
import { MembersPanelComponent } from '../members-panel/members-panel.component';
import { SETTINGS_STRUCTURE } from '../settings.structure';
import { AuditLogPanelComponent } from '../audit-log-panel/audit-log-panel.component';
import { CatalogPanelComponent } from '../catalog-panel/catalog-panel.component';
import { CabinetFormComponent } from '../cabinet-form/cabinet-form.component';

@Component({
  selector: 'app-settings-container',
  imports: [MatTabsModule, TabQueryParamDirective, CabinetFormComponent, MembersPanelComponent, CatalogPanelComponent, AuditLogPanelComponent],
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
