import { MatDatepickerModule } from '@angular/material/datepicker';
import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { Assure, ASSURE_MAX_LENGTHS } from '@shared';
import { AssureFormModel } from '../../../models/assure-form.model';
import {
  birthDateValidator,
  displayName,
  DuplicateCandidate,
  DuplicateMatch,
  EMAIL_PATTERN,
  phoneValidator,
  POSTAL_CODE_PATTERN,
  siretValidator,
} from '../../../util/assures.utils';
import { ASSURES_STRUCTURE } from '../../assures.structure';

/** Formulaire de création / modification d'un assuré, avec validation des formats et alerte de doublon. */
@Component({
  selector: 'app-assure-form',
  imports: [
    MatDatepickerModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './assure-form-presentation.component.html',
  styleUrl: './assure-form-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureFormPresentationComponent {
  /** Assuré à modifier (null : création). */
  readonly assure = input<Assure | null>(null);
  readonly mode = input<'create' | 'edit'>('create');
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  /** Assurés existants qui ressemblent à la saisie. */
  readonly duplicates = input<DuplicateMatch[]>([]);
  /** Valeurs lues sur une pièce (CIN, Kbis) : elles remplissent les champs correspondants, modifiables ensuite. */
  readonly prefill = input<Partial<AssureFormModel> | null>(null);
  readonly submitted = output<AssureFormModel>();
  readonly cancelled = output<void>();
  /** La saisie a changé : le conteneur recalcule les doublons. */
  readonly candidateChanged = output<DuplicateCandidate>();

  protected readonly structure = ASSURES_STRUCTURE.form;
  /** Longueurs maximales acceptées par les règles Firestore. */
  protected readonly maxLengths = ASSURE_MAX_LENGTHS;
  protected readonly duplicateStructure = ASSURES_STRUCTURE.duplicate;
  protected readonly types = ASSURES_STRUCTURE.types;
  protected readonly civilites = ASSURES_STRUCTURE.civilites;

  protected readonly form = new FormGroup({
    type: new FormControl<Assure['type']>('particulier', { nonNullable: true }),
    civilite: new FormControl<'M.' | 'Mme' | ''>('', { nonNullable: true }),
    firstName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    lastName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    companyName: new FormControl('', { nonNullable: true }),
    siret: new FormControl('', { nonNullable: true, validators: [siretValidator] }),
    birthDate: new FormControl('', { nonNullable: true, validators: [birthDateValidator] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(EMAIL_PATTERN)],
    }),
    phone: new FormControl('', { nonNullable: true, validators: [phoneValidator] }),
    street: new FormControl('', { nonNullable: true }),
    postalCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(POSTAL_CODE_PATTERN)],
    }),
    city: new FormControl('', { nonNullable: true }),
  });

  private readonly _value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly isPro = computed(() => this._value().type === 'pro');

  protected readonly submitLabel = computed(() => {
    const duplicate = this.duplicates().length > 0;
    if (this.mode() === 'edit') {
      return duplicate ? this.structure.saveAnyway : this.structure.save;
    }
    return duplicate ? this.structure.createAnyway : this.structure.create;
  });

  constructor() {
    // La raison sociale n'est obligatoire que pour un professionnel.
    effect(() => {
      const companyName = this.form.controls.companyName;
      companyName.setValidators(this.isPro() ? [Validators.required] : []);
      companyName.updateValueAndValidity({ emitEvent: false });
    });

    // Remplit le formulaire avec l'assuré à modifier, sans écraser une saisie en cours.
    effect(() => {
      const assure = this.assure();
      if (assure && this.form.pristine) {
        this.form.reset({
          type: assure.type,
          civilite: assure.civilite ?? '',
          firstName: assure.firstName,
          lastName: assure.lastName,
          companyName: assure.companyName ?? '',
          siret: assure.siret ?? '',
          birthDate: assure.birthDate ?? '',
          email: assure.email ?? '',
          phone: assure.phone ?? '',
          street: assure.address?.street ?? '',
          postalCode: assure.address?.postalCode ?? '',
          city: assure.address?.city ?? '',
        });
      }
    });

    effect(() => {
      const prefill = this.prefill();
      if (!prefill) return;
      this.form.patchValue(prefill);
      this.form.markAsDirty();
    });

    effect(() => {
      const { email, firstName, lastName, birthDate, type, siret, companyName } = this._value();
      this.candidateChanged.emit({
        email,
        firstName,
        lastName,
        birthDate: type === 'pro' ? null : birthDate,
        siret: type === 'pro' ? siret : null,
        companyName: type === 'pro' ? companyName : null,
      });
    });
  }

  protected nameOf(assure: Assure): string {
    return displayName(assure);
  }

  /** Pourquoi cet assuré est signalé comme doublon. */
  protected reasonOf(duplicate: DuplicateMatch): string {
    return duplicate.reasons.map((reason) => this.duplicateStructure.reasons[reason]).join(', ');
  }

  /** Saisie pas encore enregistrée (garde de sortie de route). */
  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitted.emit(this.form.getRawValue());
    this.form.markAsPristine();
  }
}
