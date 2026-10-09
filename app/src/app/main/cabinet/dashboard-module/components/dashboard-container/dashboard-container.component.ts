import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Dossier } from '@shared';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../assures-module/util/assures.utils';
import { DashboardStore } from '../../store/dashboard.store';
import { ConversionRate } from '../../util/dashboard.utils';
import {
  ConversionRow,
  DashboardDossierRow,
  DashboardPresentationComponent,
} from '../dashboard-presentation/dashboard-presentation.component';

/** Tableau de bord du cabinet (Epic E15) : branché sur les dossiers en direct. */
@Component({
  selector: 'app-dashboard-container',
  imports: [DashboardPresentationComponent],
  providers: [DashboardStore],
  template: `
    <app-dashboard-presentation
      [loaded]="store.loaded()"
      [isAdmin]="store.isAdmin()"
      [counts]="store.counts()"
      [toProcess]="toProcess()"
      [toFollowUp]="toFollowUp()"
      [conversionByCourtier]="conversionByCourtier()"
      [conversionByProduct]="conversionByProduct()"
      [dossiersUrl]="dossiersUrl"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardContainerComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly dossiersUrl = CabinetRouteContainerModel.DOSSIERS_ROUTE.url;

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
    const products = this.store.productNames();
    return dossiers.map(dossier => {
      const assure = assures.get(dossier.assureId);
      return {
        dossier,
        assureName: assure ? displayName(assure) : '—',
        productName: products.get(dossier.productId) ?? dossier.productId,
      };
    });
  }

  private named(rates: ConversionRate[], names: Map<string, string>): ConversionRow[] {
    return rates.map(rate => ({ ...rate, name: names.get(rate.key) ?? (rate.key || '—') }));
  }
}
