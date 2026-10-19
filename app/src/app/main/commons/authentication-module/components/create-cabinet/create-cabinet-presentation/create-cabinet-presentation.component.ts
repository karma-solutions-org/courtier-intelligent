import { ChangeDetectionStrategy, Component, input, OnInit, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LogoComponent } from '../../../../../../core/components/logo/logo.component';
import { CREATE_CABINET_PAGE_STRUCTURE } from './create-cabinet-page.structure';

@Component({
  selector: 'app-create-cabinet-presentation',
  imports: [LogoComponent, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './create-cabinet-presentation.component.html',
  styleUrl: '../../auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCabinetPresentationComponent implements OnInit {
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  readonly email = input('');
  readonly emailVerified = input(false);
  readonly verificationEmailSent = input(false);
  readonly initialCabinetName = input('');
  readonly submitted = output<string>();
  readonly resend = output<void>();
  readonly signOut = output<void>();

  protected readonly structure = CREATE_CABINET_PAGE_STRUCTURE;
  protected readonly cabinetName = new FormControl('', { nonNullable: true, validators: [Validators.required] });

  ngOnInit(): void {
    this.cabinetName.setValue(this.initialCabinetName());
  }

  protected submit(): void {
    if (!this.cabinetName.value.trim()) {
      this.cabinetName.setErrors({ required: true });
      this.cabinetName.markAsTouched();
      return;
    }
    this.submitted.emit(this.cabinetName.value.trim());
  }
}
