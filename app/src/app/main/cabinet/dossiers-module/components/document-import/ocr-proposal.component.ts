import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CanonicalData, CanonicalPath } from '@shared';
import type { OcrProposal } from '../../store/document-import.store';
import { formatOcrValue, needsConfirmation } from '../../util/documents.utils';
import { DOCUMENT_IMPORT_STRUCTURE } from './document-import.structure';

/** Valeurs lues dans un document, proposées champ par champ : seules les valeurs cochées sont appliquées. */
@Component({
  selector: 'app-ocr-proposal',
  imports: [DecimalPipe, MatButtonModule, MatCheckboxModule],
  template: `
    <h3>{{ text.proposalTitle }}</h3>
    @if (proposal().fields.length) {
      <p class="hint">{{ text.proposalHint }}</p>
      <ul>
        @for (field of proposal().fields; track field.canonicalPath) {
          <li>
            <mat-checkbox [checked]="!!selection()[field.canonicalPath]" (change)="toggled.emit({ path: field.canonicalPath, checked: $event.checked })">
              <strong>{{ labels().get(field.canonicalPath) ?? field.canonicalPath }}</strong> :
              {{ format(field.value) }}
            </mat-checkbox>
            <span class="meta">
              <span class="conf-bar" aria-hidden="true"
                ><span [class.low]="field.confidence < 0.8" [style.width.%]="field.confidence * 100"></span
              ></span>
              {{ text.confidence }} {{ field.confidence * 100 | number: '1.0-0' }} %
              @if (toConfirm(field)) {
                <span class="flag">{{ text.toConfirm }}</span>
              }
              @if (currentValue(field.canonicalPath); as value) {
                · {{ text.current }} : {{ value }}
              }
            </span>
          </li>
        }
      </ul>
      <div class="actions">
        <button mat-button type="button" (click)="cancelled.emit()">{{ text.cancel }}</button>
        <button mat-flat-button type="button" [disabled]="!selectedCount() || !editable()" (click)="applied.emit()">
          {{ text.apply }} ({{ selectedCount() }})
        </button>
      </div>
    } @else {
      <p class="hint">{{ text.noProposal }}</p>
      <div class="actions">
        <button mat-button type="button" (click)="cancelled.emit()">{{ text.cancel }}</button>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      margin: 12px 0;
      padding: 14px 16px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface-2);
    }

    h3 {
      margin: 0 0 4px;
      font-size: 15px;
    }

    .hint,
    .meta {
      color: var(--ci-text-muted);
      font-size: 13px;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
      padding: 8px 0;
      border-bottom: 1px dashed var(--ci-border);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      margin: 8px 0;
    }

    .meta {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }

    .conf-bar {
      display: inline-block;
      width: 64px;
      height: 6px;
      overflow: hidden;
      border-radius: 3px;
      background: var(--surface-3);

      span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--ci-success);
      }

      span.low {
        background: #ff9500;
      }
    }

    .flag {
      margin-left: 4px;
      padding: 1px 8px;
      border-radius: 8px;
      font-weight: 600;
      color: var(--ci-warning);
      background: var(--ci-warning-soft);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OcrProposalComponent {
  readonly proposal = input.required<OcrProposal>();
  readonly selection = input.required<Partial<Record<CanonicalPath, boolean>>>();
  readonly selectedCount = input(0);
  readonly editable = input(true);
  /** Libellés des questions du dossier, par chemin. */
  readonly labels = input.required<ReadonlyMap<string, string>>();
  /** Réponses actuelles du dossier (pour comparer avant d'appliquer). */
  readonly answers = input.required<CanonicalData>();

  readonly toggled = output<{ path: CanonicalPath; checked: boolean }>();
  readonly cancelled = output();
  readonly applied = output();

  protected readonly text = DOCUMENT_IMPORT_STRUCTURE;
  protected readonly format = formatOcrValue;
  protected readonly toConfirm = needsConfirmation;

  /** Valeur actuelle du dossier pour ce champ. */
  protected currentValue(path: CanonicalPath): string | null {
    const value = this.answers()[path];
    return value === undefined || value === null || value === '' ? null : formatOcrValue(value);
  }
}
