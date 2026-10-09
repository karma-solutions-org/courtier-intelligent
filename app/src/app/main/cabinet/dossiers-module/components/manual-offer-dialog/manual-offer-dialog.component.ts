import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  GENERAL_DEDUCTIBLE,
  Guarantee,
  ManualOfferInput,
  Offer,
  QUOTE_DOCUMENT_MAX_BYTES,
  QUOTE_DOCUMENT_TYPES,
  validateManualOffer,
} from '@shared';
import { ManualOfferSubmission } from '../../store/pricing.store';

export interface ManualOfferDialogData {
  insurerName: string;
  guarantees: Guarantee[];
  /** Offre déjà enregistrée (correction) : le formulaire en part. */
  offer: Offer | null;
}

const TEXT = {
  title: 'Saisir l’offre',
  quoteNumber: 'Numéro de devis',
  premiumAnnual: 'Prime annuelle (€)',
  premiumMonthly: 'Prime mensuelle (€)',
  generalDeductible: 'Franchise générale (€)',
  guarantees: 'Garanties',
  included: 'Incluse',
  limit: 'Plafond (€)',
  deductible: 'Franchise (€)',
  exclusions: 'Exclusions (une par ligne)',
  document: 'Devis (PDF, JPG ou PNG, 10 Mo max.)',
  chooseFile: 'Joindre le devis',
  keptDocument: 'Un devis est déjà joint : il est conservé si vous n’en choisissez pas un autre.',
  badFile: 'Fichier refusé : PDF, JPG ou PNG de 10 Mo maximum.',
  cancel: 'Annuler',
  save: 'Enregistrer l’offre',
} as const;

type GuaranteeRow = FormGroup<{
  included: FormControl<boolean>;
  limit: FormControl<number | null>;
  deductible: FormControl<number | null>;
}>;

/** Montant saisi : vide → null (non renseigné ≠ 0). */
const amount = (value: number | null | undefined): number | null =>
  value === null || value === undefined || Number.isNaN(value) ? null : value;

