import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  COVERAGE_LEVEL_LABELS,
  COVERAGE_LEVELS,
  CoverageLevel,
  DossierStatus,
  Guarantee,
  NeedAnalysis,
  NeedInput,
  NeedSuggestion,
} from '@shared';

const TEXT = {
  title: 'Couverture souhaitée',
  validatedOn: 'Validée le',
  saved: 'Enregistrée : il reste à la valider pour passer à la tarification.',
  notSaved: "Rien n'est encore enregistré.",
  reopenWarning: 'La modifier annule sa validation : le dossier repasse en « complet ».',
  readonly: 'Ce dossier a dépassé cette étape : elle est consultable seulement.',
  coverage: 'Niveau de couverture',
  budget: 'Budget maximum (€ par an)',
  deductible: 'Franchise maximum (€)',
  mandatory: 'Garanties indispensables',
  nice: 'Garanties souhaitées',
  notes: 'Notes',
  amountInvalid: 'Montant positif attendu',
  suggestionsTitle: 'Suggestions selon le questionnaire',
  suggestionsHint: "Vous pouvez les modifier avant d'enregistrer.",
  apply: 'Appliquer les suggestions',
  save: 'Enregistrer les modifications',
  validate: 'Valider la couverture',
  coverageBeforeValidate: 'Choisissez un niveau de couverture pour pouvoir valider.',
  none: 'Aucune',
} as const;

/** Formulaire de l'analyse du besoin : couverture, budget, franchise, garanties, notes, suggestions et validation. */
@Component({
  selector: 'app-need-form',
  imports: [DatePipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './need-form.component.html',
  styleUrl: './need-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NeedFormComponent {
  /** Besoin enregistré (null : pas encore de besoin). */
  readonly need = input<NeedAnalysis | null>(null);
  /** Référentiel des garanties du produit. */
  readonly guarantees = input<Guarantee[]>([]);
  readonly suggestion = input<NeedSuggestion | null>(null);
  readonly status = input<DossierStatus>('complet');
  /** Consultation seule (dossier au-delà de l'analyse du besoin). */
  readonly readonly = input(false);
  readonly isPending = input(false);
  readonly saved = output<NeedInput>();
  readonly validated = output<void>();

  protected readonly text = TEXT;
  protected readonly levels = COVERAGE_LEVELS.map(value => ({ value, label: COVERAGE_LEVEL_LABELS[value] }));

  protected readonly form = new FormGroup({
    coverageLevel: new FormControl<CoverageLevel | ''>('', { nonNullable: true }),
    budgetMax: new FormControl<number | null>(null, [Validators.min(0)]),
    maxDeductible: new FormControl<number | null>(null, [Validators.min(0)]),
    mandatoryGuarantees: new FormControl<string[]>([], { nonNullable: true }),
    niceToHave: new FormControl<string[]>([], { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  /** Formulaire non modifié depuis le dernier enregistrement (réactif, contrairement à `form.pristine`). */
  protected readonly pristine = toSignal(this.form.events.pipe(map(() => this.form.pristine)), { initialValue: true });

  private readonly _mandatory = toSignal(this.form.controls.mandatoryGuarantees.valueChanges, { initialValue: [] as string[] });

  /** Une garantie indispensable ne se propose plus parmi les souhaitées. */
  protected readonly niceOptions = computed(() => this.guarantees().filter(g => !this._mandatory().includes(g.code)));

  protected readonly validatedAt = computed(() => this.need()?.validatedAt?.toMillis() ?? null);
  protected readonly showSuggestion = computed(() => {
    const suggestion = this.suggestion();
    return !this.readonly() && !!suggestion && suggestion.reasons.length > 0;
  });
  private readonly _coverage = toSignal(this.form.controls.coverageLevel.valueChanges, {
    initialValue: this.form.controls.coverageLevel.value,
  });
  /** Validable dès qu'un niveau de couverture est choisi dans le formulaire (la saisie est enregistrée au passage). */
  protected readonly canValidate = computed(() => !!this._coverage());
  protected readonly validateHint = computed(() => (this.canValidate() ? '' : this.text.coverageBeforeValidate));

  constructor() {
    // Remplit le formulaire avec le besoin enregistré, sans écraser une saisie en cours.
    effect(() => {
      const need = this.need();
      if (this.form.pristine) {
        this.form.reset({
          coverageLevel: need?.coverageLevel ?? '',
          budgetMax: need?.budgetMax ?? null,
          maxDeductible: need?.maxDeductible ?? null,
          mandatoryGuarantees: need?.mandatoryGuarantees ?? [],
          niceToHave: need?.niceToHave ?? [],
          notes: need?.notes ?? '',
        });
      }
    });
    effect(() => (this.readonly() ? this.form.disable({ emitEvent: false }) : this.form.enable({ emitEvent: false })));
    // Une garantie passée en « indispensable » sort des « souhaitées ».
    effect(() => {
      const mandatory = this._mandatory();
      const nice = this.form.controls.niceToHave;
      if (nice.value.some(code => mandatory.includes(code))) {
        nice.setValue(nice.value.filter(code => !mandatory.includes(code)));
      }
    });
  }

  /** Reprend les suggestions dans le formulaire (à modifier, puis à enregistrer). */
  protected applySuggestion(): void {
    const suggestion = this.suggestion();
    if (!suggestion) return;
    this.form.patchValue({
      ...(suggestion.coverageLevel ? { coverageLevel: suggestion.coverageLevel } : {}),
      mandatoryGuarantees: suggestion.mandatoryGuarantees,
      niceToHave: suggestion.niceToHave,
    });
    this.form.markAsDirty();
  }

  /** Enregistre la saisie si elle a changé, puis valide : le store exécute les deux dans cet ordre. */
  protected saveAndValidate(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.form.pristine) this.submit();
    this.validated.emit();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saved.emit({
      coverageLevel: value.coverageLevel || null,
      budgetMax: value.budgetMax ?? null,
      maxDeductible: value.maxDeductible ?? null,
      mandatoryGuarantees: value.mandatoryGuarantees,
      niceToHave: value.niceToHave,
      notes: value.notes.trim() || null,
    });
    this.form.markAsPristine();
  }
}
