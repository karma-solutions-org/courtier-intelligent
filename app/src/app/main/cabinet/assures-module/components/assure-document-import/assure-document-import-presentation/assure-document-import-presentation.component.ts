import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ASSURE_DOCUMENT_TYPES, AssureDocumentType } from '@shared';
import { PickedFile } from '../../../models/assure-document-import.model';
import { ASSURES_STRUCTURE } from '../../assures.structure';

/** « Pré-remplir depuis une pièce » : choix des fichiers, type de chacun, lecture et messages. */
@Component({
  selector: 'app-assure-document-import-presentation',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressBarModule, MatSelectModule],
  templateUrl: './assure-document-import-presentation.component.html',
  styleUrl: './assure-document-import-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDocumentImportPresentationComponent {
  readonly files = input<PickedFile[]>([]);
  readonly busy = input(false);
  /** Toutes les pièces sont envoyées et ont un type. */
  readonly canImport = input(false);
  readonly done = input<string | null>(null);
  /** Pièces sans information reconnue : simple information, pas une erreur. */
  readonly notice = input<string | null>(null);
  readonly error = input<string | null>(null);

  readonly filesPicked = output<FileList | null>();
  readonly typeChanged = output<{ id: number; type: AssureDocumentType }>();
  readonly removed = output<number>();
  readonly importRequested = output<void>();

  protected readonly text = ASSURES_STRUCTURE.piece;
  protected readonly types = ASSURE_DOCUMENT_TYPES;
}
