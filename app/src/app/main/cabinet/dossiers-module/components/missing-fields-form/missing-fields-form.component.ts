import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { CanonicalData, CanonicalPath, CanonicalValue, isAnswered, MissingField, missingFieldQuestion, Question } from '@shared';
import { QuestionFieldComponent } from '../question-field/question-field.component';

const TEXT = {
  intro: 'L’extranet demande des informations absentes du dossier. Elles y seront enregistrées, puis l’extension reprendra.',
  submit: 'Envoyer à l’extension',
} as const;

/**
 * Formulaire des champs manquants signalés par l'extension (`needs_info`). Une question du questionnaire du produit
 * garde son libellé et son type ; sinon on reprend ceux de l'extranet.
 */
@Component({
  selector: 'app-missing-fields-form',
  imports: [MatButtonModule, QuestionFieldComponent],
  template: `
    <form (submit)="$event.preventDefault(); submit()" novalidate>
      <p class="intro">{{ text.intro }}</p>
      @for (question of questions(); track question.canonicalPath) {
        <app-question-field
          [question]="question"
          [value]="answers()[question.canonicalPath]"
          [readonly]="busy()"
          [showMissing]="touched()"
          (changed)="set(question.canonicalPath, $event)"
        />
      }
      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy()">{{ text.submit }}</button>
      </div>
    </form>
  `,
  styles: `
    form {
      display: grid;
      gap: 12px;
    }

    .intro {
      margin: 0;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissingFieldsFormComponent {
  readonly fields = input.required<MissingField[]>();
  /** Questionnaire du produit : un champ qui y figure est posé avec sa question. */
  readonly schemaQuestions = input<Question[]>([]);
  /** Valeurs déjà connues du dossier (pré-remplissage). */
  readonly initial = input<CanonicalData>({});
  readonly busy = input(false);
  readonly submitted = output<CanonicalData>();

  protected readonly text = TEXT;
  private readonly _answers = signal<CanonicalData>({});
  protected readonly touched = signal(false);

  protected readonly questions = computed<Question[]>(() => {
    const known = new Map(this.schemaQuestions().map(q => [q.canonicalPath, q]));
    const seen = new Set<string>();
    return this.fields()
      .filter(f => !seen.has(f.canonicalPath) && seen.add(f.canonicalPath))
      .map(f => {
        const question = known.get(f.canonicalPath);
        // Toujours obligatoire ici, et sans condition d'affichage : c'est l'extranet qui le demande.
        return question ? { ...question, required: true, visibleIf: undefined } : missingFieldQuestion(f);
      });
  });

  protected readonly answers = computed<CanonicalData>(() => ({ ...this.initial(), ...this._answers() }));

  protected set(path: CanonicalPath, value: CanonicalValue | null): void {
    this._answers.update(answers => ({ ...answers, [path]: value }));
  }

  protected submit(): void {
    this.touched.set(true);
    const answers = this.answers();
    const result: CanonicalData = {};
    for (const question of this.questions()) {
      const value = answers[question.canonicalPath];
      if (!isAnswered(value)) return;
      result[question.canonicalPath] = value;
    }
    this.submitted.emit(result);
  }
}
