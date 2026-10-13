import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AssuresStore, PAGE_SIZE_OPTIONS } from '../../store/assures.store';
import { AssuresListComponent } from '../assures-list/assures-list.component';

/** Page « Assurés » : liste avec recherche et pagination. */
@Component({
  selector: 'app-assures-container',
  imports: [AssuresListComponent],
  template: `
    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }
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
  styles: `
    .error {
      margin: 0 0 16px;
      padding: 12px 14px;
      border-left: 3px solid var(--ci-danger);
      border-radius: 8px;
      color: #8a1621;
      background: var(--ci-danger-soft);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssuresContainerComponent {
  protected readonly store = inject(AssuresStore);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly createUrl = CabinetRouteContainerModel.CLIENT_NEW_ROUTE.url;
  protected readonly detailBaseUrl = CabinetRouteContainerModel.CLIENTS_ROUTE.url;
}
