import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { SettingsStore } from '../../store/settings.store';
import { MembersPanelComponent } from '../members-panel/members-panel.component';
import { SETTINGS_STRUCTURE } from '../settings.structure';
import { CabinetFormComponent } from '../cabinet-form/cabinet-form.component';

@Component({
  selector: 'app-settings-container',
  imports: [MatTabsModule, CabinetFormComponent, MembersPanelComponent],
  template: `
    <h1>{{ structure.title }}</h1>
    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }
    <mat-tab-group animationDuration="0ms">
      <mat-tab [label]="structure.tabs.cabinet">
        <div class="tab">
          <app-cabinet-form
            [cabinet]="store.cabinet()"
            [isPending]="store.isPending()"
            (saved)="store.saveCabinet($event)"
            (logoSelected)="store.uploadLogo($event)"
          />
        </div>
      </mat-tab>
      <mat-tab [label]="structure.tabs.members">
        <div class="tab">
          <app-members-panel
            [members]="store.members()"
            [invitations]="store.invitations()"
            [maxUtilisateurs]="store.cabinet()?.maxUtilisateurs ?? 3"
            [currentUid]="authStore.user()?.uid ?? null"
            [isPending]="store.isPending()"
            (invited)="store.invite($event)"
            (roleChanged)="store.setRole($event)"
            (statusChanged)="store.setStatus($event)"
            (invitationCancelled)="store.cancelInvitation($event)"
          />
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `
    h1 {
      margin: 0 0 16px;
      font-size: 26px;
      font-weight: 600;
    }

    .tab {
      padding-top: 20px;
    }

    .error {
      margin: 0 0 16px;
      padding: 12px 14px;
      border-radius: 10px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }
  `,
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
