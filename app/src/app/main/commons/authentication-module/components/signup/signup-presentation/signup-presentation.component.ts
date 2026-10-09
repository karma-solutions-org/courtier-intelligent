import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../../../../core/components/logo/logo.component';
import { SignupModel } from '../../../models/signup.model';
import { SIGNUP_PAGE_STRUCTURE } from './signup-page.structure';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const { password, confirm } = group.value as { password: string; confirm: string };
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-signup-presentation',
  imports: [
    LogoComponent,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './signup-presentation.component.html',
  styleUrl: '../../auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupPresentationComponent {
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  readonly signinUrl = input.required<string>();
  /** Vrai pour créer un nouveau cabinet ; faux quand on s'inscrit pour rejoindre un cabinet (invitation). */
  readonly withCabinet = input(true);
  readonly submitted = output<SignupModel>();

  protected readonly structure = SIGNUP_PAGE_STRUCTURE;
  protected readonly form = new FormGroup(
    {
      cabinetName: new FormControl('', { nonNullable: true }),
      displayName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: passwordsMatch },
  );

  protected submit(): void {
    const cabinetNameControl = this.form.controls.cabinetName;
    if (this.withCabinet() && !cabinetNameControl.value.trim()) {
      cabinetNameControl.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { cabinetName, displayName, email, password } = this.form.getRawValue();
    this.submitted.emit({
      displayName,
      email,
      password,
      ...(this.withCabinet() ? { cabinetName: cabinetName.trim() } : {}),
    });
  }
}
