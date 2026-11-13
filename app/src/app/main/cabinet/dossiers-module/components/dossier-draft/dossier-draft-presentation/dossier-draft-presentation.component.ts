import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Assure, CanonicalData, CanonicalPath, Dossier, Product, Question, QuestionnaireSection } from '@shared';
import { displayName } from '../../../../assures-module/util/assures.utils';
import { DraftView } from '../../../models/dossier-draft.model';
import { SaveStatus } from '../../../store/dossier.store';
import { DocumentImportContainerComponent } from '../../document-import/document-import-container/document-import-container.component';
import { DossierStepperHeaderPresentationComponent } from '../../dossier-stepper-header/dossier-stepper-header-presentation/dossier-stepper-header-presentation.component';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';
import { QuestionFieldPresentationComponent } from '../../question-field/question-field-presentation/question-field-presentation.component';
import {
  AnswerChange,
  QuestionnaireFormPresentationComponent,
} from '../../questionnaire-form/questionnaire-form-presentation/questionnaire-form-presentation.component';

/**
 * « Nouveau dossier », étapes 3 à 5 : documents, questionnaire section par section, récapitulatif avec les champs
 * manquants. L'import de documents reste un container autonome (créé seulement quand sa vue est affichée).
 */
@Component({
  selector: 'app-dossier-draft-presentation',
  imports: [
    MatButtonModule,
    MatIconModule,
    DocumentImportContainerComponent,
    DossierStepperHeaderPresentationComponent,
    QuestionnaireFormPresentationComponent,
    QuestionFieldPresentationComponent,
  ],
  templateUrl: './dossier-draft-presentation.component.html',
  styleUrl: './dossier-draft-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDraftPresentationComponent {
  readonly dossier = input<Dossier | null>(null);
  readonly saveStatus = input<SaveStatus>('idle');
  readonly saveLabel = input('');
  readonly view = input<DraftView>('documents');
  readonly error = input<string | null>(null);
  readonly loaded = input(false);
  /** Section affichée (bornée au questionnaire) et nombre de sections. */
  readonly sectionIndex = input(0);
  readonly sectionCount = input(0);
  readonly currentSection = input<QuestionnaireSection[]>([]);
  readonly isLastSection = input(false);
  readonly answers = input<CanonicalData>({});
  /** Signale les champs obligatoires vides (arrivée depuis le récapitulatif). */
  readonly showMissing = input(false);
  readonly missingQuestions = input<Question[]>([]);
  readonly assure = input<Assure | null>(null);
  readonly product = input<Product | null>(null);
  readonly missing = input<CanonicalPath[]>([]);
  readonly labels = input<Map<CanonicalPath, string>>(new Map());
  readonly validating = input(false);

  readonly viewChanged = output<DraftView>();
  readonly saveAndQuitRequested = output<void>();
  readonly answerChanged = output<AnswerChange>();
  readonly sectionRequested = output<number>();
  readonly nextRequested = output<void>();
  readonly fillRequested = output<CanonicalPath>();
  readonly missingRequested = output<void>();
  readonly saveMissingRequested = output<void>();
  readonly validateRequested = output<void>();

  protected readonly structure = DOSSIERS_STRUCTURE.draft;
  protected readonly nameOf = displayName;
  /** Position de chaque vue dans les étapes de « Nouveau dossier ». */
  protected readonly stepOf = { documents: 3, questionnaire: 4, summary: 5, missing: 5 } as const;
}
