import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Dossier } from '@shared';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../../assures-module/util/assures.utils';
import { DashboardStore } from '../../../store/dashboard.store';
import { DashboardDossierRow } from '../../../models/dashboard-row.model';
import { ConversionRate, toDashboardRows } from '../../../util/dashboard.utils';
import { ConversionRow, DashboardPresentationComponent } from '../dashboard-presentation/dashboard-presentation.component';

/** Tableau de bord du cabinet (Epic E15) : branché sur les dossiers en direct. */
@Component({
  selector: 'app-dashboard-container',
  imports: [DashboardPresentationComponent],
  providers: [DashboardStore],
  templateUrl: './dashboard-container.component.html',
  styleUrl: './dashboard-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardContainerComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly dossiersUrl = CabinetRouteContainerModel.DOSSIERS_ROUTE.url;
  protected readonly toProcessUrl = CabinetRouteContainerModel.DOSSIERS_TO_PROCESS_ROUTE.url;

  protected readonly toProcess = computed(() => this.toRows(this.store.toProcess()));
  protected readonly toFollowUp = computed(() => this.toRows(this.store.toFollowUp()));
  protected readonly conversionByCourtier = computed(() =>
    this.named(this.store.conversionByCourtier(), this.store.memberNames()),
  );
  protected readonly conversionByProduct = computed(() =>
    this.named(this.store.conversionByProduct(), this.store.productNames()),
  );

  private toRows(dossiers: Dossier[]): DashboardDossierRow[] {
    const assures = this.store.assureById();
    return toDashboardRows(
      dossiers,
      (assureId) => {
        const assure = assures.get(assureId);
        return assure ? displayName(assure) : null;
      },
      this.store.productNames(),
    );
  }

  private named(rates: ConversionRate[], names: Map<string, string>): ConversionRow[] {
    return rates.map((rate) => ({ ...rate, name: names.get(rate.key) ?? (rate.key || '—') }));
  }
}
