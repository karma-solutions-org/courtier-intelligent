import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanonicalData, questionsOf } from '@shared';
import { openConfirmDialog } from '../../../../../../core/components/confirm-dialog/util/confirm-dialog.util';
import { ExtensionStore } from '../../../../../commons/extension-module/store/extension.store';
import { AddInsurersInput, DossierStore } from '../../../store/dossier.store';
import {
  AddInsurerDialogData,
  AddInsurerDialogPresentationComponent,
} from '../../add-insurer-dialog/add-insurer-dialog-presentation/add-insurer-dialog-presentation.component';
import { ManualOfferSubmission, PricingCard, PricingStore } from '../../../store/pricing.store';
import {
  ManualOfferDialogData,
  ManualOfferDialogPresentationComponent,
} from '../../manual-offer-dialog/manual-offer-dialog-presentation/manual-offer-dialog-presentation.component';
import { PricingTabPresentationComponent } from '../pricing-tab-presentation/pricing-tab-presentation.component';

/** Onglet Tarification : une carte par assureur, avec le statut de son job en temps réel. */
@Component({
  selector: 'app-pricing-tab-container',
  imports: [PricingTabPresentationComponent],
  providers: [PricingStore],
  templateUrl: './pricing-tab-container.component.html',
  styleUrl: './pricing-tab-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingTabContainerComponent {
  protected readonly store = inject(PricingStore);
  protected readonly dossierStore = inject(DossierStore);
  protected readonly extension = inject(ExtensionStore);
  private readonly _snackBar = inject(MatSnackBar);
  private readonly _dialog = inject(MatDialog);

  /** Annuler une tarification en cours arrête l'extension : confirmation d'abord. */
  protected async cancel(card: PricingCard): Promise<void> {
    const confirmed = await firstValueFrom(openConfirmDialog(this._dialog, {
      title: 'Annuler la tarification',
      message: `Arrêter la tarification en cours chez ${card.insurer.name} ? Vous pourrez la relancer.`,
      confirm: 'Annuler la tarification',
      cancel: 'Continuer',
      destructive: true,
    }));
    if (confirmed) this.store.cancel(card.insurer.id);
  }

  protected readonly questions = computed(() => questionsOf(this.dossierStore.schema()));
  /** La couverture n'est pas encore validée : la tarification attend. */
  protected readonly awaitingCoverage = computed(() =>
    ['brouillon', 'complet'].includes(this.dossierStore.dossier()?.status ?? ''),
  );
  /** Pendant la tarification, un assureur proposé pour le produit mais pas encore choisi peut être ajouté. */
  protected readonly canAddInsurer = computed(
    () => this.dossierStore.dossier()?.status === 'tarification' && this.dossierStore.addableInsurers().length > 0,
  );
  protected readonly extensionMissing = computed(() =>
    ['absent', 'unsupported'].includes(this.extension.status() ?? ''),
  );

  constructor() {
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 4000 });
        this.store.clearSuccess();
      }
    });
  }

  /** L'onglet de l'extranet s'ouvre au clic (sinon bloqué) ; il est dirigé vers l'extranet une fois le job écrit. */
  protected launch(card: PricingCard): void {
    const target = window.open('about:blank', '_blank');
    if (target) {
      target.opener = null;
    }
    this.store.launch(card.insurer.id, target);
  }

  protected openExtranet(card: PricingCard): void {
    window.open(card.insurer.extranetUrl, '_blank', 'noopener');
  }

  protected complete(card: PricingCard, answers: CanonicalData): void {
    this.store.complete(card.insurer.id, answers);
  }

  /** Saisie (ou correction) de l'offre à la main : l'offre est enregistrée à la fermeture du dialogue. */
  protected async openManualEntry(card: PricingCard): Promise<void> {
    const dialog = this._dialog.open<ManualOfferDialogPresentationComponent, ManualOfferDialogData, ManualOfferSubmission>(
      ManualOfferDialogPresentationComponent,
      {
        data: { insurerName: card.insurer.name, guarantees: this.dossierStore.guarantees(), offer: card.offer },
        width: '720px',
        maxWidth: '95vw',
      },
    );
    const submission = await firstValueFrom(dialog.afterClosed());
    if (submission) this.store.saveManualOffer(card.insurer.id, submission);
  }

  /** « Ajouter un assureur » : choix des assureurs et réponses demandées, enregistrés ensemble à la fermeture. */
  protected async openAddInsurer(): Promise<void> {
    const dossier = this.dossierStore.dossier();
    const product = this.dossierStore.product();
    if (!dossier) return;
    const insurers = this.dossierStore.insurers();
    const currentInsurerIds = this.dossierStore.chosenInsurerIds();
    const dialog = this._dialog.open<AddInsurerDialogPresentationComponent, AddInsurerDialogData, AddInsurersInput>(
      AddInsurerDialogPresentationComponent,
      {
        data: {
          candidates: this.dossierStore.addableInsurers(),
          currentInsurerIds,
          currentInsurers: insurers.filter((insurer) => currentInsurerIds.includes(insurer.id)),
          frozenSchema: this.dossierStore.frozenSchema(),
          productSchema: product?.questionnaireSchema ?? [],
          productId: dossier.productId,
          learned: product?.insurerQuestions ?? {},
          answers: this.dossierStore.answers(),
        },
        width: '640px',
        maxWidth: '95vw',
      },
    );
    const result = await firstValueFrom(dialog.afterClosed());
    if (result) this.dossierStore.addInsurers(result);
  }
}
