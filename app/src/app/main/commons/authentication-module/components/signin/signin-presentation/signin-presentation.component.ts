import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../../../../core/components/logo/logo.component';
import { CredentialsModel } from '../../../models/credentials.model';
import { SIGNIN_PAGE_STRUCTURE } from './signin-page.structure';

@Component({
  selector: 'app-signin-presentation',
  imports: [
    LogoComponent,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './signin-presentation.component.html',
  styleUrl: '../../auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SigninPresentationComponent {
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  /** Information à afficher avant la connexion (ex. compte déjà connecté sur un autre appareil). */
  readonly notice = input<string | null>(null);
  readonly forgotPasswordUrl = input.required<string>();
  readonly signupUrl = input.required<string>();
  readonly submitted = output<CredentialsModel>();

  protected readonly structure = SIGNIN_PAGE_STRUCTURE;
  protected readonly hidePassword = signal(true);
  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitted.emit(this.form.getRawValue());
  }
}
