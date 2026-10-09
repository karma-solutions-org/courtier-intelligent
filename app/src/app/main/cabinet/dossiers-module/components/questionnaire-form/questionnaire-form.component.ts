import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CanonicalData, CanonicalPath, CanonicalValue, isQuestionVisible, Question, QuestionnaireSection } from '@shared';
import { QuestionFieldComponent } from '../question-field/question-field.component';

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
  imports: [QuestionFieldComponent],
  template: `
    @for (section of sections(); track section.title) {
      <section class="card">
        <h2>{{ section.title }}</h2>
        <div class="grid">
          @for (question of section.questions; track question.canonicalPath) {
            @if (isVisible(question)) {
              <app-question-field
                [class.wide]="question.type === 'boolean' || question.withKnowledge"
                [question]="question"
                [value]="data()[question.canonicalPath]"
                [readonly]="readonly()"
                [showMissing]="showMissing()"
                (changed)="answerChanged.emit({ path: question.canonicalPath, value: $event })"
              />
            }
          }
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
    }

    .card {
      padding: 24px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
    }

    h2 {
      margin: 0 0 16px;
      font-size: 17px;
      font-weight: 600;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .wide {
      grid-column: 1 / -1;
    }

    @media (max-width: 700px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionnaireFormComponent {
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
