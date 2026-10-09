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
import { AssureFormModel } from '../../models/assure-form.model';
import {
  birthDateValidator,
  displayName,
  DuplicateCandidate,
  EMAIL_PATTERN,
  normalize,
  phoneValidator,
  POSTAL_CODE_PATTERN,
  siretValidator,
} from '../../util/assures.utils';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Formulaire de création / modification d'un assuré, avec validation des formats et alerte de doublon. */
@Component({
  selector: 'app-assure-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <section class="card">
        <h2>{{ structure.identity }}</h2>
        <mat-button-toggle-group formControlName="type" [attr.aria-label]="structure.type" hideSingleSelectionIndicator>
          @for (type of types; track type.value) {
            <mat-button-toggle [value]="type.value">{{ type.label }}</mat-button-toggle>
          }
        </mat-button-toggle-group>

        <div class="grid">
          @if (isPro()) {
            <mat-form-field appearance="outline">
              <mat-label>{{ structure.companyName }}</mat-label>
              <input matInput formControlName="companyName" [maxlength]="maxLengths.companyName" />
              @if (form.controls.companyName.hasError('required')) {
                <mat-error>{{ structure.errors.required }}</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ structure.siret }}</mat-label>
              <input matInput formControlName="siret" inputmode="numeric" />
              @if (form.controls.siret.hasError('siret')) {
                <mat-error>{{ structure.errors.siret }}</mat-error>
              }
            </mat-form-field>
          } @else {
            <mat-form-field appearance="outline">
              <mat-label>{{ structure.civilite }}</mat-label>
              <mat-select formControlName="civilite">
                @for (civilite of civilites; track civilite.value) {
                  <mat-option [value]="civilite.value">{{ civilite.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ structure.birthDate }}</mat-label>
              <input matInput type="date" formControlName="birthDate" />
              @if (form.controls.birthDate.hasError('birthDate')) {
                <mat-error>{{ structure.errors.birthDate }}</mat-error>
              }
            </mat-form-field>
          }
          <mat-form-field appearance="outline">
            <mat-label>{{ structure.firstName }}</mat-label>
            <input matInput formControlName="firstName" [maxlength]="maxLengths.firstName" autocomplete="off" />
            @if (form.controls.firstName.hasError('required')) {
              <mat-error>{{ structure.errors.required }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ structure.lastName }}</mat-label>
            <input matInput formControlName="lastName" [maxlength]="maxLengths.lastName" autocomplete="off" />
            @if (form.controls.lastName.hasError('required')) {
              <mat-error>{{ structure.errors.required }}</mat-error>
            }
          </mat-form-field>
        </div>
      </section>

      <section class="card">
        <h2>{{ structure.contact }}</h2>
        <div class="grid">
          <mat-form-field appearance="outline">
            <mat-label>{{ structure.email }}</mat-label>
            <input matInput type="email" formControlName="email" [maxlength]="maxLengths.email" autocomplete="off" />
            @if (form.controls.email.hasError('pattern')) {
              <mat-error>{{ structure.errors.email }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ structure.phone }}</mat-label>
            <input matInput type="tel" formControlName="phone" [maxlength]="maxLengths.phone" autocomplete="off" />
            @if (form.controls.phone.hasError('phone')) {
              <mat-error>{{ structure.errors.phone }}</mat-error>
            }
          </mat-form-field>
        </div>
      </section>

      <section class="card">
        <h2>{{ structure.address }}</h2>
        <div class="grid">
          <mat-form-field appearance="outline" class="wide">
            <mat-label>{{ structure.street }}</mat-label>
            <input matInput formControlName="street" [maxlength]="maxLengths.street" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ structure.postalCode }}</mat-label>
            <input matInput formControlName="postalCode" inputmode="numeric" autocomplete="off" />
            @if (form.controls.postalCode.hasError('pattern')) {
              <mat-error>{{ structure.errors.postalCode }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ structure.city }}</mat-label>
            <input matInput formControlName="city" [maxlength]="maxLengths.city" autocomplete="off" />
          </mat-form-field>
        </div>
      </section>

      @if (duplicates().length) {
        <section class="duplicates" role="alert">
          <h2>{{ duplicateStructure.title }}</h2>
          <ul>
            @for (duplicate of duplicates(); track duplicate.id) {
              <li>
                <strong>{{ nameOf(duplicate) }}</strong>
                <span class="reason">({{ reasonOf(duplicate) }})</span>
                <a [routerLink]="['/espace/assures', duplicate.id]" target="_blank">{{ duplicateStructure.open }}</a>
              </li>
            }
          </ul>
        </section>
      }

      <div class="actions">
        <button mat-button type="button" (click)="cancelled.emit()">{{ structure.cancel }}</button>
        <button mat-flat-button type="submit" [disabled]="isPending() || (mode() === 'edit' && form.pristine)">
          {{ submitLabel() }}
        </button>
      </div>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }

    form {
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
      column-gap: 16px;
      margin-top: 16px;
    }

    .wide {
      grid-column: 1 / -1;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .error {
      margin: 0;
      padding: 12px 14px;
      border-radius: 10px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }

    .duplicates {
      padding: 16px 24px;
      border-radius: 14px;
      color: var(--mat-sys-on-tertiary-container);
      background: var(--mat-sys-tertiary-container);

      h2 {
        margin-bottom: 8px;
        font-size: 15px;
      }

      ul {
        margin: 0;
        padding-left: 20px;
      }

      a {
        margin-left: 8px;
      }
    }

    @media (max-width: 700px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureFormComponent {
  /** Assuré à modifier (null : création). */
  readonly assure = input<Assure | null>(null);
  readonly mode = input<'create' | 'edit'>('create');
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  /** Assurés existants qui ressemblent à la saisie. */
  readonly duplicates = input<Assure[]>([]);
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
    email: new FormControl('', { nonNullable: true, validators: [Validators.pattern(EMAIL_PATTERN)] }),
    phone: new FormControl('', { nonNullable: true, validators: [phoneValidator] }),
    street: new FormControl('', { nonNullable: true }),
    postalCode: new FormControl('', { nonNullable: true, validators: [Validators.pattern(POSTAL_CODE_PATTERN)] }),
    city: new FormControl('', { nonNullable: true }),
  });

  private readonly _value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
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
      const { email, firstName, lastName, birthDate, type } = this._value();
      this.candidateChanged.emit({ email, firstName, lastName, birthDate: type === 'pro' ? null : birthDate });
    });
  }

  protected nameOf(assure: Assure): string {
    return displayName(assure);
  }

  /** Pourquoi cet assuré est signalé comme doublon. */
  protected reasonOf(duplicate: Assure): string {
    const { email } = this.form.getRawValue();
    return email && normalize(email) === normalize(duplicate.email)
      ? this.duplicateStructure.sameEmail
      : this.duplicateStructure.sameIdentity;
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
