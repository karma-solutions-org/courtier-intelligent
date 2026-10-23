import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DossierDocument, isAnalyzableDocumentType } from '@shared';
import { DOCUMENT_IMPORT_STRUCTURE } from './document-import.structure';

/** Documents du dossier : téléchargement et, si le dossier est modifiable, lecture par l'IA. */
@Component({
  selector: 'app-document-list',
  imports: [DatePipe, MatButtonModule, MatIconModule],
  template: `
    @if (documents().length) {
      <ul class="documents">
        @for (document of documents(); track document.id) {
          <li>
            <mat-icon class="doc-icon">description</mat-icon>
            <span class="name">
              {{ text.types[document.type] ?? document.type }} · {{ document.fileName ?? '—' }}
              <small>{{ text.statuses[document.status] ?? document.status }} · {{ document.createdAt?.toMillis() | date: 'd MMM y, HH:mm' }}</small>
            </span>
            @if (editable() && canAnalyze(document)) {
              @if (document.status === 'analyzed') {
                <button mat-button type="button" (click)="reviewed.emit(document)">{{ text.review }}</button>
              } @else {
                <button mat-button type="button" [disabled]="busy()" (click)="analyzed.emit(document.id)">{{ text.analyze }}</button>
              }
            }
            <button mat-icon-button type="button" [attr.aria-label]="text.download" (click)="downloaded.emit(document)">
              <mat-icon>download</mat-icon>
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="hint">{{ text.none }}</p>
    }
  `,
  styles: `
    .hint,
    small {
      color: var(--ci-text-muted);
      font-size: 13px;
    }

    .documents {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 4px;
        border-top: 1px solid var(--ci-border);
        border-radius: 8px;

        &:hover {
          background: var(--ci-navy-50);
        }
      }

      .name {
        display: flex;
        flex: 1;
        flex-direction: column;
      }
    }

    .doc-icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      font-size: 20px;
      color: var(--ci-navy-900);
      background: var(--ci-navy-50);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentListComponent {
  readonly documents = input.required<DossierDocument[]>();
  readonly editable = input(true);
  readonly busy = input(false);

  readonly reviewed = output<DossierDocument>();
  readonly analyzed = output<string>();
  /** Le parent doit ouvrir la fenêtre dans ce clic (sinon le navigateur la bloque). */
  readonly downloaded = output<DossierDocument>();

  protected readonly text = DOCUMENT_IMPORT_STRUCTURE;
  protected readonly canAnalyze = (document: DossierDocument) => isAnalyzableDocumentType(document.type);
}
