import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import {
  CanonicalPath,
  DOSSIER_DOCUMENT_MAX_BYTES,
  DOSSIER_DOCUMENT_MIME_TYPES,
  DOSSIER_DOCUMENT_TYPES,
  DossierDocument,
  DossierDocumentType,
  dossierDocumentsFolder,
  isAnalyzableDocumentType,
  OcrField,
  safeDocumentFileName,
} from '@shared';
import { catchError, EMPTY, finalize, map, of, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { DocumentsService } from '../../services/documents.service';
import { DossierStore } from '../../store/dossier.store';
import { defaultOcrSelection, formatOcrValue, needsConfirmation, selectedOcrAnswers } from '../../util/documents.utils';
import { DOCUMENT_IMPORT_STRUCTURE } from './document-import.structure';

/**
 * Documents d'un dossier (E12) : liste avec téléchargement et, si le dossier est modifiable, « Importer un document ».
 * Le document est envoyé dans Storage, enregistré (documents-enregistrer) puis lu par l'IA (documents-analyser) ; les
 * valeurs lues sont proposées champ par champ et ne sont écrites qu'au clic sur « Appliquer », via la sauvegarde du dossier
 * (dossiers-sauvegarder : validation et complétude restent côté serveur).
 */
@Component({
  selector: 'app-document-import-container',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    <section class="card">
      <h2>{{ text.title }}</h2>

      @if (editable()) {
        <p class="hint">{{ text.importHint }}</p>
        <div class="import">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ text.type }}</mat-label>
            <mat-select [ngModel]="type()" (ngModelChange)="type.set($event)">
              @for (t of types; track t) {
                <mat-option [value]="t">{{ text.types[t] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <input #picker type="file" hidden [accept]="acceptedTypes" (change)="pickFile(picker.files); picker.value = ''" />
          <button mat-stroked-button type="button" (click)="picker.click()">
            <mat-icon>attach_file</mat-icon>{{ file()?.name ?? text.chooseFile }}
          </button>
          <button mat-flat-button type="button" [disabled]="!file() || busy()" (click)="importFile()">
            {{ analyzable() ? text.upload : text.uploadOnly }}
          </button>
        </div>
        @if (busy()) {
          <p class="status" role="status">{{ busy() === 'analyze' ? text.analyzing : text.uploading }}</p>
          <mat-progress-bar mode="indeterminate" />
        }
      }

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (message()) {
        <p class="success" role="status">{{ message() }}</p>
      }

      @if (proposal(); as current) {
        <div class="proposal">
          <h3>{{ text.proposalTitle }}</h3>
          @if (current.fields.length) {
            <p class="hint">{{ text.proposalHint }}</p>
            <ul>
              @for (field of current.fields; track field.canonicalPath) {
                <li>
                  <mat-checkbox [checked]="!!selection()[field.canonicalPath]" (change)="toggle(field.canonicalPath, $event.checked)">
                    <strong>{{ store.labels().get(field.canonicalPath) ?? field.canonicalPath }}</strong> :
                    {{ format(field.value) }}
                  </mat-checkbox>
                  <span class="meta">
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
              <button mat-button type="button" (click)="proposal.set(null)">{{ text.cancel }}</button>
              <button mat-flat-button type="button" [disabled]="!selectedCount() || !editable()" (click)="apply()">
                {{ text.apply }} ({{ selectedCount() }})
              </button>
            </div>
          } @else {
            <p class="hint">{{ text.noProposal }}</p>
            <div class="actions">
              <button mat-button type="button" (click)="proposal.set(null)">{{ text.cancel }}</button>
            </div>
          }
        </div>
      }

      @if (documents().length) {
        <ul class="documents">
          @for (document of documents(); track document.id) {
            <li>
              <mat-icon>description</mat-icon>
              <span class="name">
                {{ text.types[document.type] ?? document.type }} · {{ document.fileName ?? '—' }}
                <small>{{ text.statuses[document.status] ?? document.status }} · {{ document.createdAt?.toMillis() | date: 'd MMM y, HH:mm' }}</small>
              </span>
              @if (editable() && canAnalyze(document)) {
                @if (document.status === 'analyzed') {
                  <button mat-button type="button" (click)="review(document)">{{ text.review }}</button>
                } @else {
                  <button mat-button type="button" [disabled]="busy()" (click)="analyze(document.id)">{{ text.analyze }}</button>
                }
              }
              <button mat-icon-button type="button" [attr.aria-label]="text.download" (click)="download(document)">
                <mat-icon>download</mat-icon>
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="hint">{{ text.none }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .card {
      padding: 20px 24px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
    }

    h2 {
      margin: 0 0 8px;
      font-size: 17px;
      font-weight: 600;
    }

    h3 {
      margin: 0 0 4px;
      font-size: 15px;
    }

    .hint,
    small,
    .meta,
    .status {
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .import,
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 8px 0;
    }

    .actions {
      justify-content: flex-end;
    }

    .proposal {
      margin: 12px 0;
      padding: 14px 16px;
      border-radius: 10px;
      background: var(--mat-sys-surface-container-low);

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
      }
    }

    .flag {
      margin-left: 4px;
      padding: 1px 8px;
      border-radius: 10px;
      color: var(--mat-sys-on-tertiary-container);
      background: var(--mat-sys-tertiary-container);
    }

    .documents {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }

      .name {
        display: flex;
        flex: 1;
        flex-direction: column;
      }
    }

    .error {
      padding: 10px 12px;
      border-radius: 10px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }

    .success {
      color: #1e7d50;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentImportContainerComponent {
  /** Import et application des valeurs lues (dossier modifiable) ; sinon, liste seule. */
  readonly editable = input(true);

  protected readonly store = inject(DossierStore);
  private readonly _authStore = inject(AuthStore);
  private readonly _service = inject(DocumentsService);

  protected readonly text = DOCUMENT_IMPORT_STRUCTURE;
  protected readonly types = DOSSIER_DOCUMENT_TYPES;
  protected readonly acceptedTypes = DOSSIER_DOCUMENT_MIME_TYPES.join(',');
  protected readonly format = formatOcrValue;
  protected readonly toConfirm = needsConfirmation;
  protected readonly canAnalyze = (document: DossierDocument) => isAnalyzableDocumentType(document.type);

  protected readonly type = signal<DossierDocumentType>('carte_grise');
  protected readonly file = signal<File | null>(null);
  protected readonly busy = signal<'upload' | 'analyze' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly proposal = signal<{ documentId: string; fields: OcrField[] } | null>(null);
  protected readonly selection = signal<Partial<Record<CanonicalPath, boolean>>>({});

  protected readonly analyzable = computed(() => isAnalyzableDocumentType(this.type()));
  protected readonly selectedCount = computed(() => Object.keys(selectedOcrAnswers(this.proposal()?.fields ?? [], this.selection())).length);

  private readonly _key = computed(() => {
    const cabinetId = this._authStore.cabinetId();
    const dossierId = this.store.selectedId();
    return cabinetId && dossierId ? { cabinetId, dossierId } : null;
  });

  /** Documents du dossier, du plus récent au plus ancien (devis des offres saisies à la main compris). */
  protected readonly documents = toSignal(
    toObservable(this._key).pipe(
      switchMap(key => (key ? this._service.watchDocuments(key.cabinetId, key.dossierId) : of([]))),
      map(documents => [...documents].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))),
    ),
    { initialValue: [] as DossierDocument[] },
  );

  protected pickFile(files: FileList | null): void {
    const file = files?.item(0) ?? null;
    this.message.set(null);
    if (file && (!DOSSIER_DOCUMENT_MIME_TYPES.includes(file.type) || file.size > DOSSIER_DOCUMENT_MAX_BYTES)) {
      this.file.set(null);
      this.error.set(this.text.badFile);
      return;
    }
    this.error.set(null);
    this.file.set(file);
  }

  /** Envoi dans Storage (nom de fichier sûr et unique), enregistrement par le serveur, puis lecture si le type s'y prête. */
  protected importFile(): void {
    const file = this.file();
    const key = this._key();
    if (!file || !key) return;
    const type = this.type();
    const storagePath = `${dossierDocumentsFolder(key.cabinetId, key.dossierId)}/${type}-${Date.now()}-${safeDocumentFileName(file.name)}`;
    this.error.set(null);
    this.message.set(null);
    this.busy.set('upload');
    this._service
      .upload(storagePath, file)
      .pipe(
        switchMap(() => this._service.register(key.dossierId, type, storagePath, file.name)),
        tap(() => this.file.set(null)),
        catchError(error => {
          this.error.set(toBackendErrorMessage(error));
          return EMPTY;
        }),
        finalize(() => this.busy.set(null)),
      )
      .subscribe(({ documentId }) => {
        if (isAnalyzableDocumentType(type)) this.analyze(documentId);
      });
  }

  protected analyze(documentId: string): void {
    const dossierId = this.store.selectedId();
    if (!dossierId) return;
    this.error.set(null);
    this.message.set(null);
    this.busy.set('analyze');
    this._service
      .analyze(dossierId, documentId)
      .pipe(
        catchError(error => {
          this.error.set(toBackendErrorMessage(error));
          return EMPTY;
        }),
        finalize(() => this.busy.set(null)),
      )
      .subscribe(({ status, ocrFields }) => {
        if (status === 'failed') {
          this.error.set(this.text.failed);
          return;
        }
        this.propose(documentId, ocrFields);
      });
  }

  protected review(document: DossierDocument): void {
    this.message.set(null);
    this.propose(document.id, document.ocrFields ?? []);
  }

  protected toggle(path: CanonicalPath, checked: boolean): void {
    this.selection.update(selection => ({ ...selection, [path]: checked }));
  }

  /** Valeur actuelle du dossier pour ce champ (pour comparer avant d'appliquer). */
  protected currentValue(path: CanonicalPath): string | null {
    const value = this.store.answers()[path];
    return value === undefined || value === null || value === '' ? null : formatOcrValue(value);
  }

  /** Seules les valeurs cochées sont écrites, par la sauvegarde habituelle du dossier (dossiers-sauvegarder). */
  protected apply(): void {
    const answers = selectedOcrAnswers(this.proposal()?.fields ?? [], this.selection());
    for (const [path, value] of Object.entries(answers)) {
      this.store.edit(path as CanonicalPath, value);
    }
    this.store.saveNow({ event: true });
    this.proposal.set(null);
    this.message.set(this.text.applied);
  }

  protected download(document: DossierDocument): void {
    // Fenêtre ouverte tout de suite (sinon bloquée par le navigateur), puis dirigée vers le lien de téléchargement.
    const target = window.open('', '_blank');
    this._service.downloadUrl(document.storagePath).subscribe({
      next: url => {
        if (target) target.location.href = url;
        else window.open(url, '_blank');
      },
      error: error => {
        target?.close();
        this.error.set(toBackendErrorMessage(error));
      },
    });
  }

  private propose(documentId: string, fields: OcrField[]): void {
    this.proposal.set({ documentId, fields });
    this.selection.set(defaultOcrSelection(fields));
  }
}
