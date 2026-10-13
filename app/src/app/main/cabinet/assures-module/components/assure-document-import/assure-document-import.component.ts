import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  ASSURE_DOCUMENT_MAX_BYTES,
  ASSURE_DOCUMENT_MIME_TYPES,
  assureImportsFolder,
  AssureDocumentType,
  AssureOcrValues,
  safeDocumentFileName,
} from '@shared';
import { catchError, EMPTY, finalize, switchMap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { AssuresService } from '../../services/assures.service';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Pièce lue, à ranger avec le client à sa création. */
export interface ReadPiece {
  type: AssureDocumentType;
  storagePath: string;
  fileName: string;
  values: AssureOcrValues;
}

/** « Pré-remplir depuis une pièce » : la CIN (ou le Kbis) est envoyée, lue par l'IA, et remplit le formulaire. */
@Component({
  selector: 'app-assure-document-import',
  imports: [MatButtonModule, MatButtonToggleModule, MatIconModule, MatProgressBarModule],
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
        <mat-button-toggle-group
          [value]="type()"
          (change)="type.set($event.value)"
          [attr.aria-label]="text.type"
          [disabled]="busy()"
        >
          <mat-button-toggle value="cin">{{ text.types.cin }}</mat-button-toggle>
          <mat-button-toggle value="kbis">{{ text.types.kbis }}</mat-button-toggle>
        </mat-button-toggle-group>

        <input #picker type="file" hidden accept="application/pdf,image/jpeg,image/png" (change)="read(picker.files); picker.value = ''" />
        <button mat-flat-button type="button" [disabled]="busy()" (click)="picker.click()">
          <mat-icon>upload_file</mat-icon>{{ text.choose }}
        </button>
      </div>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
        <p class="status" role="status">{{ text.reading }}</p>
      }
      @if (done(); as done) {
        <p class="status ok" role="status"><mat-icon>check_circle</mat-icon>{{ done }}</p>
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
  /** Pièce lue : le conteneur remplit le formulaire et la range avec le client à sa création. */
  readonly pieceRead = output<ReadPiece>();

  private readonly _service = inject(AssuresService);
  private readonly _auth = inject(AuthStore);
  protected readonly text = ASSURES_STRUCTURE.piece;

  protected readonly type = signal<AssureDocumentType>('cin');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);

  /** Envoi dans le dépôt provisoire du courtier, puis lecture : tout part dès le choix du fichier. */
  protected read(files: FileList | null): void {
    const file = files?.item(0);
    const cabinetId = this._auth.cabinetId();
    const uid = this._auth.user()?.uid;
    if (!file || !cabinetId || !uid) return;
    this.done.set(null);
    if (!ASSURE_DOCUMENT_MIME_TYPES.includes(file.type) || file.size > ASSURE_DOCUMENT_MAX_BYTES) {
      this.error.set(this.text.badFile);
      return;
    }
    const type = this.type();
    const storagePath = `${assureImportsFolder(cabinetId, uid)}/${type}-${Date.now()}-${safeDocumentFileName(file.name)}`;
    this.error.set(null);
    this.busy.set(true);
    this._service
      .uploadImport(storagePath, file)
      .pipe(
        switchMap(() => this._service.readPiece(type, storagePath)),
        catchError((error) => {
          this.error.set(toBackendErrorMessage(error));
          return EMPTY;
        }),
        finalize(() => this.busy.set(false)),
      )
      .subscribe(({ values, readable }) => {
        const count = Object.keys(values).length;
        if (!readable || !count) {
          this.error.set(this.text.unreadable);
        } else {
          this.done.set(`${count} ${this.text.filled}`);
        }
        // Même illisible, la pièce est gardée : elle sera rangée avec le client.
        this.pieceRead.emit({ type, storagePath, fileName: file.name, values });
      });
  }
}
