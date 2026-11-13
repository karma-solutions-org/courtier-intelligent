import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Cabinet } from '@shared';
import { CabinetInfoModel } from '../../models/cabinet-info.model';
import { SETTINGS_STRUCTURE } from '../settings.structure';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

@Component({
  selector: 'app-cabinet-form',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './cabinet-form.component.html',
  styleUrls: ['../settings.scss', './cabinet-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CabinetFormComponent {
  readonly cabinet = input<Cabinet | null>(null);
  readonly isPending = input(false);
  readonly saved = output<CabinetInfoModel>();
  readonly logoSelected = output<File>();

  protected readonly structure = SETTINGS_STRUCTURE.cabinet;
  protected readonly logoError = signal<string | null>(null);
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    orias: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d{8}$/)] }),
    address: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
  });

  constructor() {
    // Remplit le formulaire avec les données du cabinet, sans écraser une saisie en cours.
    effect(() => {
      const cabinet = this.cabinet();
      if (cabinet && this.form.pristine) {
        this.form.reset({
          name: cabinet.name ?? '',
          orias: cabinet.orias ?? '',
          address: cabinet.address ?? '',
          phone: cabinet.phone ?? '',
          email: cabinet.email ?? '',
        });
      }
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const orNull = (text: string) => text.trim() || null;
    this.saved.emit({
      name: value.name.trim(),
      orias: orNull(value.orias),
      address: orNull(value.address),
      phone: orNull(value.phone),
      email: orNull(value.email),
    });
    this.form.markAsPristine();
  }

  protected onFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      this.logoError.set(this.structure.logoTooBig);
      return;
    }
    this.logoError.set(null);
    this.logoSelected.emit(file);
  }
}
