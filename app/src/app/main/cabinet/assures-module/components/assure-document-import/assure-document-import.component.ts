import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import {
  ASSURE_DOCUMENT_MAX_BYTES,
  ASSURE_DOCUMENT_MIME_TYPES,
  ASSURE_DOCUMENT_TYPES,
  assureImportsFolder,
  AssureDocumentType,
  AssureOcrValues,
  isAssureReadableType,
  safeDocumentFileName,
} from '@shared';
import { catchError, concatMap, finalize, from, map, Observable, of, switchMap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { AssuresService } from '../../services/assures.service';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Pièce envoyée (et lue si c'est une CIN ou un Kbis), à ranger avec le client à sa création. */
export interface ReadPiece {
  type: AssureDocumentType;
  storagePath: string;
  fileName: string;
  values: AssureOcrValues;
}

interface PickedFile {
  id: number;
  file: File;
  type: AssureDocumentType;
}

/**
 * « Pré-remplir depuis une pièce » : le courtier choisit ses fichiers et le type de chacun. La CIN (ou le Kbis) est lue
 * par l'IA et remplit le formulaire ; les autres pièces (carte grise, permis…) sont seulement envoyées, puis rangées avec
 * le client et reprises dans ses dossiers.
 */
@Component({
  selector: 'app-assure-document-import',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressBarModule, MatSelectModule],
  template: `
    <section class="card">
      <div class="head">
        <mat-icon aria-hidden="true">badge</mat-icon>
        <div>
          <h2>{{ text.title }}</h2>
          <p>{{ text.hint }}</p>
        </div>
      </div>

      <div class="row">
        <input #picker type="file" multiple hidden accept="application/pdf,image/jpeg,image/png" (change)="pick(picker.files); picker.value = ''" />
        <button mat-stroked-button type="button" [disabled]="busy()" (click)="picker.click()">
          <mat-icon>attach_file</mat-icon>{{ text.choose }}
        </button>
        <button mat-flat-button type="button" [disabled]="busy() || !files().length" (click)="read()">
          <mat-icon>upload_file</mat-icon>{{ text.import }}
        </button>
      </div>

      @if (files().length) {
        <ul class="picked">
          @for (picked of files(); track picked.id) {
            <li>
              <span class="name">{{ picked.file.name }}</span>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-select [ngModel]="picked.type" (ngModelChange)="setType(picked.id, $event)" [disabled]="busy()" [attr.aria-label]="text.type">
                  @for (t of types; track t) {
                    <mat-option [value]="t">{{ text.types[t] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button mat-icon-button type="button" [attr.aria-label]="text.removeFile" [disabled]="busy()" (click)="remove(picked.id)">
                <mat-icon>close</mat-icon>
              </button>
            </li>
          }
        </ul>
      }

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
        <p class="status" role="status">{{ text.reading }}</p>
      }
      @if (done(); as done) {
        <p class="status ok" role="status"><mat-icon>check_circle</mat-icon>{{ done }}</p>
      }
      @if (notice()) {
        <p class="status" role="status"><mat-icon>info</mat-icon>{{ notice() }}</p>
      }
      @if (error()) {
        <p class="status error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styles: `
    .card {
      display: grid;
      gap: 14px;
      padding: 20px 24px;
      border: 1px dashed var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
    }

    .head {
      display: flex;
      gap: 12px;
      align-items: flex-start;

      mat-icon {
        color: var(--ci-navy-900);
      }

      h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }

      p {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--ci-text-muted);
      }
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }

    .picked {
      display: grid;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        font-size: 13px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .status {
      display: flex;
      gap: 6px;
      align-items: center;
      margin: 0;
      font-size: 13px;
      color: var(--ci-text-muted);

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    }

    .ok {
      color: var(--ci-success, #14894f);
    }

    .error {
      color: var(--ci-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDocumentImportComponent {
  /** Pièce envoyée : le conteneur remplit le formulaire (CIN, Kbis) et la range avec le client à sa création. */
  readonly pieceRead = output<ReadPiece>();

  private readonly _service = inject(AssuresService);
  private readonly _auth = inject(AuthStore);
  protected readonly text = ASSURES_STRUCTURE.piece;
  protected readonly types = ASSURE_DOCUMENT_TYPES;

  protected readonly files = signal<PickedFile[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);
  /** Pièces sans information reconnue (verso, autre document…) : simple information, pas une erreur. */
  protected readonly notice = signal<string | null>(null);
  private _nextId = 0;

  /** Ajoute les fichiers choisis (type CIN par défaut, à changer ligne par ligne) ; les fichiers refusés sont écartés. */
  protected pick(list: FileList | null): void {
    const picked = Array.from(list ?? []);
    const accepted = picked.filter(file => ASSURE_DOCUMENT_MIME_TYPES.includes(file.type) && file.size <= ASSURE_DOCUMENT_MAX_BYTES);
    this.error.set(accepted.length < picked.length ? this.text.badFile : null);
    this.files.update(files => [...files, ...accepted.map(file => ({ id: this._nextId++, file, type: 'cin' as AssureDocumentType }))]);
  }

  protected setType(id: number, type: AssureDocumentType): void {
    this.files.update(files => files.map(picked => (picked.id === id ? { ...picked, type } : picked)));
  }

  protected remove(id: number): void {
    this.files.update(files => files.filter(picked => picked.id !== id));
  }

  /**
   * Envoi dans le dépôt provisoire du courtier, l'un après l'autre ; la CIN et le Kbis sont aussi lus pour pré-remplir
   * le formulaire. Chaque pièce envoyée est transmise au conteneur ; un fichier en échec reste dans la liste.
   */
  protected read(): void {
    const queue = this.files();
    const cabinetId = this._auth.cabinetId();
    const uid = this._auth.user()?.uid;
    if (!queue.length || !cabinetId || !uid) return;
    this.done.set(null);
    this.notice.set(null);
    this.error.set(null);
    const errors: string[] = [];
    const notRead: string[] = [];
    let filled = 0;
    let readCount = 0;
    let kept = 0;
    this.busy.set(true);
    from(queue)
      .pipe(
        concatMap(({ id, file, type }) => {
          const storagePath = `${assureImportsFolder(cabinetId, uid)}/${type}-${Date.now()}-${safeDocumentFileName(file.name)}`;
          const values$: Observable<AssureOcrValues> = isAssureReadableType(type)
            ? this._service.readPiece(type, storagePath).pipe(
                map(({ values, readable }) => {
                  readCount++;
                  const count = Object.keys(values).length;
                  if (!readable || !count) notRead.push(file.name);
                  filled += count;
                  return values;
                }),
              )
            : of({});
          return this._service.uploadImport(storagePath, file).pipe(
            switchMap(() => values$),
            map(values => {
              kept++;
              this.remove(id);
              // Même illisible, la pièce est gardée : elle sera rangée avec le client.
              this.pieceRead.emit({ type, storagePath, fileName: file.name, values });
            }),
            catchError(error => {
              errors.push(`${toBackendErrorMessage(error)} (${file.name})`);
              return of(undefined);
            }),
          );
        }),
        finalize(() => {
          this.busy.set(false);
          this.error.set(errors.length ? errors.join(' · ') : null);
          const messages = [filled ? `${filled} ${this.text.filled}` : null, kept ? `${kept} ${this.text.kept}` : null];
          this.done.set(messages.filter(Boolean).join(' ') || null);
          if (notRead.length) {
            // Aucune pièce d'identité lisible : le formulaire est à remplir à la main ; sinon, simple information.
            this.notice.set(filled ? `${this.text.notRead} ${notRead.join(', ')}` : readCount ? this.text.unreadable : null);
          }
        }),
      )
      .subscribe();
  }
}
