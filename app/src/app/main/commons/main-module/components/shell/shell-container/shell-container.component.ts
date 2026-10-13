import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSidenavModule } from '@angular/material/sidenav';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { ExtensionStore } from '../../../../extension-module/store/extension.store';
import { AuthStore } from '../../../../authentication-module/store/auth.store';
import { navigationFor, ROLE_LABELS } from '../navigation.structure';
import { CabinetStatusStore } from '../../../store/cabinet-status.store';
import { LimitBannerComponent } from '../limit-banner/limit-banner.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

/** Layout de l'espace connecté : menu latéral selon le rôle, barre du haut, contenu routé. */
@Component({
  selector: 'app-shell-container',
  imports: [RouterOutlet, MatSidenavModule, SidebarComponent, TopbarComponent, LimitBannerComponent],
  template: `
    <div class="app-container">
      <app-topbar
        [moduleTitle]="moduleTitle()"
        [displayName]="displayName()"
        [email]="authStore.user()?.email ?? null"
        [roleLabel]="roleLabel()"
        [showMenuButton]="isMobile()"
        [extension]="extensionStore.ping()"
        (menuToggled)="sidenav.toggle()"
        (signedOut)="authStore.signOut()"
      />

      <mat-sidenav-container class="main-body">
        <mat-sidenav
          #sidenav
          class="sidenav"
          [mode]="isMobile() ? 'over' : 'side'"
          [opened]="!isMobile()"
        >
          <app-sidebar
            [sections]="sections()"
            (navigated)="isMobile() && sidenav.close()"
            (signedOut)="authStore.signOut()"
          />
        </mat-sidenav>

        <mat-sidenav-content class="content-area">
          @if (cabinetStatus.graceEndsAt(); as graceEndsAt) {
            <app-limit-banner [graceEndsAt]="graceEndsAt" [maxUtilisateurs]="cabinetStatus.maxUtilisateurs()" [role]="authStore.role()" />
          }
          <main class="page">
            <router-outlet />
          </main>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>
  `,
  styles: `
    /* Disposition BAZZ-CRM : barre du haut pleine largeur, rail sombre dessous, contenu à droite. */
    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    .main-body {
      flex: 1;
      min-height: 0;
      background: var(--ci-bg);
    }

    .sidenav {
      width: 16.389rem;
      border: none;
      border-radius: 0;
      background: var(--ci-sidebar-bg);
    }

    .content-area {
      display: flex;
      flex-direction: column;
      background: var(--ci-bg);
    }

    .page {
      flex: 1;
      min-width: 0;
      padding: 2rem;
    }

    @media (max-width: 600px) {
      .page {
        padding: 1.25rem 1rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellContainerComponent {
  protected readonly authStore = inject(AuthStore);
  protected readonly extensionStore = inject(ExtensionStore);
  protected readonly cabinetStatus = inject(CabinetStatusStore);

  protected readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 960px)')
      .pipe(map(state => state.matches)),
    { initialValue: false },
  );

  protected readonly sections = computed(() => navigationFor(this.authStore.role()));

  private readonly _router = inject(Router);
  private readonly _url = toSignal(
    this._router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this._router.url),
      startWith(this._router.url),
    ),
    { initialValue: this._router.url },
  );

  /** Module affiché dans la barre du haut : l'entrée du menu qui contient la page (les dossiers ont le leur). */
  protected readonly moduleTitle = computed(() => {
    const path = this._url().split(/[?#]/)[0];
    const modules = [
      ...this.sections().flatMap((section) => section.items),
      { label: 'Dossiers', url: CabinetRouteContainerModel.DOSSIERS_ROUTE.url },
    ];
    const match = modules
      .filter((item) => path === item.url || path.startsWith(item.url + '/'))
      .sort((a, b) => b.url.length - a.url.length)[0];
    return match?.label ?? '';
  });
  protected readonly roleLabel = computed(() => {
    const role = this.authStore.role();
    return role ? ROLE_LABELS[role] : 'Aucun cabinet';
  });
  protected readonly displayName = computed(() => {
    const user = this.authStore.user();
    return user?.displayName || user?.email || '';
  });
}
