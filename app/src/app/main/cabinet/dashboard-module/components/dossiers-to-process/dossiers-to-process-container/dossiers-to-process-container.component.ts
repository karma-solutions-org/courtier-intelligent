import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../../assures-module/util/assures.utils';
import { DashboardStore } from '../../../store/dashboard.store';
import { toDashboardRows } from '../../../util/dashboard.utils';
import { DossiersToProcessPresentationComponent } from '../dossiers-to-process-presentation/dossiers-to-process-presentation.component';

/**
 * « Mes dossiers à traiter » en pleine page : même règle que la carte du tableau de bord (dossiers assignés au courtier
 * connecté, dans un statut qui attend une action), sans limite de nombre.
 */
@Component({
  selector: 'app-dossiers-to-process-container',
  imports: [DossiersToProcessPresentationComponent],
  providers: [DashboardStore],
  templateUrl: './dossiers-to-process-container.component.html',
  styleUrl: './dossiers-to-process-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossiersToProcessContainerComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly dossiersUrl = CabinetRouteContainerModel.DOSSIERS_ROUTE.url;

  protected readonly rows = computed(() => {
    const assures = this.store.assureById();
    return toDashboardRows(
      this.store.toProcess(),
      (assureId) => {
        const assure = assures.get(assureId);
        return assure ? displayName(assure) : null;
      },
      this.store.productNames(),
    );
  });
}
