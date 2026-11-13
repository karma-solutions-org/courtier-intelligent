import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Assure } from '@shared';
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
  imports: [RouterLink, MatButtonModule, MatIconModule, InfiniteScrollDirective],
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

  protected nameOf(assure: Assure): string {
    return displayName(assure);
  }
}
