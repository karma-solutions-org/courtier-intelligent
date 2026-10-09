import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CONTRACT_NUMBER_MAX, validateContractNumber, validateEffectiveDate } from '@shared';
import { PROPOSAL_STRUCTURE } from '../proposal-tab/proposal-tab.structure';

export interface SubscriptionDialogResult {
  contractNumber: string;
  effectiveDate: string;
}

/** Souscription : numéro de contrat et date d'effet obligatoires (contrôlés aussi par le serveur). */
@Component({
  selector: 'app-subscription-dialog',
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ text.title }}</h2>
    <mat-dialog-content class="content">
      <mat-form-field appearance="outline">
        <mat-label>{{ text.contractNumber }}</mat-label>
        <input matInput [formControl]="contractNumber" [maxlength]="max" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>{{ text.effectiveDate }}</mat-label>
        <input matInput type="date" [formControl]="effectiveDate" />
        @if (effectiveDate.value && dateProblem()) {
          <mat-hint class="problem">{{ dateProblem() }}</mat-hint>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>{{ text.cancel }}</button>
      <button mat-flat-button type="button" [disabled]="!valid()" (click)="submit()">{{ text.confirm }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content {
      display: grid;
      gap: 8px;
      min-width: min(400px, 80vw);
    }

    .problem {
      color: var(--mat-sys-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionDialogComponent {
  private readonly _ref = inject<MatDialogRef<SubscriptionDialogComponent, SubscriptionDialogResult>>(MatDialogRef);
  protected readonly text = PROPOSAL_STRUCTURE.dialog;
  protected readonly max = CONTRACT_NUMBER_MAX;
  protected readonly contractNumber = new FormControl('', { nonNullable: true });
  protected readonly effectiveDate = new FormControl('', { nonNullable: true });

  protected dateProblem(): string | null {
    return validateEffectiveDate(this.effectiveDate.value);
  }

  protected valid(): boolean {
    return validateContractNumber(this.contractNumber.value) === null && this.dateProblem() === null;
  }

  protected submit(): void {
    if (this.valid()) {
      this._ref.close({ contractNumber: this.contractNumber.value.trim(), effectiveDate: this.effectiveDate.value });
    }
  }
}
