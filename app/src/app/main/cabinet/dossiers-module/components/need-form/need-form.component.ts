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
  isNeedValidatable,
  NeedAnalysis,
  NeedInput,
  NeedSuggestion,
} from '@shared';

const TEXT = {
  title: 'Analyse du besoin',
  validatedOn: 'Besoin validé le',
  saved: 'Besoin enregistré : il reste à le valider pour passer à la tarification.',
  notSaved: "Aucun besoin enregistré pour l'instant.",
  reopenWarning: 'Modifier un besoin validé annule sa validation : le dossier repasse en « complet ».',
  readonly: "Ce dossier n'est plus au stade de l'analyse du besoin : il est consultable seulement.",
  coverage: 'Niveau de couverture',
  budget: 'Budget maximum (€ par an)',
  deductible: 'Franchise maximum (€)',
  mandatory: 'Garanties indispensables',
  nice: 'Garanties souhaitées',
  notes: 'Notes',
  amountInvalid: 'Montant positif attendu',
  suggestionsTitle: 'Suggestions selon le questionnaire',
  suggestionsHint: 'Vous pouvez les modifier avant d’enregistrer.',
  apply: 'Appliquer les suggestions',
  save: 'Enregistrer le besoin',
  validate: 'Valider le besoin',
  saveBeforeValidate: 'Enregistrez le besoin avant de le valider.',
  coverageBeforeValidate: 'Choisissez un niveau de couverture pour pouvoir valider.',
  none: 'Aucune',
} as const;

/** Formulaire de l'analyse du besoin : couverture, budget, franchise, garanties, notes, suggestions et validation. */
@Component({
  selector: 'app-need-form',
  imports: [DatePipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  template: `
    <section class="card">
      <h2>{{ text.title }}</h2>

      @if (validatedAt(); as validatedAt) {
        <p class="banner ok" role="status"><mat-icon>verified</mat-icon>{{ text.validatedOn }} {{ validatedAt | date: 'd MMMM y' }}</p>
      } @else if (need()) {
        <p class="banner" role="status">{{ text.saved }}</p>
      } @else if (!readonly()) {
        <p class="banner" role="status">{{ text.notSaved }}</p>
      }
      @if (readonly()) {
        <p class="hint">{{ text.readonly }}</p>
      }

      @if (showSuggestion()) {
        <div class="suggestions" role="region" [attr.aria-label]="text.suggestionsTitle">
          <h3>{{ text.suggestionsTitle }}</h3>
          <ul>
            @for (reason of suggestion()!.reasons; track reason) {
              <li>{{ reason }}</li>
            }
          </ul>
          <p class="hint">{{ text.suggestionsHint }}</p>
          <button mat-stroked-button type="button" (click)="applySuggestion()">{{ text.apply }}</button>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="grid">
          <mat-form-field appearance="outline">
            <mat-label>{{ text.coverage }}</mat-label>
            <mat-select formControlName="coverageLevel">
              <mat-option value="">{{ text.none }}</mat-option>
              @for (level of levels; track level.value) {
                <mat-option [value]="level.value">{{ level.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <span></span>
          <mat-form-field appearance="outline">
            <mat-label>{{ text.budget }}</mat-label>
            <input matInput type="number" min="0" step="any" formControlName="budgetMax" />
            @if (form.controls.budgetMax.invalid) {
              <mat-error>{{ text.amountInvalid }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ text.deductible }}</mat-label>
            <input matInput type="number" min="0" step="any" formControlName="maxDeductible" />
            @if (form.controls.maxDeductible.invalid) {
              <mat-error>{{ text.amountInvalid }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ text.mandatory }}</mat-label>
            <mat-select multiple formControlName="mandatoryGuarantees">
              @for (guarantee of guarantees(); track guarantee.code) {
                <mat-option [value]="guarantee.code">{{ guarantee.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ text.nice }}</mat-label>
            <mat-select multiple formControlName="niceToHave">
              @for (guarantee of niceOptions(); track guarantee.code) {
                <mat-option [value]="guarantee.code">{{ guarantee.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="wide">
            <mat-label>{{ text.notes }}</mat-label>
            <textarea matInput rows="4" maxlength="2000" formControlName="notes"></textarea>
          </mat-form-field>
        </div>

        @if (status() === 'besoin_valide' && !readonly()) {
          <p class="hint">{{ text.reopenWarning }}</p>
        }
        @if (!readonly()) {
          <div class="actions">
            @if (status() === 'complet') {
              <span class="hint">{{ validateHint() }}</span>
              <button mat-stroked-button type="button" [disabled]="!canValidate() || isPending()" (click)="validated.emit()">
                {{ text.validate }}
              </button>
            }
            <button mat-flat-button type="submit" [disabled]="pristine() || isPending()">{{ text.save }}</button>
          </div>
        }
      </form>
    </section>
  `,
  styles: `
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

    h3 {
      margin: 0 0 8px;
      font-size: 15px;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 16px;
    }

    .wide {
      grid-column: 1 / -1;
    }

    .banner {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 16px;
      padding: 10px 14px;
      border-radius: 10px;
      background: var(--mat-sys-surface-container);

      &.ok {
        color: #1e7d50;
        background: #e3f5ec;
      }
    }

    .suggestions {
      margin-bottom: 20px;
      padding: 14px 16px;
      border-radius: 10px;
      color: var(--mat-sys-on-tertiary-container);
      background: var(--mat-sys-tertiary-container);

      ul {
        margin: 0 0 8px;
        padding-left: 20px;
      }
    }

    .hint {
      margin: 0;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }

    @media (max-width: 700px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `,
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
  /** Validable quand le besoin enregistré a un niveau de couverture et que la saisie est enregistrée. */
  protected readonly canValidate = computed(() => isNeedValidatable(this.need()) && this.pristine());
  protected readonly validateHint = computed(() => {
    if (!isNeedValidatable(this.need())) return this.text.coverageBeforeValidate;
    return this.pristine() ? '' : this.text.saveBeforeValidate;
  });

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
