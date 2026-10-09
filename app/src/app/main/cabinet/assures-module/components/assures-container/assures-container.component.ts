import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AssuresStore, PAGE_SIZE_OPTIONS } from '../../store/assures.store';
import { AssuresListComponent } from '../assures-list/assures-list.component';

/** Page « Assurés » : liste avec recherche et pagination. */
@Component({
  selector: 'app-assures-container',
  imports: [AssuresListComponent],
  template: `
    <app-assures-list
      [assures]="store.pageItems()"
      [total]="store.total()"
      [query]="store.query()"
      [pageIndex]="store.pageIndex()"
      [pageSize]="store.pageSize()"
      [pageSizeOptions]="pageSizeOptions"
      [loaded]="store.loaded()"
      [createUrl]="createUrl"
      [detailBaseUrl]="detailBaseUrl"
      (queryChanged)="store.setQuery($event)"
      (pageChanged)="store.setPage($event.pageIndex, $event.pageSize)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssuresContainerComponent {
  protected readonly store = inject(AssuresStore);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly createUrl = CabinetRouteContainerModel.ASSURE_NEW_ROUTE.url;
  protected readonly detailBaseUrl = CabinetRouteContainerModel.ASSURES_ROUTE.url;
}
