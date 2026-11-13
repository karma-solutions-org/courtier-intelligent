import { MatDatepickerModule } from '@angular/material/datepicker';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CanonicalValue, isAnswered, isKnownValue, Knowledge, Question } from '@shared';

type KnowledgeMode = 'known' | 'declared' | 'unknown';

const KNOWLEDGE_OPTIONS: { mode: KnowledgeMode; label: string }[] = [
  { mode: 'known', label: 'Valeur connue' },
  { mode: 'declared', label: 'Le client ne sait pas' },
  { mode: 'unknown', label: 'À vérifier' },
];

/** Un champ du questionnaire dynamique : le contrôle dépend du type de la question (texte, date, nombre, oui/non, choix). */
@Component({
  selector: 'app-question-field',
  imports: [
    MatButtonToggleModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './question-field.component.html',
  styleUrl: './question-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionFieldComponent {
  readonly question = input.required<Question>();
  readonly value = input<CanonicalValue | undefined>(undefined);
  readonly readonly = input(false);
  /** Signale ce champ s'il est obligatoire et vide. */
  readonly showMissing = input(false);
  /** Valeur remplie par la recherche du véhicule (signalée au courtier, qui peut la corriger). */
  readonly prefilled = input(false);
  /** Nouvelle valeur ; `null` efface la réponse. */
  readonly changed = output<CanonicalValue | null>();

  protected readonly knowledgeOptions = KNOWLEDGE_OPTIONS;
  protected readonly labelText = computed(() =>
    this.question().required ? `${this.question().label} *` : this.question().label,
  );
  protected readonly invalid = computed(
    () => this.showMissing() && this.question().required && !isAnswered(this.value()),
  );

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
    this.changed.emit(
      Number.isNaN(valueAsNumber) ? null : { value: valueAsNumber, knowledge: 'KNOWN' },
    );
  }

  protected toNumber(valueAsNumber: number): number | null {
    return Number.isNaN(valueAsNumber) ? null : valueAsNumber;
  }

  protected toText(text: string): string | null {
    return text === '' ? null : text;
  }
}

const MODE_OF: Record<Knowledge, KnowledgeMode> = {
  KNOWN: 'known',
  DECLARED_UNKNOWN: 'declared',
  UNKNOWN: 'unknown',
};
