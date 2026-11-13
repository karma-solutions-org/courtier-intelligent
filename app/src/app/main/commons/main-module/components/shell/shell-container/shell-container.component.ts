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
  templateUrl: './shell-container.component.html',
  styleUrl: './shell-container.component.scss',
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
