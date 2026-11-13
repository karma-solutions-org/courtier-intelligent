import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
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
import { catchError, concatMap, finalize, from, map, mergeMap, Observable, of, switchMap } from 'rxjs';
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
  /** Envoyé dès le choix, pour que l'IA reconnaisse son type. */
  storagePath: string;
  status: 'recognizing' | 'ready' | 'failed';
}

/**
 * « Pré-remplir depuis une pièce » : le courtier choisit ses fichiers ; l'IA reconnaît le type de chacun (modifiable). La CIN (ou le Kbis) est lue
 * par l'IA et remplit le formulaire ; les autres pièces (carte grise, permis…) sont seulement envoyées, puis rangées avec
 * le client et reprises dans ses dossiers.
 */
@Component({
  selector: 'app-assure-document-import',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressBarModule, MatSelectModule],
  templateUrl: './assure-document-import.component.html',
  styleUrl: './assure-document-import.component.scss',
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
  /** Toutes les pièces sont envoyées et ont un type (aucune en cours de reconnaissance ou en échec). */
  protected readonly canImport = computed(() => this.files().length > 0 && this.files().every(picked => picked.status === 'ready'));
  private _nextId = 0;

  /**
   * Ajoute les fichiers choisis et les envoie aussitôt dans le dépôt provisoire : l'IA reconnaît le type de chacun
   * (pré-sélectionné, à corriger si besoin). Non reconnu : « Autre ». Les fichiers refusés sont écartés.
   */
  protected pick(list: FileList | null): void {
    const cabinetId = this._auth.cabinetId();
    const uid = this._auth.user()?.uid;
    if (!cabinetId || !uid) return;
    const picked = Array.from(list ?? []);
    const accepted = picked.filter(file => ASSURE_DOCUMENT_MIME_TYPES.includes(file.type) && file.size <= ASSURE_DOCUMENT_MAX_BYTES);
    this.error.set(accepted.length < picked.length ? this.text.badFile : null);
    const added: PickedFile[] = accepted.map(file => {
      const id = this._nextId++;
      return {
        id,
        file,
        type: 'autre',
        storagePath: `${assureImportsFolder(cabinetId, uid)}/${Date.now()}-${id}-${safeDocumentFileName(file.name)}`,
        status: 'recognizing',
      };
    });
    this.files.update(files => [...files, ...added]);
    from(added)
      .pipe(
        mergeMap(
          picked =>
            this._service.uploadImport(picked.storagePath, picked.file).pipe(
              switchMap(() =>
                this._service.recognizePiece(picked.storagePath).pipe(
                  // IA indisponible ou quota atteint : le fichier est bien envoyé, le courtier choisit le type.
                  catchError(() => of({ type: null })),
                ),
              ),
              map(({ type }) => this.update(picked.id, { type: type ?? 'autre', status: 'ready' })),
              catchError(() => {
                this.update(picked.id, { status: 'failed' });
                return of(undefined);
              }),
            ),
          3,
        ),
      )
      .subscribe();
  }

  private update(id: number, patch: Partial<PickedFile>): void {
    this.files.update(files => files.map(picked => (picked.id === id ? { ...picked, ...patch } : picked)));
  }

  protected setType(id: number, type: AssureDocumentType): void {
    this.files.update(files => files.map(picked => (picked.id === id ? { ...picked, type } : picked)));
  }

  protected remove(id: number): void {
    this.files.update(files => files.filter(picked => picked.id !== id));
  }

  /**
   * Pièces déjà envoyées : la CIN et le Kbis sont lus pour pré-remplir le formulaire, l'un après l'autre. Chaque pièce
   * est transmise au conteneur, qui la range avec le client à sa création ; un fichier en échec reste dans la liste.
   */
  protected read(): void {
    const queue = this.files();
    if (!queue.length) return;
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
        concatMap(({ id, file, type, storagePath }) => {
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
          return values$.pipe(
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
