import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TrashStore } from '../../store/trash.store';
import { TrashFiltersComponent } from '../trash-filters/trash-filters.component';
import { TrashGroupComponent } from '../trash-group/trash-group.component';

/** Corbeille (admin) : clients et dossiers supprimés, à restaurer ou à supprimer définitivement. */
@Component({
  selector: 'app-trash-container',
  imports: [MatIconModule, TrashFiltersComponent, TrashGroupComponent],
  providers: [TrashStore],
  template: `
    <header class="head">
      <h1>Corbeille</h1>
      <p class="sub">
        Les clients et dossiers supprimés restent ici jusqu'à leur restauration ou leur suppression définitive.
        Un client restauré revient avec les dossiers supprimés en même temps que lui.
      </p>
    </header>

    <app-trash-filters
      [query]="store.query()"
      [kind]="store.kind()"
      [period]="store.period()"
      [hasFilters]="store.hasFilters()"
      (queryChange)="store.setQuery($event)"
      (kindChange)="store.setKind($event)"
      (periodChange)="store.setPeriod($event)"
      (cleared)="store.clearFilters()"
    />

    @if (store.loadError()) {
      <p class="banner error" role="alert"><mat-icon>error_outline</mat-icon>{{ store.loadError() }}</p>
    }
    @if (store.searchUnavailable()) {
      <p class="banner" role="status">
        <mat-icon>info</mat-icon>Recherche avancée indisponible : résultats limités aux éléments chargés.
      </p>
    }

    @for (group of store.visibleGroups(); track group.title) {
      <app-trash-group
        [group]="group"
        [busy]="store.busy()"
        [confirming]="store.confirming()"
        [hasFilters]="store.hasFilters()"
        (restore)="store.restore($event)"
        (deleteForever)="store.deleteForever($event)"
        (confirmingChange)="store.confirm($event)"
        (loadMore)="store.loadMore($event)"
      />
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
    }

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    .sub {
      margin: 4px 0 0;
      color: var(--ci-text-muted);
    }

    .banner {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 0;
      padding: 10px 14px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      color: var(--ci-text-muted);

      &.error {
        color: var(--ci-danger, #c62828);
        background: var(--ci-danger-soft, #fdecea);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashContainerComponent {
  protected readonly store = inject(TrashStore);
}
