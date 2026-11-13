import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { LogoPresentationComponent } from '../../../../../../core/components/logo/logo-presentation/logo-presentation.component';
import { FORGET_PASSWORD_PAGE_STRUCTURE } from './forget-password-page.structure';

@Component({
  selector: 'app-forget-password-presentation',
  imports: [
    LogoPresentationComponent,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './forget-password-presentation.component.html',
  styleUrls: ['../../auth-layout.scss', './forget-password-presentation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgetPasswordPresentationComponent {
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  readonly emailSent = input(false);
  readonly signinUrl = input.required<string>();
  readonly submitted = output<string>();

  protected readonly structure = FORGET_PASSWORD_PAGE_STRUCTURE;
  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });
  protected readonly email = this.form.controls.email;

  protected submit(): void {
    if (this.email.invalid) {
      this.email.markAsTouched();
      return;
    }
    this.submitted.emit(this.email.value);
  }
}
