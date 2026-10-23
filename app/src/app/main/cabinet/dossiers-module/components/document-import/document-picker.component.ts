import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { DOSSIER_DOCUMENT_MIME_TYPES, DOSSIER_DOCUMENT_TYPES } from '@shared';
import type { PickedFile, PickedType } from '../../store/document-import.store';
import { DOCUMENT_IMPORT_STRUCTURE } from './document-import.structure';

/** Zone d'import : choix des fichiers et de leur type, envoi, avancement. */
@Component({
  selector: 'app-document-picker',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressBarModule, MatSelectModule],
  template: `
    <div class="dropzone">
      <mat-icon class="dz-icon" aria-hidden="true">cloud_upload</mat-icon>
      <p class="hint">{{ text.importHint }}</p>
      <div class="import">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ text.type }}</mat-label>
          <mat-select [ngModel]="type()" (ngModelChange)="typeChange.emit($event)">
            @for (t of pickTypes; track t) {
              <mat-option [value]="t">{{ text.types[t] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <input #picker type="file" multiple hidden [accept]="acceptedTypes" (change)="filesPicked.emit(picker.files); picker.value = ''" />
        <button mat-stroked-button type="button" [disabled]="!!busy()" (click)="picker.click()">
          <mat-icon>attach_file</mat-icon>{{ text.chooseFile }}
        </button>
        <button mat-flat-button type="button" [disabled]="!files().length || busy()" (click)="importRequested.emit()">
          {{ anyAnalyzable() ? text.upload : text.uploadOnly }}
        </button>
      </div>
      @if (files().length) {
        <ul class="picked">
          @for (picked of files(); track picked.id) {
            <li>
              <span class="name">{{ picked.file.name }}</span>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-select [ngModel]="picked.type" (ngModelChange)="fileTypeChange.emit({ id: picked.id, type: $event })" [disabled]="!!busy()">
                  @for (t of pickTypes; track t) {
                    <mat-option [value]="t">{{ text.types[t] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button mat-icon-button type="button" [attr.aria-label]="text.removeFile" [disabled]="!!busy()" (click)="fileRemoved.emit(picked.id)">
                <mat-icon>close</mat-icon>
              </button>
            </li>
          }
        </ul>
      }
    </div>
    @if (busy()) {
      <p class="status" role="status">
        {{ busy() === 'analyze' ? text.analyzing : text.uploading }}
        @if (progress(); as p) {
          ({{ p.done + 1 }}/{{ p.total }})
        }
      </p>
      <mat-progress-bar mode="indeterminate" />
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .hint,
    .status {
      color: var(--ci-text-muted);
      font-size: 13px;
    }

    .import {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin: 8px 0;
    }

    .dropzone {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      margin: 8px 0 12px;
      padding: 18px 16px;
      border: 1px dashed var(--border-strong);
      border-radius: 8px;
      text-align: center;
      background: var(--ci-surface-2);
      transition: border-color 0.15s, background 0.15s;

      &:hover {
        border-color: var(--ci-accent);
      }

      .hint {
        margin: 0;
      }
    }

    .picked {
      margin: 12px 0 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 0;
      }

      .name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .dz-icon {
      width: 40px;
      height: 40px;
      font-size: 40px;
      color: var(--ci-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPickerComponent {
  readonly type = input.required<PickedType>();
  readonly files = input.required<PickedFile[]>();
  readonly busy = input<'upload' | 'analyze' | null>(null);
  readonly progress = input<{ done: number; total: number } | null>(null);
  readonly anyAnalyzable = input(false);

  readonly typeChange = output<PickedType>();
  readonly filesPicked = output<FileList | null>();
  readonly fileTypeChange = output<{ id: number; type: PickedType }>();
  readonly fileRemoved = output<number>();
  readonly importRequested = output();

  protected readonly text = DOCUMENT_IMPORT_STRUCTURE;
  protected readonly acceptedTypes = DOSSIER_DOCUMENT_MIME_TYPES.join(',');
  /** Choix proposés à l'import : « auto » laisse l'IA reconnaître le type de chaque fichier. */
  protected readonly pickTypes: PickedType[] = ['auto', ...DOSSIER_DOCUMENT_TYPES];
}
