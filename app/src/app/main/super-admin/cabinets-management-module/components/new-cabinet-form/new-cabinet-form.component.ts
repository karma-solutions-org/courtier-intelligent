import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { NewCabinetModel } from '../../models/new-cabinet.model';
import { CABINETS_MANAGEMENT_STRUCTURE } from '../cabinets-management.structure';

@Component({
  selector: 'app-new-cabinet-form',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <section class="card">
      <h2>{{ structure.title }}</h2>
      <p class="hint">{{ structure.hint }}</p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ structure.name }}</mat-label>
          <input matInput formControlName="name" />
          <mat-error>{{ structure.required }}</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ structure.orias }}</mat-label>
          <input matInput formControlName="orias" inputmode="numeric" />
          <mat-error>{{ structure.oriasInvalid }}</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ structure.adminName }}</mat-label>
          <input matInput formControlName="adminName" />
          <mat-error>{{ structure.required }}</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ structure.adminEmail }}</mat-label>
          <input matInput type="email" formControlName="adminEmail" />
          @if (form.controls.adminEmail.hasError('email')) {
            <mat-error>{{ structure.emailInvalid }}</mat-error>
          } @else {
            <mat-error>{{ structure.required }}</mat-error>
          }
        </mat-form-field>
        <div class="actions">
          <button mat-button type="button" (click)="cancelled.emit()">{{ structure.cancel }}</button>
          <button mat-flat-button type="submit" [disabled]="isPending()">{{ structure.submit }}</button>
        </div>
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
      margin: 0 0 4px;
      font-size: 17px;
      font-weight: 600;
    }

    .hint {
      margin: 0 0 16px;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 16px;
    }

    .actions {
      grid-column: 1 / -1;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    @media (max-width: 700px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewCabinetFormComponent {
  readonly isPending = input(false);
  readonly submitted = output<NewCabinetModel>();
  readonly cancelled = output<void>();

  protected readonly structure = CABINETS_MANAGEMENT_STRUCTURE.form;
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    orias: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d{8}$/)] }),
    adminName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    adminEmail: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitted.emit({
      name: value.name.trim(),
      orias: value.orias.trim() || null,
      adminName: value.adminName.trim(),
      adminEmail: value.adminEmail.trim().toLowerCase(),
    });
  }
}
