import { CardPresentationComponent } from '../../../../../../core/components/card/card-presentation/card-presentation.component';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { InfiniteScrollDirective } from '../../../../../../core/directives/infinite-scroll.directive';
import { TrashGroup, TrashKindFilter, TrashRow } from '../../../models/trash.model';
import { TrashKind } from '../../../services/trash.service';

/** Corbeille : filtres, groupes (clients, dossiers), restauration et suppression définitive confirmée en ligne. */
@Component({
  selector: 'app-trash-presentation',
  imports: [CardPresentationComponent, DatePipe, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule, InfiniteScrollDirective],
  templateUrl: './trash-presentation.component.html',
  styleUrl: './trash-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashPresentationComponent {
  readonly groups = input.required<TrashGroup[]>();
  readonly query = input.required<string>();
  readonly kind = input.required<TrashKindFilter>();
  /** Période de suppression en jours (0 = toutes). */
  readonly period = input.required<number>();
  readonly hasFilters = input.required<boolean>();
  /** Erreur de lecture Firestore : bandeau au lieu d'une liste vide trompeuse. */
  readonly loadError = input<string | null>(null);
  /** Elasticsearch en échec : résultats limités aux éléments chargés. */
  readonly searchUnavailable = input(false);
  readonly busy = input(false);
  /** Ligne dont la suppression définitive attend une confirmation. */
  readonly confirming = input<string | null>(null);

  readonly queryChanged = output<string>();
  readonly kindChanged = output<TrashKindFilter>();
  readonly periodChanged = output<number>();
  readonly filtersCleared = output<void>();
  readonly confirmingChanged = output<string | null>();
  readonly restoreRequested = output<TrashRow>();
  readonly deleteRequested = output<TrashRow>();
  readonly loadMore = output<TrashKind>();

  /** Bouton « Annuler » de la confirmation en ligne : reçoit le focus à l'ouverture (Entrée ne supprime pas par mégarde). */
  private readonly _cancelDelete = viewChild<ElementRef<HTMLButtonElement>>('cancelDelete');

  constructor() {
    effect(() => this._cancelDelete()?.nativeElement.focus());
  }
}
