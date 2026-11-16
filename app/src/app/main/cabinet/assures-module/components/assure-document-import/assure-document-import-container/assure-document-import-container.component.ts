import { ChangeDetectionStrategy, Component, effect, inject, output, untracked } from '@angular/core';
import { ReadPiece } from '../../../models/assure-document-import.model';
import { AssureDocumentImportStore } from '../../../store/assure-document-import.store';
import { AssureDocumentImportPresentationComponent } from '../assure-document-import-presentation/assure-document-import-presentation.component';

/**
 * « Pré-remplir depuis une pièce » : le courtier choisit ses fichiers ; l'IA reconnaît le type de chacun (modifiable). La CIN (ou le Kbis) est lue
 * par l'IA et remplit le formulaire ; les autres pièces (carte grise, permis…) sont seulement envoyées, puis rangées avec
 * le client et reprises dans ses dossiers.
 */
@Component({
  selector: 'app-assure-document-import-container',
  imports: [AssureDocumentImportPresentationComponent],
  providers: [AssureDocumentImportStore],
  templateUrl: './assure-document-import-container.component.html',
  styleUrl: './assure-document-import-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDocumentImportContainerComponent {
  /** Pièce envoyée : le conteneur remplit le formulaire (CIN, Kbis) et la range avec le client à sa création. */
  readonly pieceRead = output<ReadPiece>();

  protected readonly store = inject(AssureDocumentImportStore);

  constructor() {
    // Chaque pièce lue est transmise au formulaire, dans l'ordre de lecture.
    effect(() => {
      if (!this.store.readPieces().length) return;
      untracked(() => this.store.takeReadPieces().forEach((piece) => this.pieceRead.emit(piece)));
    });
  }
}
