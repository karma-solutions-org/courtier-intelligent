import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Assure } from '@shared';
import { TableCellDirective } from '../../../../../../core/components/table/directives/table-cell.directive';
import { TableColumn } from '../../../../../../core/components/table/models/table-column.model';
import { TablePresentationComponent } from '../../../../../../core/components/table/table-presentation/table-presentation.component';
import { InfiniteScrollDirective } from '../../../../../../core/directives/infinite-scroll.directive';
import { AssureFilters, DEFAULT_ASSURE_FILTERS } from '../../../store/assures.store';
import { displayName } from '../../../util/assures.utils';
import { ASSURES_STRUCTURE } from '../../assures.structure';

/**
 * Liste des assurés (présentation CompliScan) : en-tête « Portefeuille », barre de filtres compacte,
 * tableau dans sa carte (nom en rose et email dessous) et défilement infini.
 */
@Component({
  selector: 'app-assures-list',
  imports: [RouterLink, MatButtonModule, MatIconModule, InfiniteScrollDirective, TablePresentationComponent, TableCellDirective],
  templateUrl: './assures-presentation.component.html',
  styleUrl: './assures-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssuresPresentationComponent {
  /** Assurés chargés, filtrés. */
  readonly assures = input<Assure[]>([]);
  readonly total = input(0);
  readonly query = input('');
  readonly filters = input<AssureFilters>(DEFAULT_ASSURE_FILTERS);
  readonly hasFilters = input(false);
  readonly loaded = input(false);
  readonly createUrl = input('');
  readonly detailBaseUrl = input('');
  readonly queryChanged = output<string>();
  /** Firestore a d'autres éléments : la sentinelle de bas de liste demande la tranche suivante. */
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  /** Nombre d'éléments chargés (avant filtres) : relance la sentinelle tant qu'elle reste visible. */
  readonly loadedCount = input(0);
  readonly loadMore = output<void>();
  readonly filtersChanged = output<Partial<AssureFilters>>();
  readonly filtersCleared = output<void>();

  protected readonly structure = ASSURES_STRUCTURE.list;
  protected readonly typeLabels = ASSURES_STRUCTURE.typeLabels;
  protected readonly types = ASSURES_STRUCTURE.types;

  protected readonly columns: TableColumn[] = [
    { key: 'name', label: this.structure.columns.name },
    { key: 'type', label: this.structure.columns.type },
    { key: 'identifier', label: this.structure.columns.identifier },
    { key: 'phone', label: this.structure.columns.phone },
    { key: 'city', label: this.structure.columns.city },
  ];
  protected readonly byId = (assure: Assure) => assure.id;
  /** Une ligne ouvre la fiche du client. */
  protected readonly rowLink = (assure: Assure) => [this.detailBaseUrl(), assure.id];

  protected typeLabel(assure: Assure): string {
    return this.typeLabels[assure.type];
  }

  protected nameOf(assure: Assure): string {
    return displayName(assure);
  }
}
