import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { Dossier, DOSSIER_STATUS_LABELS, DossierStatus } from '@shared';
import { InfiniteScrollDirective } from '../../../../../core/directives/infinite-scroll.directive';
import { DossierFilter, isDefaultFilter, STATUS_ORDER } from '../../util/dossiers.utils';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';
import { StatusChipComponent } from '../status-chip/status-chip.component';

/** Une ligne de la liste : le dossier et les noms déjà résolus (assuré, produit, courtier). */
export interface DossierRow {
  dossier: Dossier;
  assureName: string;
  productName: string;
  courtierName: string;
}

export interface Option {
  id: string;
  label: string;
}

/** Liste des dossiers : filtres (statut, produit, courtier, « Mes dossiers »), tableau et défilement infini. */
@Component({
  selector: 'app-dossiers-list',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    StatusChipComponent,
    InfiniteScrollDirective,
  ],
  templateUrl: './dossiers-list.component.html',
  styleUrl: './dossiers-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossiersListComponent {
  readonly rows = input<DossierRow[]>([]);
  readonly total = input(0);
  readonly filter = input.required<DossierFilter>();
  readonly products = input<Option[]>([]);
  readonly courtiers = input<Option[]>([]);
  readonly loaded = input(false);
  readonly createUrl = input('');
  readonly baseUrl = input('');
  readonly filterChanged = output<Partial<DossierFilter>>();
  readonly filterReset = output<void>();
  /** Firestore a d'autres éléments : la sentinelle de bas de liste demande la tranche suivante. */
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  /** Recherche Elasticsearch en cours. */
  readonly searching = input(false);
  /** Elasticsearch en échec : résultats limités aux dossiers chargés. */
  readonly searchUnavailable = input(false);
  /** Nombre d'éléments chargés (avant filtres) : relance la sentinelle tant qu'elle reste visible. */
  readonly loadedCount = input(0);
  readonly loadMore = output<void>();

  protected readonly structure = DOSSIERS_STRUCTURE.list;
  protected readonly statuses: DossierStatus[] = STATUS_ORDER;
  protected readonly statusLabels = DOSSIER_STATUS_LABELS;

  protected hasFilter(): boolean {
    const { status, productId, assignedTo, mine, query } = this.filter();
    return !!status || !!productId || !!assignedTo || mine || !!query.trim();
  }

  protected isDefault(): boolean {
    return isDefaultFilter(this.filter());
  }
}
