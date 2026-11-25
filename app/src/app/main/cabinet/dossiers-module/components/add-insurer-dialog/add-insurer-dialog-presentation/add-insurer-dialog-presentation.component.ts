import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { answerConstraintError, CanonicalData, CanonicalPath, CanonicalValue, Insurer, isAnswered } from '@shared';
import { AddInsurersInput } from '../../../store/dossier.store';
import { addedComplementQuestions, InsurerAdditionContext, questionsToAsk } from '../../../util/add-insurer.utils';
import { ExtranetPickerPresentationComponent } from '../../extranet-picker/extranet-picker-presentation/extranet-picker-presentation.component';
import { PRICING_TAB_STRUCTURE } from '../../pricing-tab/pricing-tab.structure';
import { QuestionFieldPresentationComponent } from '../../question-field/question-field-presentation/question-field-presentation.component';

export interface AddInsurerDialogData extends InsurerAdditionContext {
  /** Assureurs proposés pour le produit et pas encore choisis pour le dossier. */
  candidates: Insurer[];
  /** Assureurs déjà choisis : ils restent (le serveur refuse un retrait pendant la tarification). */
  currentInsurerIds: string[];
  /** Réponses du dossier. */
  answers: CanonicalData;
}

/**
 * Ajout d'assureurs pendant la tarification, en deux étapes : le choix des assureurs, puis les questions obligatoires que
 * leur arrivée ajoute au questionnaire figé du dossier et qui n'ont pas encore de réponse. Se ferme sur
 * `{ insurerIds, patch }` (tous les assureurs du dossier, et les réponses saisies).
 */
@Component({
  selector: 'app-add-insurer-dialog',
  imports: [MatButtonModule, MatDialogModule, ExtranetPickerPresentationComponent, QuestionFieldPresentationComponent],
  templateUrl: './add-insurer-dialog-presentation.component.html',
  styleUrl: './add-insurer-dialog-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddInsurerDialogPresentationComponent {
  protected readonly data = inject<AddInsurerDialogData>(MAT_DIALOG_DATA);
  private readonly _dialogRef = inject<MatDialogRef<AddInsurerDialogPresentationComponent, AddInsurersInput>>(MatDialogRef);

  protected readonly text = PRICING_TAB_STRUCTURE.addInsurer;
  protected readonly step = signal<'choose' | 'questions'>('choose');
  /** Assureurs cochés, dans l'ordre de la liste proposée. */
  protected readonly chosen = signal<string[]>([]);
  private readonly _answers = signal<CanonicalData>({});
  protected readonly touched = signal(false);

  /** Réponses du dossier complétées par la saisie de la boîte de dialogue. */
  protected readonly answers = computed<CanonicalData>(() => ({ ...this.data.answers, ...this._answers() }));

  /** Questions que les assureurs cochés ajoutent au questionnaire figé. */
  private readonly _added = computed(() =>
    addedComplementQuestions(
      this.data,
      this.data.candidates.filter((insurer) => this.chosen().includes(insurer.id)),
    ),
  );

  /** Celles à renseigner avant l'ajout : obligatoires, visibles et sans réponse dans le dossier. */
  protected readonly questions = computed(() => questionsToAsk(this._added(), this.data.answers, this.answers()));

  protected toggle(event: { insurerId: string; checked: boolean }): void {
    const ids = this.chosen().filter((id) => id !== event.insurerId);
    const next = event.checked ? [...ids, event.insurerId] : ids;
    this.chosen.set(this.data.candidates.map((insurer) => insurer.id).filter((id) => next.includes(id)));
  }

  protected next(): void {
    if (this.chosen().length) this.step.set('questions');
  }

  protected back(): void {
    this.touched.set(false);
    this.step.set('choose');
  }

  protected set(path: CanonicalPath, value: CanonicalValue | null): void {
    this._answers.update((answers) => ({ ...answers, [path]: value }));
  }

  /** Mêmes contrôles que le questionnaire (réponse obligatoire, bornes métier) ; le serveur les refait. */
  protected submit(): void {
    this.touched.set(true);
    const answers = this.answers();
    const questions = this.questions();
    const invalid = questions.some((question) => {
      const value = answers[question.canonicalPath];
      return !isAnswered(value, question) || answerConstraintError(question, value) !== null;
    });
    if (invalid || !this.chosen().length) return;
    const patch: CanonicalData = {};
    for (const question of questions) patch[question.canonicalPath] = answers[question.canonicalPath];
    this._dialogRef.close({ insurerIds: [...this.data.currentInsurerIds, ...this.chosen()], patch });
  }
}
