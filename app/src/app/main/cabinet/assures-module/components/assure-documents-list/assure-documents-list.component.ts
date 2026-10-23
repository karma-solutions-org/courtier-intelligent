import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AssureDocument } from '@shared';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Pièces rangées avec le client, chacune à ouvrir. */
@Component({
  selector: 'app-assure-documents-list',
  imports: [DatePipe, MatButtonModule, MatIconModule],
  template: `
    @if (documents().length) {
      <ul class="pieces">
        @for (document of documents(); track document.id) {
          <li>
            <mat-icon aria-hidden="true">description</mat-icon>
            <span class="piece-name">{{ pieceText.types[document.type] }} · {{ document.fileName }}</span>
            <span class="piece-date">{{ document.createdAt?.toMillis() | date: 'd MMM y' }}</span>
            <button mat-button type="button" (click)="opened.emit(document)">{{ pieceText.open }}</button>
          </li>
        }
      </ul>
    } @else {
      <p class="empty">{{ structure.noDocuments }}</p>
    }
  `,
  styles: `
    .empty {
      margin: 0;
      color: var(--ci-text-muted);
    }

    .pieces {
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px solid var(--ci-border);
      }

      .piece-name {
        flex: 1;
        overflow-wrap: anywhere;
      }

      .piece-date {
        font-size: 13px;
        color: var(--ci-text-muted);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDocumentsListComponent {
  readonly documents = input.required<AssureDocument[]>();
  readonly opened = output<AssureDocument>();
  protected readonly structure = ASSURES_STRUCTURE.detail;
  protected readonly pieceText = ASSURES_STRUCTURE.piece;
}
