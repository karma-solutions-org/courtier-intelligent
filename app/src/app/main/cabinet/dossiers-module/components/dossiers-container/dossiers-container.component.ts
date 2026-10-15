import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DOSSIER_STATUSES, DossierStatus } from '@shared';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { DossiersStore } from '../../store/dossiers.store';
import { EMPTY_FILTER } from '../../util/dossiers.utils';
import {
  DossierRow,
  DossiersListComponent,
  Option,
} from '../dossiers-list/dossiers-list.component';

/** Page « Dossiers » : liste avec filtres et défilement infini. */
@Component({
  selector: 'app-dossiers-container',
  imports: [DossiersListComponent],
  template: `
    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }
    <app-dossiers-list
      [rows]="rows()"
      [total]="store.total()"
      [filter]="store.filter()"
      [products]="productOptions()"
      [courtiers]="courtierOptions()"
      [hasMore]="store.canLoadMore()"
      [loadingMore]="store.loadingMore()"
      [searching]="store.searching()"
      [searchUnavailable]="store.searchUnavailable()"
      [loadedCount]="store.dossiers().length + (store.searchResults()?.length ?? 0)"
      [loaded]="store.loaded()"
      [createUrl]="createUrl"
      [baseUrl]="baseUrl"
      (filterChanged)="store.setFilter($event)"
      (filterReset)="store.resetFilter()"
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
export class DossiersContainerComponent {
  protected readonly store = inject(DossiersStore);
  protected readonly createUrl = CabinetRouteContainerModel.DOSSIER_NEW_ROUTE.url;
  protected readonly baseUrl = CabinetRouteContainerModel.DOSSIERS_ROUTE.url;

  constructor() {
    // Accès depuis un compteur du tableau de bord : tous les dossiers du cabinet dans ce statut.
    const status = inject(ActivatedRoute).snapshot.queryParamMap.get('statut');
    if (status && (DOSSIER_STATUSES as readonly string[]).includes(status)) {
      this.store.setFilter({ ...EMPTY_FILTER, status: status as DossierStatus });
    }
  }

  protected readonly productOptions = computed<Option[]>(() =>
    this.store.products().map((p) => ({ id: p.id, label: p.name })),
  );
  protected readonly courtierOptions = computed<Option[]>(() =>
    this.store.members().map((m) => ({ id: m.id, label: m.displayName || m.email || m.id })),
  );

  protected readonly rows = computed<DossierRow[]>(() => {
    const products = new Map(this.store.products().map((p) => [p.id, p.name]));
    const members = this.store.memberNames();
    return this.store.filtered().map((dossier) => ({
      dossier,
      assureName: this.store.assureName(dossier.assureId),
      productName: products.get(dossier.productId) ?? dossier.productId,
      courtierName: members.get(dossier.assignedTo) ?? '—',
    }));
  });
}
