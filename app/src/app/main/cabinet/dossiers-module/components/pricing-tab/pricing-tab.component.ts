import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanonicalData, questionsOf } from '@shared';
import { openConfirmDialog } from '../../../../../core/components/confirm-dialog/confirm-dialog.component';
import { ExtensionStore } from '../../../../commons/extension-module/store/extension.store';
import { DossierStore } from '../../store/dossier.store';
import { ManualOfferSubmission, PricingCard, PricingStore } from '../../store/pricing.store';
import {
  ManualOfferDialogComponent,
  ManualOfferDialogData,
} from '../manual-offer-dialog/manual-offer-dialog.component';
import { QuoteCardComponent } from '../quote-card/quote-card.component';

const TEXT = {
  needNotValidated: 'Validez la couverture souhaitée (étape Couverture) pour lancer les tarifications.',
  closed: 'La tarification est terminée pour ce dossier : les offres reçues restent consultables.',
  noExtension:
    'Extension Chrome non détectée : installez-la et connectez-vous pour remplir les extranets automatiquement. La saisie manuelle reste possible.',
  loading: 'Chargement des tarifications…',
  noInsurer:
    'Aucun assureur ne tarifie ce produit pour votre cabinet. Un administrateur peut en activer dans Paramètres.',
} as const;

/** Onglet Tarification : une carte par assureur, avec le statut de son job en temps réel. */
@Component({
  selector: 'app-pricing-tab',
  imports: [MatIconModule, QuoteCardComponent],
  providers: [PricingStore],
  template: `
    @if (!store.canPrice()) {
      <!-- Avant la validation : ce qu'il reste à faire. Après (décision, proposition, sans suite…) : simple lecture. -->
      @if (awaitingCoverage()) {
        <p class="banner" role="status"><mat-icon>lock</mat-icon>{{ text.needNotValidated }}</p>
      } @else {
        <p class="banner" role="status"><mat-icon>info</mat-icon>{{ text.closed }}</p>
      }
    } @else if (extensionMissing()) {
      <p class="banner" role="status"><mat-icon>extension_off</mat-icon>{{ text.noExtension }}</p>
    }
    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }

    @if (!store.loaded() && !store.error()) {
      <p class="hint" role="status">{{ text.loading }}</p>
    } @else if (store.cards().length) {
      <div class="cards">
        @for (card of store.cards(); track card.insurer.id) {
          <app-quote-card
            [card]="card"
            [canPrice]="store.canPrice()"
            [busy]="store.busy().includes(card.insurer.id)"
            [schemaQuestions]="questions()"
            [answers]="dossierStore.answers()"
            (launch)="launch(card)"
            (cancel)="cancel(card)"
            (openExtranet)="openExtranet(card)"
            (answered)="complete(card, $event)"
            (manualEntry)="openManualEntry(card)"
          />
        }
      </div>
    } @else if (dossierStore.insurers().length) {
      <p class="hint">{{ text.noInsurer }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 16px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
      align-items: start;
    }

    .banner,
    .error {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 12px 14px;
      border-radius: 8px;
    }

    .banner {
      color: var(--mat-sys-on-tertiary-container);
      background: var(--mat-sys-tertiary-container);
    }

    .error {
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }

    .hint {
      margin: 0;
      color: var(--ci-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingTabComponent {
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

  protected readonly text = TEXT;
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

  /** Saisie (ou correction) de l'offre à la main : l'offre est enregistrée à la fermeture du dialogue. */
  protected openManualEntry(card: PricingCard): void {
    this._dialog
      .open<ManualOfferDialogComponent, ManualOfferDialogData, ManualOfferSubmission>(ManualOfferDialogComponent, {
        data: { insurerName: card.insurer.name, guarantees: this.dossierStore.guarantees(), offer: card.offer },
        width: '720px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((submission) => {
        if (submission) this.store.saveManualOffer(card.insurer.id, submission);
      });
  }
}
