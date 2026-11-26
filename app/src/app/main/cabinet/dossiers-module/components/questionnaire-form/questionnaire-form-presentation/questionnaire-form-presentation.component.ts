import { I18nPluralPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import {
  CanonicalData,
  CanonicalPath,
  CanonicalValue,
  isAnswered,
  isQuestionVisible,
  Question,
  QuestionnaireSection,
} from '@shared';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';
import { QuestionFieldPresentationComponent } from '../../question-field/question-field-presentation/question-field-presentation.component';

export interface AnswerChange {
  path: CanonicalPath;
  /** `null` efface la réponse. */
  value: CanonicalValue | null;
}

/**
 * Moteur de questionnaire dynamique : génère le formulaire d'un produit depuis son JSON (sections, types,
 * obligatoires, conditions d'affichage, niveau de connaissance). Ne garde aucun état : les réponses viennent de `data`.
 * Une section facultative (`optional`, compléments qu'aucun extranet choisi ne demande) est repliée par défaut.
 */
@Component({
  selector: 'app-questionnaire-form',
  imports: [I18nPluralPipe, MatExpansionModule, NgTemplateOutlet, QuestionFieldPresentationComponent],
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
  /** Réponses reprises du dossier précédent encore à vérifier. */
  readonly toVerify = input<CanonicalPath[]>([]);
  /** Référence du dossier dont les réponses ont été reprises (bandeau d'information), null sinon. */
  readonly reusedFrom = input<string | null>(null);
  readonly answerChanged = output<AnswerChange>();
  /** Réponse reprise confirmée telle quelle (« C'est à jour »). */
  readonly answerVerified = output<CanonicalPath>();

  protected readonly structure = DOSSIERS_STRUCTURE.questionnaire;
  protected readonly regularSections = computed(() => this.sections().filter((section) => !section.optional));
  /** Sections facultatives, avec leur nombre de questions et de réponses déjà données. */
  protected readonly optionalSections = computed(() =>
    this.sections()
      .filter((section) => section.optional)
      .map((section) => ({
        section,
        total: section.questions.length,
        filled: section.questions.filter((question) => isAnswered(this.data()[question.canonicalPath], question)).length,
      })),
  );

  /**
   * Réponses à vérifier visibles dans les sections affichées (le bandeau les compte) : une question masquée par sa
   * condition (assureur actuel d'un client non assuré, détail d'un sinistre non déclaré) ne se vérifie pas.
   */
  protected readonly shownToVerify = computed(() => {
    const data = this.data();
    const paths = new Set(
      this.sections()
        .flatMap((section) => section.questions)
        .filter((question) => isQuestionVisible(question, data))
        .map((question) => question.canonicalPath),
    );
    return this.toVerify().filter((path) => paths.has(path));
  });

  /** Une question conditionnelle n'apparaît que si sa condition est remplie par les réponses actuelles. */
  protected isVisible(question: Question): boolean {
    return isQuestionVisible(question, this.data());
  }
}
