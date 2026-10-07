import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Tenant } from '@shared';
import { TenantInfoModel } from '../../models/tenant-info.model';
import { SETTINGS_STRUCTURE } from '../settings.structure';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

@Component({
  selector: 'app-tenant-form',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <section class="card">
      <h2>{{ structure.logoTitle }}</h2>
      <div class="logo-row">
        <div class="logo-preview">
          @if (tenant()?.logoPath) {
            <img [src]="tenant()!.logoPath" alt="Logo du cabinet" />
          } @else {
            <mat-icon>apartment</mat-icon>
          }
        </div>
        <div>
          <input #fileInput type="file" accept="image/png,image/jpeg,image/svg+xml" hidden (change)="onFile(fileInput)" />
          <button mat-stroked-button type="button" [disabled]="isPending()" (click)="fileInput.click()">
            {{ structure.logoButton }}
          </button>
          <p class="hint">{{ structure.logoHint }}</p>
          @if (logoError()) {
            <p class="error">{{ logoError() }}</p>
          }
        </div>
      </div>
    </section>

    <section class="card">
      <h2>{{ structure.infoTitle }}</h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="grid">
        <mat-form-field appearance="outline" class="wide">
          <mat-label>{{ structure.name }}</mat-label>
          <input matInput formControlName="name" />
          @if (form.controls.name.hasError('required')) {
            <mat-error>{{ structure.nameRequired }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ structure.orias }}</mat-label>
          <input matInput formControlName="orias" inputmode="numeric" />
          @if (form.controls.orias.hasError('pattern')) {
            <mat-error>{{ structure.oriasInvalid }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ structure.phone }}</mat-label>
          <input matInput formControlName="phone" type="tel" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="wide">
          <mat-label>{{ structure.address }}</mat-label>
          <input matInput formControlName="address" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="wide">
          <mat-label>{{ structure.email }}</mat-label>
          <input matInput formControlName="email" type="email" />
          @if (form.controls.email.hasError('email')) {
            <mat-error>{{ structure.emailInvalid }}</mat-error>
          }
        </mat-form-field>
        <div class="wide actions">
          <button mat-flat-button type="submit" [disabled]="isPending() || form.pristine">{{ structure.save }}</button>
        </div>
      </form>
    </section>
  `,
  styleUrl: '../settings.scss',
  styles: `
    .logo-row {
      display: flex;
      align-items: flex-start;
      gap: 20px;
    }

    .logo-preview {
      display: grid;
      place-items: center;
      flex: none;
      width: 88px;
      height: 88px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      overflow: hidden;
      color: var(--mat-sys-on-surface-variant);
      background: var(--mat-sys-surface-container-low);

      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantFormComponent {
  readonly tenant = input<Tenant | null>(null);
  readonly isPending = input(false);
  readonly saved = output<TenantInfoModel>();
  readonly logoSelected = output<File>();

  protected readonly structure = SETTINGS_STRUCTURE.tenant;
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
      const tenant = this.tenant();
      if (tenant && this.form.pristine) {
        this.form.reset({
          name: tenant.name ?? '',
          orias: tenant.orias ?? '',
          address: tenant.address ?? '',
          phone: tenant.phone ?? '',
          email: tenant.email ?? '',
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
