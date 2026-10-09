import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CanonicalValue, isAnswered, isKnownValue, Knowledge, Question } from '@shared';

type KnowledgeMode = 'known' | 'declared' | 'unknown';

const KNOWLEDGE_OPTIONS: { mode: KnowledgeMode; label: string }[] = [
  { mode: 'known', label: 'Valeur connue' },
  { mode: 'declared', label: "L'assuré ne sait pas" },
  { mode: 'unknown', label: 'À vérifier' },
];

/** Un champ du questionnaire dynamique : le contrôle dépend du type de la question (texte, date, nombre, oui/non, choix). */
@Component({
  selector: 'app-question-field',
  imports: [MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <div class="field" [class.invalid]="invalid()">
      @if (question().withKnowledge) {
        <span class="label">{{ labelText() }}</span>
        <mat-button-toggle-group
          [value]="knowledgeMode()"
          [disabled]="readonly()"
          [attr.aria-label]="question().label"
          hideSingleSelectionIndicator
          (change)="setKnowledgeMode($event.value)"
        >
          @for (option of knowledgeOptions; track option.mode) {
            <mat-button-toggle [value]="option.mode">{{ option.label }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
        @if (knowledgeMode() === 'known') {
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="known-value">
            <mat-label>{{ question().label }}</mat-label>
            <input
              matInput
              type="number"
              step="any"
              [value]="knownNumber() ?? ''"
              [readonly]="readonly()"
              (input)="setKnownNumber($any($event.target).valueAsNumber)"
            />
          </mat-form-field>
        }
      } @else {
        @switch (question().type) {
          @case ('boolean') {
            <span class="label">{{ labelText() }}</span>
            <mat-button-toggle-group
              [value]="value()"
              [disabled]="readonly()"
              [attr.aria-label]="question().label"
              hideSingleSelectionIndicator
              (change)="changed.emit($event.value)"
            >
              <mat-button-toggle [value]="true">Oui</mat-button-toggle>
              <mat-button-toggle [value]="false">Non</mat-button-toggle>
            </mat-button-toggle-group>
          }
          @case ('choice') {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ labelText() }}</mat-label>
              <mat-select [value]="value() ?? null" [disabled]="readonly()" (selectionChange)="changed.emit($event.value)">
                @for (choice of question().choices ?? []; track choice.value) {
                  <mat-option [value]="choice.value">{{ choice.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          @case ('number') {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ labelText() }}</mat-label>
              <input
                matInput
                type="number"
                step="any"
                [value]="value() ?? ''"
                [readonly]="readonly()"
                (input)="changed.emit(toNumber($any($event.target).valueAsNumber))"
              />
            </mat-form-field>
          }
          @case ('date') {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ labelText() }}</mat-label>
              <input
                matInput
                type="date"
                [value]="value() ?? ''"
                [readonly]="readonly()"
                (input)="changed.emit(toText($any($event.target).value))"
              />
            </mat-form-field>
          }
          @default {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ labelText() }}</mat-label>
              <input
                matInput
                [value]="value() ?? ''"
                [readonly]="readonly()"
                autocomplete="off"
                (input)="changed.emit(toText($any($event.target).value))"
              />
            </mat-form-field>
          }
        }
      }
      @if (invalid()) {
        <span class="missing" role="alert">Ce champ est obligatoire</span>
      }
    </div>
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    mat-form-field {
      width: 100%;
    }

    .label {
      font-size: 14px;
      color: var(--mat-sys-on-surface-variant);
    }

    .known-value {
      max-width: 260px;
    }

    .missing {
      font-size: 12px;
      color: var(--mat-sys-error);
    }

    .invalid .label {
      color: var(--mat-sys-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionFieldComponent {
  readonly question = input.required<Question>();
  readonly value = input<CanonicalValue | undefined>(undefined);
  readonly readonly = input(false);
  /** Signale ce champ s'il est obligatoire et vide. */
  readonly showMissing = input(false);
  /** Nouvelle valeur ; `null` efface la réponse. */
  readonly changed = output<CanonicalValue | null>();

  protected readonly knowledgeOptions = KNOWLEDGE_OPTIONS;
  protected readonly labelText = computed(() => (this.question().required ? `${this.question().label} *` : this.question().label));
  protected readonly invalid = computed(() => this.showMissing() && this.question().required && !isAnswered(this.value()));

  /**
   * Mode choisi pour un champ avec niveau de connaissance. Il peut précéder la valeur : « Valeur connue » sélectionné
   * mais pas encore de nombre saisi, ce qui n'est pas enregistrable.
   */
  private readonly _chosenMode = signal<KnowledgeMode | null>(null);

  protected readonly knowledgeMode = computed<KnowledgeMode | null>(() => {
    const chosen = this._chosenMode();
    if (chosen) return chosen;
    const value = this.value();
    if (isKnownValue(value)) return MODE_OF[value.knowledge];
    return typeof value === 'number' ? 'known' : null;
  });

  protected readonly knownNumber = computed(() => {
    const value = this.value();
    return isKnownValue(value) ? value.value : typeof value === 'number' ? value : null;
  });

  protected setKnowledgeMode(mode: KnowledgeMode): void {
    this._chosenMode.set(mode);
    if (mode === 'declared') {
      this.changed.emit({ value: null, knowledge: 'DECLARED_UNKNOWN' });
    } else if (mode === 'unknown') {
      this.changed.emit({ value: null, knowledge: 'UNKNOWN' });
    } else if (this.knownNumber() === null) {
      // « Valeur connue » sans nombre : on efface la réponse précédente, en attendant la saisie.
      this.changed.emit(null);
    }
  }

  protected setKnownNumber(valueAsNumber: number): void {
    this.changed.emit(Number.isNaN(valueAsNumber) ? null : { value: valueAsNumber, knowledge: 'KNOWN' });
  }

  protected toNumber(valueAsNumber: number): number | null {
    return Number.isNaN(valueAsNumber) ? null : valueAsNumber;
  }

  protected toText(text: string): string | null {
    return text === '' ? null : text;
  }
}

const MODE_OF: Record<Knowledge, KnowledgeMode> = { KNOWN: 'known', DECLARED_UNKNOWN: 'declared', UNKNOWN: 'unknown' };
