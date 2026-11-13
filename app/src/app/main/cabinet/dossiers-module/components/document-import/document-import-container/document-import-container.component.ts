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
import { catchError, concatMap, EMPTY, finalize, from, map, of, switchMap, tap } from 'rxjs';
import { toBackendErrorMessage } from '../../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../../commons/authentication-module/store/auth.store';
import { DocumentsService } from '../../../services/documents.service';
import { DossierStore } from '../../../store/dossier.store';
import { defaultOcrSelection, formatOcrValue, mergeOcrFields, needsConfirmation, selectedOcrAnswers } from '../../../util/documents.utils';
import { DOCUMENT_IMPORT_STRUCTURE } from '../document-import.structure';

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
  templateUrl: './document-import-container.component.html',
  styleUrl: './document-import-container.component.scss',
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
  /** Fichiers choisis, chacun avec son type (pré-rempli avec le type du menu au moment du choix). */
  protected readonly files = signal<PickedFile[]>([]);
  protected readonly busy = signal<'upload' | 'analyze' | null>(null);
  /** Import de plusieurs fichiers : position dans la file (affichée « 2/5 »). */
  protected readonly progress = signal<{ done: number; total: number } | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly proposal = signal<{ documentId: string; fields: OcrField[] } | null>(null);
  protected readonly selection = signal<Partial<Record<CanonicalPath, boolean>>>({});

  protected readonly anyAnalyzable = computed(() => this.files().some(picked => isAnalyzableDocumentType(picked.type)));
  private _nextFileId = 0;
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

  /** Ajoute les fichiers choisis à la liste ; les fichiers refusés (format, taille) sont écartés avec un message. */
  protected pickFiles(list: FileList | null): void {
    const picked = Array.from(list ?? []);
    this.message.set(null);
    const accepted = picked.filter(file => DOSSIER_DOCUMENT_MIME_TYPES.includes(file.type) && file.size <= DOSSIER_DOCUMENT_MAX_BYTES);
    this.error.set(accepted.length < picked.length ? this.text.badFile : null);
    const type = this.type();
    this.files.update(files => [...files, ...accepted.map(file => ({ id: this._nextFileId++, file, type }))]);
  }

  protected setFileType(id: number, type: DossierDocumentType): void {
    this.files.update(files => files.map(picked => (picked.id === id ? { ...picked, type } : picked)));
  }

  protected removeFile(id: number): void {
    this.files.update(files => files.filter(picked => picked.id !== id));
  }

  /**
   * Envoie les fichiers l'un après l'autre : Storage (nom sûr et unique), enregistrement par le serveur, puis lecture
   * par l'IA si le type s'y prête. Les valeurs lues sont regroupées en une seule proposition. Un fichier en échec
   * n'arrête pas les suivants ; il reste dans la liste pour réessayer.
   */
  protected importFiles(): void {
    const queue = this.files();
    const key = this._key();
    if (!queue.length || !key) return;
    this.error.set(null);
    this.message.set(null);
    this.proposal.set(null);
    const fields: OcrField[] = [];
    const failed: string[] = [];
    let lastDocumentId: string | null = null;
    let analyzed = 0;
    from(queue)
      .pipe(
        concatMap((picked, index) => {
          this.progress.set(queue.length > 1 ? { done: index, total: queue.length } : null);
          this.busy.set('upload');
          const storagePath = `${dossierDocumentsFolder(key.cabinetId, key.dossierId)}/${picked.type}-${Date.now()}-${safeDocumentFileName(picked.file.name)}`;
          return this._service.upload(storagePath, picked.file).pipe(
            switchMap(() => this._service.register(key.dossierId, picked.type, storagePath, picked.file.name)),
            tap(() => this.removeFile(picked.id)),
            switchMap(({ documentId }) => {
              if (!isAnalyzableDocumentType(picked.type)) return of(null);
              this.busy.set('analyze');
              return this._service.analyze(key.dossierId, documentId).pipe(
                tap(({ status, ocrFields }) => {
                  if (status === 'failed') {
                    failed.push(picked.file.name);
                    return;
                  }
                  analyzed++;
                  lastDocumentId = documentId;
                  fields.push(...ocrFields);
                }),
              );
            }),
            catchError(() => {
              failed.push(picked.file.name);
              return of(null);
            }),
          );
        }),
        finalize(() => {
          this.busy.set(null);
          this.progress.set(null);
        }),
      )
      .subscribe({
        complete: () => {
          if (failed.length) this.error.set(`${this.text.someFailed} ${failed.join(', ')}`);
          if (analyzed && lastDocumentId) this.propose(lastDocumentId, mergeOcrFields(fields));
        },
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
    // Coupe le lien vers l'application (équivalent de noopener, qui empêcherait de piloter l'onglet).
    if (target) target.opener = null;
    this._service.downloadUrl(document.storagePath).subscribe({
      next: url => {
        if (target) target.location.href = url;
        else window.open(url, '_blank', 'noopener');
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

interface PickedFile {
  id: number;
  file: File;
  type: DossierDocumentType;
}
