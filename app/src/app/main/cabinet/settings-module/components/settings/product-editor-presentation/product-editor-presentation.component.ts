import { ChangeDetectionStrategy, Component, computed, input, OnInit, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  cleanGuarantees,
  cleanQuestionnaire,
  discoveredPath,
  GUARANTEE_TYPES,
  GuaranteeType,
  isCanonicalPath,
  Product,
  ProductValidationError,
  QUESTION_TYPES,
  QuestionType,
} from '@shared';
import { CabinetProductInput } from '../../../services/settings.service';
import { SETTINGS_STRUCTURE } from '../settings.structure';

/** Question en cours d'édition : `choicesText` porte un choix par ligne ; `path` vide pour une question nouvelle. */
interface DraftQuestion {
  key: number;
  path: string;
  label: string;
  type: QuestionType;
  required: boolean;
  choicesText: string;
  /** Valeurs des choix existants, par libellé : renommer la liste ne change pas les réponses déjà enregistrées. */
  choiceValues: Record<string, string>;
  /** Informations posées par le système (découverte, niveau de connaissance…) : gardées telles quelles. */
  extra: Record<string, unknown>;
}

interface DraftSection {
  key: number;
  title: string;
  discovered: boolean;
  questions: DraftQuestion[];
}

interface DraftGuarantee {
  key: number;
  code: string;
  label: string;
  type: GuaranteeType;
}

let nextKey = 1;

/**
 * Éditeur d'un produit du cabinet : nom, sections et questions (libellé, type, obligatoire, choix), garanties.
 * Les règles sont celles du serveur (shared/cabinet-products.ts) : une erreur s'affiche avant tout envoi.
 */
