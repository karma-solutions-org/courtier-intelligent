import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { InfiniteScrollDirective } from '../../../../../core/directives/infinite-scroll.directive';
import type { TrashKind } from '../../services/trash.service';
import { TrashGroup, TrashRow } from '../../util/trash.utils';

/** Un groupe de la corbeille (clients ou dossiers) : ses lignes, à restaurer ou à supprimer définitivement. */
@Component({
  selector: 'app-trash-group',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule, InfiniteScrollDirective],
  template: `
    <section class="card">
      <h2>{{ group().title }} ({{ group().rows.length }}{{ group().hasMore ? '+' : '' }})</h2>
      @if (group().rows.length) {
        <ul class="rows">
          @for (row of group().rows; track row.id) {
            <li>
              <div class="what">
                <span class="title">{{ row.title }}</span>
                <span class="detail">{{ row.detail }} · Supprimé le {{ row.deletedAt?.toMillis() | date: 'dd/MM/y à HH:mm' }}</span>
                @if (row.blocked) {
                  <span class="detail">{{ row.blocked }}</span>
                }
                @if (row.protected) {
                  <span class="detail">Proposition envoyée : conservé, suppression définitive impossible.</span>
                }
              </div>
              @if (confirming() === row.id) {
                <span class="confirm" role="alert">
                  Supprimer définitivement « {{ row.title }} » ? Action irréversible.
                  <button
                    #cancelDelete
                    mat-button
                    type="button"
                    [attr.aria-label]="'Annuler la suppression définitive de ' + row.title"
                    (click)="confirmingChange.emit(null)"
                  >
                    Annuler
                  </button>
                  <button
                    mat-flat-button
                    class="danger"
                    type="button"
                    [disabled]="busy()"
                    [attr.aria-label]="'Confirmer la suppression définitive de ' + row.title"
                    (click)="deleteForever.emit(row)"
                  >
                    Confirmer la suppression
                  </button>
                </span>
              } @else {
                <div class="actions">
                  <button
                    mat-stroked-button
                    type="button"
                    [disabled]="busy() || !!row.blocked"
                    [attr.aria-label]="'Restaurer ' + row.title"
                    (click)="restore.emit(row)"
                  >
                    <mat-icon>restore_from_trash</mat-icon>Restaurer
                  </button>
                  @if (!row.protected) {
                    <button
                      mat-button
                      type="button"
                      class="danger-text"
                      [disabled]="busy()"
                      [attr.aria-label]="'Supprimer définitivement ' + row.title"
                      (click)="confirmingChange.emit(row.id)"
                    >
                      <mat-icon>delete_forever</mat-icon>Supprimer définitivement
                    </button>
                  }
                </div>
              }
            </li>
          }
        </ul>
      } @else if (group().loading) {
        <div class="loading" role="status"><mat-progress-spinner mode="indeterminate" diameter="24" />Chargement…</div>
      } @else if (!group().hasMore) {
        <p class="empty">{{ hasFilters() ? 'Aucun élément ne correspond aux filtres.' : group().empty }}</p>
      }
      <div
        class="more"
        appInfiniteScroll
        [appInfiniteScrollDisabled]="!group().hasMore || group().loadingMore"
        [appInfiniteScrollCount]="group().loadedCount"
        (reached)="loadMore.emit(group().kind)"
      >
        @if (group().hasMore) {
          <span>Chargement de la suite…</span>
        }
      </div>
    </section>
  `,
  styles: `
    .card {
      padding: 20px 24px;
      border: 1px solid var(--ci-border);
      border-radius: 12px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    h2 {
      margin: 0 0 12px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ci-text-muted);
    }

    .rows {
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid var(--ci-border);

        &:last-child {
          border-bottom: 0;
        }
      }
    }

    .what {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .title {
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .detail {
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .actions,
    .confirm {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .loading {
      display: flex;
      gap: 8px;
      align-items: center;
      color: var(--ci-text-muted);
    }

    @media (max-width: 600px) {
      .confirm {
        flex-direction: column;
        align-items: stretch;
        width: 100%;
      }
    }

    .danger-text {
      color: var(--ci-danger, #c62828);
    }

    .danger {
      background: var(--ci-danger, #c62828);
      color: #fff;
    }

    .empty {
      margin: 0;
      color: var(--ci-text-muted);
    }

    .more {
      min-height: 1px;
      padding: 8px;
      text-align: center;
      font-size: 13px;
      color: var(--ci-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashGroupComponent {
  readonly group = input.required<TrashGroup>();
  readonly busy = input(false);
  /** Ligne dont la suppression définitive attend confirmation. */
  readonly confirming = input<string | null>(null);
  readonly hasFilters = input(false);

  readonly restore = output<TrashRow>();
  readonly deleteForever = output<TrashRow>();
  /** Ouvre (id de la ligne) ou ferme (null) la confirmation de suppression définitive. */
  readonly confirmingChange = output<string | null>();
  readonly loadMore = output<TrashKind>();

  /** Bouton « Annuler » de la confirmation en ligne : reçoit le focus à l'ouverture (Entrée ne supprime pas par mégarde). */
  private readonly _cancelDelete = viewChild<ElementRef<HTMLButtonElement>>('cancelDelete');

  constructor() {
    effect(() => this._cancelDelete()?.nativeElement.focus());
  }
}
