import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { FORGET_PASSWORD_PAGE_STRUCTURE } from './forget-password-page.structure';

@Component({
  selector: 'app-forget-password-presentation',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './forget-password-presentation.component.html',
  styleUrl: '../../auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgetPasswordPresentationComponent {
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  readonly emailSent = input(false);
  readonly signinUrl = input.required<string>();
  readonly submitted = output<string>();

  protected readonly structure = FORGET_PASSWORD_PAGE_STRUCTURE;
  protected readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });

  protected submit(): void {
    if (this.email.invalid) {
      this.email.markAsTouched();
      return;
    }
    this.submitted.emit(this.email.value);
  }
}
