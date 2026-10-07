import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSidenavModule } from '@angular/material/sidenav';
import { RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthStore } from '../../../../authentication-module/store/auth.store';
import { navigationFor, ROLE_LABELS } from '../navigation.structure';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

/** Layout de l'espace connecté : menu latéral selon le rôle, barre du haut, contenu routé. */
@Component({
  selector: 'app-shell-container',
  imports: [RouterOutlet, MatSidenavModule, SidebarComponent, TopbarComponent],
  template: `
    <mat-sidenav-container class="container">
      <mat-sidenav
        #sidenav
        class="sidenav"
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile()"
      >
        <app-sidebar [sections]="sections()" (navigated)="isMobile() && sidenav.close()" />
      </mat-sidenav>

      <mat-sidenav-content class="content">
        <app-topbar
          [displayName]="displayName()"
          [email]="authStore.user()?.email ?? null"
          [roleLabel]="roleLabel()"
          [showMenuButton]="isMobile()"
          (menuToggled)="sidenav.toggle()"
          (signedOut)="authStore.signOut()"
        />
        <main class="page">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .container {
      height: 100vh;
      background: var(--mat-sys-surface-container-lowest);
    }

    .sidenav {
      width: 248px;
      border-right: 1px solid var(--mat-sys-outline-variant);
      border-radius: 0;
    }

    .content {
      display: flex;
      flex-direction: column;
      background: #f6f8fb;
    }

    .page {
      flex: 1;
      padding: 32px;
    }

    @media (max-width: 600px) {
      .page {
        padding: 20px 16px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellContainerComponent {
  protected readonly authStore = inject(AuthStore);

  protected readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 960px)')
      .pipe(map(state => state.matches)),
    { initialValue: false },
  );

  protected readonly sections = computed(() => navigationFor(this.authStore.role()));
  protected readonly roleLabel = computed(() => {
    const role = this.authStore.role();
    return role ? ROLE_LABELS[role] : 'Aucun cabinet';
  });
  protected readonly displayName = computed(() => {
    const user = this.authStore.user();
    return user?.displayName || user?.email || '';
  });
}