/** Saisie manuelle d'une offre (`source: manual`) : primes, franchises, garanties du référentiel, exclusions, devis joint. */
@Component({
  selector: 'app-manual-offer-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ text.title }} · {{ data.insurerName }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <div class="grid">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ text.quoteNumber }}</mat-label>
            <input matInput formControlName="quoteNumber" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ text.premiumAnnual }}</mat-label>
            <input matInput type="number" min="0" step="any" formControlName="premiumAnnual" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ text.premiumMonthly }}</mat-label>
            <input matInput type="number" min="0" step="any" formControlName="premiumMonthly" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ text.generalDeductible }}</mat-label>
            <input matInput type="number" min="0" step="any" formControlName="generalDeductible" />
          </mat-form-field>
        </div>

        @if (data.guarantees.length) {
          <h3>{{ text.guarantees }}</h3>
          <div class="guarantees" formArrayName="guarantees">
            @for (guarantee of data.guarantees; track guarantee.code; let i = $index) {
              <div class="row" [formGroupName]="i">
                <mat-checkbox formControlName="included">{{ guarantee.label }}</mat-checkbox>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ text.limit }}</mat-label>
                  <input matInput type="number" min="0" step="any" formControlName="limit" [attr.aria-label]="guarantee.label + ' : ' + text.limit" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ text.deductible }}</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    step="any"
                    formControlName="deductible"
                    [attr.aria-label]="guarantee.label + ' : ' + text.deductible"
                  />
                </mat-form-field>
              </div>
            }
          </div>
        }

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="full">
          <mat-label>{{ text.exclusions }}</mat-label>
          <textarea matInput rows="3" formControlName="exclusions"></textarea>
        </mat-form-field>

        <div class="document">
          <span class="label">{{ text.document }}</span>
          <input #fileInput type="file" hidden [accept]="acceptedTypes" (change)="pickFile($any($event.target).files)" />
          <button mat-stroked-button type="button" (click)="fileInput.click()">
            <mat-icon>attach_file</mat-icon>{{ text.chooseFile }}
          </button>
          @if (file(); as file) {
            <span class="file">{{ file.name }}</span>
          } @else if (data.offer?.documentId) {
            <span class="hint">{{ text.keptDocument }}</span>
          }
        </div>

        @if (problems().length) {
          <ul class="error" role="alert">
            @for (problem of problems(); track problem) {
              <li>{{ problem }}</li>
            }
          </ul>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ text.cancel }}</button>
        <button mat-flat-button type="submit">{{ text.save }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      padding-top: 4px;
    }

    h3 {
      margin: 20px 0 8px;
      font-size: 15px;
      font-weight: 600;
    }

    .guarantees {
      display: grid;
      gap: 8px;
    }

    .row {
      display: grid;
      grid-template-columns: minmax(180px, 1.4fr) 1fr 1fr;
      align-items: center;
      gap: 12px;
    }

    .full {
      width: 100%;
      margin-top: 16px;
    }

    .document {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-top: 12px;
    }

    .label,
    .hint {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .file {
      font-weight: 500;
    }

    .error {
      margin: 16px 0 0;
      padding: 12px 14px 12px 30px;
      border-radius: 10px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualOfferDialogComponent {
  protected readonly data = inject<ManualOfferDialogData>(MAT_DIALOG_DATA);
  private readonly _dialogRef = inject<MatDialogRef<ManualOfferDialogComponent, ManualOfferSubmission>>(MatDialogRef);

  protected readonly text = TEXT;
  protected readonly acceptedTypes = QUOTE_DOCUMENT_TYPES.join(',');
  protected readonly file = signal<File | null>(null);
  protected readonly problems = signal<string[]>([]);

  protected readonly form = this.buildForm(this.data.offer);

  protected pickFile(files: FileList | null): void {
    const file = files?.item(0) ?? null;
    if (file && (!QUOTE_DOCUMENT_TYPES.includes(file.type) || file.size > QUOTE_DOCUMENT_MAX_BYTES)) {
      this.file.set(null);
      this.problems.set([TEXT.badFile]);
      return;
    }
    this.problems.set([]);
    this.file.set(file);
  }

  protected submit(): void {
    const offer = this.toOffer();
    // Mêmes contrôles que le serveur : la saisie n'est pas perdue par une fermeture prématurée.
    const problems = validateManualOffer(
      offer,
      this.data.guarantees.map(g => g.code),
    );
    this.problems.set(problems);
    if (problems.length === 0) {
      this._dialogRef.close({ offer, file: this.file() });
    }
  }

  private toOffer(): ManualOfferInput {
    const value = this.form.getRawValue();
    const general = amount(value.generalDeductible);
    return {
      quoteNumber: value.quoteNumber.trim() || null,
      premiumAnnual: amount(value.premiumAnnual),
      premiumMonthly: amount(value.premiumMonthly),
      deductibles: general === null ? {} : { [GENERAL_DEDUCTIBLE]: general },
      // Seules les garanties renseignées (incluses, ou avec un montant) sont enregistrées.
      guarantees: this.data.guarantees
        .map((g, i) => ({ g, row: value.guarantees[i] }))
        .filter(({ row }) => row.included || amount(row.limit) !== null || amount(row.deductible) !== null)
        .map(({ g, row }) => ({
          code: g.code,
          label: g.label,
          included: row.included,
          limit: amount(row.limit),
          deductible: amount(row.deductible),
        })),
      exclusions: value.exclusions
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== ''),
    };
  }

  private buildForm(offer: Offer | null) {
    const existing = new Map((offer?.guarantees ?? []).map(g => [g.code, g]));
    return new FormGroup({
      quoteNumber: new FormControl(offer?.quoteNumber ?? '', { nonNullable: true }),
      premiumAnnual: new FormControl<number | null>(offer?.premiumAnnual ?? null),
      premiumMonthly: new FormControl<number | null>(offer?.premiumMonthly ?? null),
      generalDeductible: new FormControl<number | null>(offer?.deductibles?.[GENERAL_DEDUCTIBLE] ?? null),
      guarantees: new FormArray<GuaranteeRow>(
        this.data.guarantees.map(
          g =>
            new FormGroup({
              included: new FormControl(existing.get(g.code)?.included ?? false, { nonNullable: true }),
              limit: new FormControl<number | null>(existing.get(g.code)?.limit ?? null),
              deductible: new FormControl<number | null>(existing.get(g.code)?.deductible ?? null),
            }),
        ),
      ),
      exclusions: new FormControl((offer?.exclusions ?? []).join('\n'), { nonNullable: true }),
    });
  }
}
