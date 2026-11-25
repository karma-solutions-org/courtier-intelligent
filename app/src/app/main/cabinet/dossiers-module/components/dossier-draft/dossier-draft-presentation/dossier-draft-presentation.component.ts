import { I18nPluralPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CanonicalData, CanonicalPath, Dossier, Insurer, QuestionnaireSection } from '@shared';
import { DraftView } from '../../../models/dossier-draft.model';
import { SaveStatus } from '../../../store/dossier.store';
import { DocumentImportContainerComponent } from '../../document-import/document-import-container/document-import-container.component';
import { DossierStepperHeaderPresentationComponent } from '../../dossier-stepper-header/dossier-stepper-header-presentation/dossier-stepper-header-presentation.component';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';
import { ExtranetPickerPresentationComponent } from '../../extranet-picker/extranet-picker-presentation/extranet-picker-presentation.component';
import {
  AnswerChange,
  QuestionnaireFormPresentationComponent,
} from '../../questionnaire-form/questionnaire-form-presentation/questionnaire-form-presentation.component';
import { ReadingOverlayPresentationComponent } from '../../reading-overlay/reading-overlay-presentation/reading-overlay-presentation.component';

/**
 * « Nouveau dossier », étapes 3 à 5 : extranets, documents, questionnaire section par section. L'import de documents
 * reste un container autonome (créé seulement quand sa vue est affichée).
 */
@Component({
  selector: 'app-dossier-draft-presentation',
  imports: [
    I18nPluralPipe,
    MatButtonModule,
    MatIconModule,
    DocumentImportContainerComponent,
    DossierStepperHeaderPresentationComponent,
    ExtranetPickerPresentationComponent,
    QuestionnaireFormPresentationComponent,
    ReadingOverlayPresentationComponent,
  ],
  templateUrl: './dossier-draft-presentation.component.html',
  styleUrl: './dossier-draft-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDraftPresentationComponent {
  readonly dossier = input<Dossier | null>(null);
  readonly saveStatus = input<SaveStatus>('idle');
  readonly saveLabel = input('');
  readonly view = input<DraftView>('extranets');
  readonly error = input<string | null>(null);
  readonly loaded = input(false);
  /** Pièces du client en cours de lecture : écran bloqué jusqu'au remplissage des champs. */
  readonly readingClientPieces = input(false);
  /** Extranets proposés pour le dossier et ceux cochés à l'écran. */
  readonly availableInsurers = input<Insurer[]>([]);
  readonly checkedInsurers = input<string[]>([]);
  /** Section affichée (bornée au questionnaire) et nombre de sections. */
  readonly sectionIndex = input(0);
  readonly sectionCount = input(0);
  /** Questions posées (hors section facultative) et questions facultatives : mesure de la saisie demandée. */
  readonly questionCount = input<{ asked: number; optional: number }>({ asked: 0, optional: 0 });
  readonly currentSection = input<QuestionnaireSection[]>([]);
  readonly isLastSection = input(false);
  /** Champs obligatoires encore vides de la section affichée. */
  readonly sectionMissing = input<CanonicalPath[]>([]);
  readonly answers = input<CanonicalData>({});
  /** Signale les champs obligatoires vides (et l'absence d'extranet coché). */
  readonly showMissing = input(false);
  readonly validating = input(false);

  readonly viewChanged = output<DraftView>();
  readonly insurerToggled = output<{ insurerId: string; checked: boolean }>();
  readonly insurersValidated = output<void>();
  readonly saveAndQuitRequested = output<void>();
  readonly answerChanged = output<AnswerChange>();
  readonly sectionRequested = output<number>();
  readonly nextRequested = output<void>();

  protected readonly structure = DOSSIERS_STRUCTURE.draft;
  /** Position de chaque vue dans les étapes de « Nouveau dossier ». */
  protected readonly stepOf = { extranets: 3, documents: 4, questionnaire: 5 } as const;
}
