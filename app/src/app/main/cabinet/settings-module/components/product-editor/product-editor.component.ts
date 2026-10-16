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
import { CabinetProductInput } from '../../services/settings.service';
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
  template: `
    <form class="editor" (submit)="$event.preventDefault(); submit()" novalidate>
      <div class="head">
        <p class="title">{{ text.editTitle }}</p>
        <label class="name">
          <span>{{ text.productName }}</span>
          <input type="text" maxlength="60" [value]="name()" (input)="name.set($any($event.target).value)" />
        </label>
      </div>

      <h4>{{ text.questionnaire }}</h4>
      <p class="hint">{{ text.questionnaireHint }}</p>

      @for (section of sections(); track section.key; let s = $index) {
        <fieldset class="section">
          <div class="section-head">
            <input
              class="section-title"
              type="text"
              maxlength="100"
              [attr.aria-label]="text.sectionTitle"
              [placeholder]="text.sectionTitle"
              [value]="section.title"
              (input)="updateSection(s, { title: $any($event.target).value })"
            />
            @if (section.discovered) {
              <span class="badge">{{ text.discoveredBadge }}</span>
            }
            <button mat-icon-button type="button" [attr.aria-label]="text.moveUp" [disabled]="s === 0" (click)="moveSection(s, -1)">
              <mat-icon>arrow_upward</mat-icon>
            </button>
            <button mat-icon-button type="button" class="danger-text" [attr.aria-label]="text.removeSection" (click)="removeSection(s)">
              <mat-icon>delete</mat-icon>
            </button>
          </div>

          @for (question of section.questions; track question.key; let q = $index) {
            <div class="question">
              <input
                class="q-label"
                type="text"
                maxlength="200"
                [attr.aria-label]="text.questionLabel"
                [placeholder]="text.questionLabel"
                [value]="question.label"
                (input)="updateQuestion(s, q, { label: $any($event.target).value })"
              />
              <select
                [attr.aria-label]="text.questionType"
                [value]="question.type"
                (change)="updateQuestion(s, q, { type: $any($event.target).value })"
              >
                @for (type of questionTypes; track type) {
                  <option [value]="type" [selected]="type === question.type">{{ text.types[type] }}</option>
                }
              </select>
              <label class="check">
                <input type="checkbox" [checked]="question.required" (change)="updateQuestion(s, q, { required: $any($event.target).checked })" />
                {{ text.required }}
              </label>
              <button mat-icon-button type="button" [attr.aria-label]="text.moveUp" [disabled]="q === 0" (click)="moveQuestion(s, q, -1)">
                <mat-icon>arrow_upward</mat-icon>
              </button>
              <button mat-icon-button type="button" class="danger-text" [attr.aria-label]="text.removeQuestion" (click)="removeQuestion(s, q)">
                <mat-icon>close</mat-icon>
              </button>
              @if (question.type === 'choice') {
                <div class="choices">
                  @for (choice of choiceLines(question); track $index; let c = $index) {
                    <div class="choice">
                      <input
                        [attr.aria-label]="text.choices"
                        [placeholder]="text.choicePlaceholder"
                        [value]="choice"
                        (input)="updateChoice(s, q, c, $any($event.target).value)"
                      />
                      <button mat-icon-button type="button" class="danger-text" [attr.aria-label]="text.removeChoice" (click)="removeChoice(s, q, c)">
                        <mat-icon>close</mat-icon>
                      </button>
                    </div>
                  }
                  <button mat-button type="button" (click)="addChoice(s, q)"><mat-icon>add</mat-icon>{{ text.addChoice }}</button>
                </div>
              }
            </div>
          }

          <button mat-button type="button" (click)="addQuestion(s)"><mat-icon>add</mat-icon>{{ text.addQuestion }}</button>
        </fieldset>
      }
      <button mat-stroked-button type="button" (click)="addSection()"><mat-icon>add</mat-icon>{{ text.addSection }}</button>

      <h4>{{ text.guarantees }}</h4>
      <p class="hint">{{ text.guaranteesHint }}</p>
      @for (guarantee of guarantees(); track guarantee.key; let g = $index) {
        <div class="guarantee">
          <input
            type="text"
            maxlength="100"
            [attr.aria-label]="text.guaranteeLabel"
            [placeholder]="text.guaranteeLabel"
            [value]="guarantee.label"
            (input)="updateGuarantee(g, { label: $any($event.target).value })"
          />
          <select [attr.aria-label]="text.guaranteeType" [value]="guarantee.type" (change)="updateGuarantee(g, { type: $any($event.target).value })">
            @for (type of guaranteeTypes; track type) {
              <option [value]="type" [selected]="type === guarantee.type">{{ text.guaranteeTypes[type] }}</option>
            }
          </select>
          <button mat-icon-button type="button" class="danger-text" [attr.aria-label]="text.removeGuarantee" (click)="removeGuarantee(g)">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }
      <button mat-button type="button" (click)="addGuarantee()"><mat-icon>add</mat-icon>{{ text.addGuarantee }}</button>

      @if (error(); as error) {
        <p class="error" role="alert">{{ error }}</p>
      }

      <div class="actions">
        <button mat-button type="button" (click)="cancelled.emit()">{{ text.cancel }}</button>
        <button mat-flat-button class="ci-cta" type="submit" [disabled]="isPending()">{{ text.saveProduct }}</button>
      </div>
    </form>
  `,
  styles: `
    .editor {
      display: grid;
      gap: 12px;
      margin: 8px 0 16px;
      padding: 20px;
      border: 1px solid var(--ci-border);
      border-radius: 12px;
      background: var(--ci-surface-2);
    }

    .title {
      margin: 0 0 8px;
      font-weight: 700;
    }

    h4 {
      margin: 12px 0 0;
      font-size: 14px;
      font-weight: 700;
    }

    .hint {
      margin: 0;
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    input[type='text'],
    select,
    textarea {
      box-sizing: border-box;
      height: 38px;
      padding: 0 10px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      font: inherit;
      font-size: 14px;

      &:focus {
        border-color: var(--ci-accent);
        outline: none;
        box-shadow: 0 0 0 3px var(--ci-accent-soft);
      }
    }

    textarea {
      height: auto;
      padding: 8px 10px;
      resize: vertical;
    }

    .name {
      display: grid;
      gap: 4px;
      max-width: 420px;
      font-size: 13px;
      font-weight: 600;
    }

    .section {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 12px;
      border: 1px solid var(--ci-border);
      border-radius: 10px;
      background: var(--ci-surface);
    }

    .section-head,
    .question,
    .guarantee {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .section-title {
      flex: 1 1 240px;
      font-weight: 700;
    }

    .q-label {
      flex: 1 1 260px;
    }

    .guarantee input {
      flex: 1 1 260px;
    }

    .choices {
      flex: 1 1 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .choice {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
    }

    .choice input {
      flex: 1 1 auto;
    }

    .check {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      font-size: 13px;
    }

    .badge {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      color: var(--ci-accent-ink);
      background: var(--ci-accent-soft);
    }

    .danger-text {
      color: var(--ci-danger);
    }

    .error {
      margin: 0;
      font-size: 13px;
      color: var(--ci-danger);
    }

    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductEditorComponent implements OnInit {
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