@Component({
  selector: 'app-product-editor',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './product-editor-presentation.component.html',
  styleUrl: './product-editor-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductEditorPresentationComponent implements OnInit {
  readonly product = input.required<Product>();
  readonly isPending = input(false);
  readonly saved = output<CabinetProductInput>();
  readonly cancelled = output<void>();

  protected readonly text = SETTINGS_STRUCTURE.productEditor;
  protected readonly questionTypes = QUESTION_TYPES;
  protected readonly guaranteeTypes = GUARANTEE_TYPES;

  protected readonly name = signal('');
  protected readonly sections = signal<DraftSection[]>([]);
  protected readonly guarantees = signal<DraftGuarantee[]>([]);
  private readonly _submitted = signal(false);

  /** Erreur affichée après une première tentative d'enregistrement (mêmes règles que le serveur). */
  protected readonly error = computed(() => {
    if (!this._submitted()) return null;
    try {
      this.build();
      return null;
    } catch (error) {
      return error instanceof ProductValidationError ? error.message : String(error);
    }
  });

  ngOnInit(): void {
    const product = this.product();
    this.name.set(product.name);
    this.sections.set(
      product.questionnaireSchema.map((section) => ({
        key: nextKey++,
        title: section.title,
        discovered: section.discovered === true,
        questions: section.questions.map(({ canonicalPath, label, type, required, choices, ...extra }) => ({
          key: nextKey++,
          path: canonicalPath,
          label,
          type,
          required,
          choicesText: (choices ?? []).map((choice) => choice.label).join('\n'),
          choiceValues: Object.fromEntries((choices ?? []).map((choice) => [choice.label, choice.value])),
          extra,
        })),
      })),
    );
    this.guarantees.set(product.guaranteeCatalog.map((guarantee) => ({ key: nextKey++, ...guarantee })));
  }

  protected updateSection(index: number, changes: Partial<DraftSection>): void {
    this.sections.update((sections) => sections.map((section, i) => (i === index ? { ...section, ...changes } : section)));
  }

  protected addSection(): void {
    this.sections.update((sections) => [
      ...sections,
      { key: nextKey++, title: '', discovered: false, questions: [this.blankQuestion()] },
    ]);
  }

  protected removeSection(index: number): void {
    this.sections.update((sections) => sections.filter((_, i) => i !== index));
  }

  protected moveSection(index: number, delta: number): void {
    this.sections.update((sections) => move(sections, index, delta));
  }

  protected updateQuestion(s: number, q: number, changes: Partial<DraftQuestion>): void {
    this.sections.update((sections) =>
      sections.map((section, i) =>
        i === s
          ? { ...section, questions: section.questions.map((question, j) => (j === q ? { ...question, ...changes } : question)) }
          : section,
      ),
    );
  }

  protected addQuestion(s: number): void {
    this.sections.update((sections) =>
      sections.map((section, i) => (i === s ? { ...section, questions: [...section.questions, this.blankQuestion()] } : section)),
    );
  }

  protected removeQuestion(s: number, q: number): void {
    this.sections.update((sections) =>
      sections.map((section, i) => (i === s ? { ...section, questions: section.questions.filter((_, j) => j !== q) } : section)),
    );
  }

  /** Les options restent stockées une par ligne dans `choicesText` ; chaque ligne a son propre champ. */
  protected choiceLines(question: DraftQuestion): string[] {
    // Texte vide = un champ vide affiché : sinon « [''] » redevient « '' » et l'ajout de la 1re option ne fait rien.
    return question.choicesText.split('\n');
  }

  private setChoiceLines(s: number, q: number, lines: string[]): void {
    this.updateQuestion(s, q, { choicesText: lines.join('\n') });
  }

  protected updateChoice(s: number, q: number, c: number, value: string): void {
    const question = this.sections()[s].questions[q];
    this.setChoiceLines(s, q, this.choiceLines(question).map((line, i) => (i === c ? value.replace(/\n/g, ' ') : line)));
  }

  protected addChoice(s: number, q: number): void {
    this.setChoiceLines(s, q, [...this.choiceLines(this.sections()[s].questions[q]), '']);
  }

  protected removeChoice(s: number, q: number, c: number): void {
    this.setChoiceLines(s, q, this.choiceLines(this.sections()[s].questions[q]).filter((_, i) => i !== c));
  }

  protected moveQuestion(s: number, q: number, delta: number): void {
    this.sections.update((sections) =>
      sections.map((section, i) => (i === s ? { ...section, questions: move(section.questions, q, delta) } : section)),
    );
  }

  protected updateGuarantee(index: number, changes: Partial<DraftGuarantee>): void {
    this.guarantees.update((guarantees) => guarantees.map((guarantee, i) => (i === index ? { ...guarantee, ...changes } : guarantee)));
  }

  protected addGuarantee(): void {
    this.guarantees.update((guarantees) => [...guarantees, { key: nextKey++, code: '', label: '', type: 'included' }]);
  }

  protected removeGuarantee(index: number): void {
    this.guarantees.update((guarantees) => guarantees.filter((_, i) => i !== index));
  }

  protected submit(): void {
    this._submitted.set(true);
    if (this.error()) return;
    this.saved.emit(this.build());
  }

  private blankQuestion(): DraftQuestion {
    return { key: nextKey++, path: '', label: '', type: 'text', required: false, choicesText: '', choiceValues: {}, extra: {} };
  }

  /**
   * Produit prêt à envoyer, validé avec les règles du serveur. Une question nouvelle reçoit un identifiant tiré
   * de son libellé (`extra.…`), rendu unique ; une question existante garde le sien (les réponses des dossiers y restent).
   */
  private build(): CabinetProductInput {
    const name = this.name().trim();
    if (name.length < 2) throw new ProductValidationError(this.text.errors.name);
    const taken = new Set(
      this.sections()
        .flatMap((section) => section.questions)
        .map((question) => question.path)
        .filter(Boolean),
    );
    const schema = this.sections().map((section) => ({
      title: section.title,
      ...(section.discovered ? { discovered: true } : {}),
      questions: section.questions.map((question) => {
        let path = question.path;
        if (!isCanonicalPath(path)) {
          const base = discoveredPath(question.label);
          path = base;
          // « extra. » + 60 caractères au plus : le suffixe reste dans la limite.
          for (let i = 2; taken.has(path); i++) path = `${base.slice(0, 62)}_${i}`;
          taken.add(path);
        }
        const choices = question.choicesText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((label) => ({ value: question.choiceValues[label] ?? label, label }));
        return {
          ...question.extra,
          canonicalPath: path,
          label: question.label,
          type: question.type,
          required: question.required,
          ...(question.type === 'choice' ? { choices } : {}),
        };
      }),
    }));
    const questionnaireSchema = cleanQuestionnaire(schema);
    if (!questionnaireSchema.some((section) => section.questions.length)) {
      throw new ProductValidationError(this.text.errors.empty);
    }
    const guaranteeCatalog = cleanGuarantees(
      this.guarantees().map(({ code, label, type }) => ({ code, label, type })),
    );
    return { id: this.product().id, name, questionnaireSchema, guaranteeCatalog };
  }
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}
