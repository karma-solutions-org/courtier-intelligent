import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import {
  CanonicalData,
  CanonicalPath,
  DOSSIER_DOCUMENT_MIME_TYPES,
  DOSSIER_DOCUMENT_TYPES,
  DossierDocument,
  DossierDocumentType,
  isAnalyzableDocumentType,
} from '@shared';
import { DocumentImportBusy, OcrProposal, PickedDocumentFile } from '../../../models/document-import.model';
import { formatOcrValue, needsConfirmation } from '../../../util/documents.utils';
import { DOCUMENT_IMPORT_STRUCTURE } from '../document-import.structure';

/**
 * Documents d'un dossier : liste avec téléchargement et, si le dossier est modifiable, « Importer un document » ;
 * les valeurs lues par l'IA sont proposées champ par champ, à cocher avant de les appliquer.
 */
@Component({
  selector: 'app-document-import-presentation',
  imports: [DatePipe, DecimalPipe, FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatProgressBarModule, MatSelectModule],
  templateUrl: './document-import-presentation.component.html',
  styleUrl: './document-import-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentImportPresentationComponent {
  /** Import et application des valeurs lues (dossier modifiable) ; sinon, liste seule. */
  readonly editable = input(true);
  readonly documents = input<DossierDocument[]>([]);
  /** Type proposé pour les prochains fichiers choisis. */
  readonly type = input<DossierDocumentType>('carte_grise');
  readonly files = input<PickedDocumentFile[]>([]);
  readonly busy = input<DocumentImportBusy>(null);
  /** Import de plusieurs fichiers : position dans la file (affichée « 2/5 »). */
  readonly progress = input<{ done: number; total: number } | null>(null);
  readonly error = input<string | null>(null);
  readonly message = input<string | null>(null);
  readonly proposal = input<OcrProposal | null>(null);
  readonly selection = input<Partial<Record<CanonicalPath, boolean>>>({});
  readonly selectedCount = input(0);
  readonly anyAnalyzable = input(false);
  /** Libellés des champs du questionnaire, par chemin canonique. */
  readonly labels = input<Map<CanonicalPath, string>>(new Map());
  /** Réponses actuelles du dossier (pour comparer avant d'appliquer). */
  readonly answers = input<CanonicalData>({});

  readonly typeChanged = output<DossierDocumentType>();
  readonly filesPicked = output<FileList | null>();
  readonly fileTypeChanged = output<{ id: number; type: DossierDocumentType }>();
  readonly fileRemoved = output<number>();
  readonly importRequested = output<void>();
  readonly analyzeRequested = output<string>();
  readonly reviewRequested = output<DossierDocument>();
  readonly selectionToggled = output<{ path: CanonicalPath; checked: boolean }>();
  readonly applyRequested = output<void>();
  readonly proposalDismissed = output<void>();
  readonly downloadRequested = output<DossierDocument>();

  protected readonly text = DOCUMENT_IMPORT_STRUCTURE;
  protected readonly types = DOSSIER_DOCUMENT_TYPES;
  protected readonly acceptedTypes = DOSSIER_DOCUMENT_MIME_TYPES.join(',');
  protected readonly format = formatOcrValue;
  protected readonly toConfirm = needsConfirmation;
  protected readonly canAnalyze = (document: DossierDocument) => isAnalyzableDocumentType(document.type);

  /** Valeur actuelle du dossier pour ce champ (pour comparer avant d'appliquer). */
  protected currentValue(path: CanonicalPath): string | null {
    const value = this.answers()[path];
    return value === undefined || value === null || value === '' ? null : formatOcrValue(value);
  }
}
