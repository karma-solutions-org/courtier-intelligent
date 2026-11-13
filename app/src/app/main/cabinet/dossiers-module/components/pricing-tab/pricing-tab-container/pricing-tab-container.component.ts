import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanonicalData, questionsOf } from '@shared';
import { openConfirmDialog } from '../../../../../../core/components/confirm-dialog/util/confirm-dialog.util';
import { ExtensionStore } from '../../../../../commons/extension-module/store/extension.store';
import { DossierStore } from '../../../store/dossier.store';
import { PricingCard, PricingStore } from '../../../store/pricing.store';
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
  protected cancel(card: PricingCard): void {
    openConfirmDialog(this._dialog, {
      title: 'Annuler la tarification',
      message: `Arrêter la tarification en cours chez ${card.insurer.name} ? Vous pourrez la relancer.`,
      confirm: 'Annuler la tarification',
      cancel: 'Continuer',
      destructive: true,
    }).subscribe((confirmed) => {
      if (confirmed) this.store.cancel(card.insurer.id);
    });
  }

  protected readonly questions = computed(() => questionsOf(this.dossierStore.schema()));
  /** La couverture n'est pas encore validée : la tarification attend. */
  protected readonly awaitingCoverage = computed(() =>
    ['brouillon', 'complet'].includes(this.dossierStore.dossier()?.status ?? ''),
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
}
