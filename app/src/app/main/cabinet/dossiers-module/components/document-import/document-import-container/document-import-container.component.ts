import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DocumentImportStore } from '../../../store/document-import.store';
import { DossierStore } from '../../../store/dossier.store';
import { DocumentImportPresentationComponent } from '../document-import-presentation/document-import-presentation.component';

/**
 * Documents d'un dossier (E12) : liste avec téléchargement et, si le dossier est modifiable, « Importer un document ».
 * Le document est envoyé dans Storage, enregistré (documents-enregistrer) puis lu par l'IA (documents-analyser) ; les
 * valeurs lues sont proposées champ par champ et ne sont écrites qu'au clic sur « Appliquer », via la sauvegarde du dossier
 * (dossiers-sauvegarder : validation et complétude restent côté serveur).
 */
@Component({
  selector: 'app-document-import-container',
  imports: [DocumentImportPresentationComponent],
  providers: [DocumentImportStore],
  templateUrl: './document-import-container.component.html',
  styleUrl: './document-import-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentImportContainerComponent {
  /** Import et application des valeurs lues (dossier modifiable) ; sinon, liste seule. */
  readonly editable = input(true);

  protected readonly store = inject(DocumentImportStore);
  protected readonly dossierStore = inject(DossierStore);
}
