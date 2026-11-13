import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CanonicalData, CanonicalPath, CanonicalValue, isQuestionVisible, Question, QuestionnaireSection } from '@shared';
import { QuestionFieldPresentationComponent } from '../../question-field/question-field-presentation/question-field-presentation.component';

export interface AnswerChange {
  path: CanonicalPath;
  /** `null` efface la réponse. */
  value: CanonicalValue | null;
}

/**
 * Moteur de questionnaire dynamique : génère le formulaire d'un produit depuis son JSON (sections, types,
 * obligatoires, conditions d'affichage, niveau de connaissance). Ne garde aucun état : les réponses viennent de `data`.
 */
@Component({
  selector: 'app-questionnaire-form',
  imports: [QuestionFieldPresentationComponent],
  templateUrl: './questionnaire-form-presentation.component.html',
  styleUrl: './questionnaire-form-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionnaireFormPresentationComponent {
  /** Sections à afficher (toutes, ou une seule dans le stepper). */
  readonly sections = input<QuestionnaireSection[]>([]);
  readonly data = input<CanonicalData>({});
  readonly readonly = input(false);
  /** Signale les champs obligatoires vides (après un clic sur « Suivant », par exemple). */
  readonly showMissing = input(false);
  readonly answerChanged = output<AnswerChange>();

  /** Une question conditionnelle n'apparaît que si sa condition est remplie par les réponses actuelles. */
  protected isVisible(question: Question): boolean {
    return isQuestionVisible(question, this.data());
  }
}
