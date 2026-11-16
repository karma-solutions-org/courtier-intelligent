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
import { ManualOfferSubmission } from '../../../store/pricing.store';

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
  templateUrl: './manual-offer-dialog-presentation.component.html',
  styleUrl: './manual-offer-dialog-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualOfferDialogPresentationComponent {
  protected readonly data = inject<ManualOfferDialogData>(MAT_DIALOG_DATA);
  private readonly _dialogRef =
    inject<MatDialogRef<ManualOfferDialogPresentationComponent, ManualOfferSubmission>>(MatDialogRef);

  protected readonly text = TEXT;
  protected readonly acceptedTypes = QUOTE_DOCUMENT_TYPES.join(',');
  protected readonly file = signal<File | null>(null);
  protected readonly problems = signal<string[]>([]);

  protected readonly form = this.buildForm(this.data.offer);

  protected pickFile(files: FileList | null): void {
    const file = files?.item(0) ?? null;
    if (
      file &&
      (!QUOTE_DOCUMENT_TYPES.includes(file.type) || file.size > QUOTE_DOCUMENT_MAX_BYTES)
    ) {
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
      this.data.guarantees.map((g) => g.code),
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
        .filter(
          ({ row }) =>
            row.included || amount(row.limit) !== null || amount(row.deductible) !== null,
        )
        .map(({ g, row }) => ({
          code: g.code,
          label: g.label,
          included: row.included,
          limit: amount(row.limit),
          deductible: amount(row.deductible),
        })),
      exclusions: value.exclusions
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    };
  }

  private buildForm(offer: Offer | null) {
    const existing = new Map((offer?.guarantees ?? []).map((g) => [g.code, g]));
    return new FormGroup({
      quoteNumber: new FormControl(offer?.quoteNumber ?? '', { nonNullable: true }),
      premiumAnnual: new FormControl<number | null>(offer?.premiumAnnual ?? null),
      premiumMonthly: new FormControl<number | null>(offer?.premiumMonthly ?? null),
      generalDeductible: new FormControl<number | null>(
        offer?.deductibles?.[GENERAL_DEDUCTIBLE] ?? null,
      ),
      guarantees: new FormArray<GuaranteeRow>(
        this.data.guarantees.map(
          (g) =>
            new FormGroup({
              included: new FormControl(existing.get(g.code)?.included ?? false, {
                nonNullable: true,
              }),
              limit: new FormControl<number | null>(existing.get(g.code)?.limit ?? null),
              deductible: new FormControl<number | null>(existing.get(g.code)?.deductible ?? null),
            }),
        ),
      ),
      exclusions: new FormControl((offer?.exclusions ?? []).join('\n'), { nonNullable: true }),
    });
  }
}
