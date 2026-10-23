import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DocumentImportStore } from '../../store/document-import.store';
import { DossierStore } from '../../store/dossier.store';
import { DocumentListComponent } from './document-list.component';
import { DocumentPickerComponent } from './document-picker.component';
import { DOCUMENT_IMPORT_STRUCTURE } from './document-import.structure';
import { OcrProposalComponent } from './ocr-proposal.component';

/**
 * Documents d'un dossier (E12) : liste avec téléchargement et, si le dossier est modifiable, « Importer un document ».
 * Le document est envoyé dans Storage, enregistré (documents-enregistrer) puis lu par l'IA (documents-analyser) ; les
 * valeurs lues sont proposées champ par champ et ne sont écrites qu'au clic sur « Appliquer », via la sauvegarde du dossier
 * (dossiers-sauvegarder : validation et complétude restent côté serveur).
 */
@Component({
  selector: 'app-document-import-container',
  imports: [MatIconModule, DocumentListComponent, DocumentPickerComponent, OcrProposalComponent],
  providers: [DocumentImportStore],
  template: `
    <section class="card">
      <h2><mat-icon aria-hidden="true">upload_file</mat-icon>{{ text.title }}</h2>

      @if (editable()) {
        <app-document-picker
          [type]="importer.type()"
          [files]="importer.files()"
          [busy]="importer.busy()"
          [progress]="importer.progress()"
          [anyAnalyzable]="importer.anyAnalyzable()"
          (typeChange)="importer.setType($event)"
          (filesPicked)="importer.pickFiles($event)"
          (fileTypeChange)="importer.setFileType($event.id, $event.type)"
          (fileRemoved)="importer.removeFile($event)"
          (importRequested)="importer.importFiles()"
        />
      }

      @if (importer.error()) {
        <p class="error" role="alert">{{ importer.error() }}</p>
      }
      @if (importer.message()) {
        <p class="success" role="status">{{ importer.message() }}</p>
      }

      @if (importer.proposal(); as proposal) {
        <app-ocr-proposal
          [proposal]="proposal"
          [selection]="importer.selection()"
          [selectedCount]="importer.selectedCount()"
          [editable]="editable()"
          [labels]="dossier.labels()"
          [answers]="dossier.answers()"
          (toggled)="importer.toggle($event.path, $event.checked)"
          (cancelled)="importer.closeProposal()"
          (applied)="importer.apply()"
        />
      }

      <app-document-list
        [documents]="importer.documents()"
        [editable]="editable()"
        [busy]="!!importer.busy()"
        (reviewed)="importer.review($event)"
        (analyzed)="importer.analyze($event)"
        (downloaded)="importer.download($event)"
      />
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .card {
      padding: 20px 24px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 8px;
      font-size: 17px;
      font-weight: 600;

      mat-icon {
        color: var(--ci-accent);
      }
    }

    .error {
      padding: 10px 12px;
      border-radius: 8px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }

    .success {
      font-weight: 600;
      color: var(--ci-success);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentImportContainerComponent {
  /** Import et application des valeurs lues (dossier modifiable) ; sinon, liste seule. */
  readonly editable = input(true);

  protected readonly importer = inject(DocumentImportStore);
  protected readonly dossier = inject(DossierStore);
  protected readonly text = DOCUMENT_IMPORT_STRUCTURE;
}
