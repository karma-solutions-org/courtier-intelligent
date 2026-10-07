import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TenantsManagementStore } from '../../store/tenants-management.store';
import { NewTenantFormComponent } from '../new-tenant-form/new-tenant-form.component';
import { TENANTS_MANAGEMENT_STRUCTURE } from '../tenants-management.structure';
import { TenantsListComponent } from '../tenants-list/tenants-list.component';

@Component({
  selector: 'app-tenants-management-container',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, NewTenantFormComponent, TenantsListComponent],
  template: `
    <div class="head">
      <h1>{{ structure.title }}</h1>
      @if (!showForm()) {
        <button mat-flat-button (click)="showForm.set(true)">
          <mat-icon>add</mat-icon>
          {{ structure.newTenant }}
        </button>
      }
    </div>

    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }

    @if (showForm()) {
      <app-new-tenant-form
        [isPending]="store.isPending()"
        (submitted)="store.create($event)"
        (cancelled)="showForm.set(false)"
      />
    }

    <mat-form-field appearance="outline" class="search" subscriptSizing="dynamic">
      <mat-icon matPrefix>search</mat-icon>
      <mat-label>{{ structure.search }}</mat-label>
      <input matInput [value]="store.search()" (input)="store.setSearch($any($event.target).value)" />
    </mat-form-field>

    <app-tenants-list
      [tenants]="store.filteredTenants()"
      [isPending]="store.isPending()"
      (activeChanged)="store.setActive($event)"
    />
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 600;
    }

    .search {
      max-width: 420px;
    }

    .error {
      margin: 0;
      padding: 12px 14px;
      border-radius: 10px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantsManagementContainerComponent {
  protected readonly store = inject(TenantsManagementStore);
  protected readonly structure = TENANTS_MANAGEMENT_STRUCTURE;
  protected readonly showForm = signal(false);
  private readonly _snackBar = inject(MatSnackBar);

  constructor() {
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 4000 });
        this.store.clearMessage();
        this.showForm.set(false);
      }
    });
  }
}
