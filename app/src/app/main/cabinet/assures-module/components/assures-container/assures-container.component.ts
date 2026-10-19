import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AssuresStore } from '../../store/assures.store';
import { AssuresListComponent } from '../assures-list/assures-list.component';

/** Page « Assurés » : liste avec recherche et défilement infini. */
@Component({
  selector: 'app-assures-container',
  imports: [AssuresListComponent],
  template: `
    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }
    <app-assures-list
      [assures]="store.filtered()"
      [total]="store.total()"
      [query]="store.query()"
      [filters]="store.filters()"
      [hasFilters]="store.hasFilters()"
      [hasMore]="store.hasMore()"
      [loadingMore]="store.loadingMore()"
      [loadedCount]="store.assures().length"
      [loaded]="store.loaded()"
      [createUrl]="createUrl"
      [detailBaseUrl]="detailBaseUrl"
      (queryChanged)="store.setQuery($event)"
      (filtersChanged)="store.setFilters($event)"
      (filtersCleared)="store.clearFilters()"
      (loadMore)="store.loadMore()"
    />
  `,
  styles: `
    .error {
      margin: 0 0 16px;
      padding: 12px 14px;
      border-left: 3px solid var(--ci-danger);
      border-radius: 8px;
      color: var(--ci-danger);
      background: var(--ci-danger-soft);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssuresContainerComponent {
  protected readonly store = inject(AssuresStore);
  protected readonly createUrl = CabinetRouteContainerModel.CLIENT_NEW_ROUTE.url;
  protected readonly detailBaseUrl = CabinetRouteContainerModel.CLIENTS_ROUTE.url;
}
