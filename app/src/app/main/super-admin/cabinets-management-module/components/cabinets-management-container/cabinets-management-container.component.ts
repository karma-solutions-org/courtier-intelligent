import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CabinetsManagementStore } from '../../store/cabinets-management.store';
import { NewCabinetFormComponent } from '../new-cabinet-form/new-cabinet-form.component';
import { CABINETS_MANAGEMENT_STRUCTURE } from '../cabinets-management.structure';
import { CabinetsListComponent } from '../cabinets-list/cabinets-list.component';

@Component({
  selector: 'app-cabinets-management-container',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, NewCabinetFormComponent, CabinetsListComponent],
  template: `
    <div class="head">
      <h1>{{ structure.title }}</h1>
      @if (!showForm()) {
        <button mat-flat-button (click)="showForm.set(true)">
          <mat-icon>add</mat-icon>
          {{ structure.newCabinet }}
        </button>
      }
    </div>

    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }

    @if (showForm()) {
      <app-new-cabinet-form
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

    <app-cabinets-list
      [cabinets]="store.filteredCabinets()"
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
export class CabinetsManagementContainerComponent {
  protected readonly store = inject(CabinetsManagementStore);
  protected readonly structure = CABINETS_MANAGEMENT_STRUCTURE;
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
