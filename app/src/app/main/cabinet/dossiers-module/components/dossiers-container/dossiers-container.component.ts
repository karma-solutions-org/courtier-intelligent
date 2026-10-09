import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { DossiersStore, PAGE_SIZE_OPTIONS } from '../../store/dossiers.store';
import { DossierRow, DossiersListComponent, Option } from '../dossiers-list/dossiers-list.component';

/** Page « Dossiers » : liste avec filtres et pagination. */
@Component({
  selector: 'app-dossiers-container',
  imports: [DossiersListComponent],
  template: `
    <app-dossiers-list
      [rows]="rows()"
      [total]="store.total()"
      [filter]="store.filter()"
      [products]="productOptions()"
      [courtiers]="courtierOptions()"
      [pageIndex]="store.pageIndex()"
      [pageSize]="store.pageSize()"
      [pageSizeOptions]="pageSizeOptions"
      [loaded]="store.loaded()"
      [createUrl]="createUrl"
      [baseUrl]="baseUrl"
      (filterChanged)="store.setFilter($event)"
      (filterReset)="store.resetFilter()"
      (pageChanged)="store.setPage($event.pageIndex, $event.pageSize)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossiersContainerComponent {
  protected readonly store = inject(DossiersStore);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly createUrl = CabinetRouteContainerModel.DOSSIER_NEW_ROUTE.url;
  protected readonly baseUrl = CabinetRouteContainerModel.DOSSIERS_ROUTE.url;

  protected readonly productOptions = computed<Option[]>(() => this.store.products().map(p => ({ id: p.id, label: p.name })));
  protected readonly courtierOptions = computed<Option[]>(() =>
    this.store.members().map(m => ({ id: m.id, label: m.displayName || m.email || m.id })),
  );

  protected readonly rows = computed<DossierRow[]>(() => {
    const products = new Map(this.store.products().map(p => [p.id, p.name]));
    const members = this.store.memberNames();
    return this.store.pageItems().map(dossier => ({
      dossier,
      assureName: this.store.assureName(dossier.assureId),
      productName: products.get(dossier.productId) ?? dossier.productId,
      courtierName: members.get(dossier.assignedTo) ?? '—',
    }));
  });
}
