import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanonicalData, questionsOf } from '@shared';
import { ExtensionStore } from '../../../../commons/extension-module/store/extension.store';
import { DossierStore } from '../../store/dossier.store';
import { ManualOfferSubmission, PricingCard, PricingStore } from '../../store/pricing.store';
import { ManualOfferDialogComponent, ManualOfferDialogData } from '../manual-offer-dialog/manual-offer-dialog.component';
import { QuoteCardComponent } from '../quote-card/quote-card.component';

const TEXT = {
  needNotValidated: 'Validez le besoin du client (onglet Besoin) pour lancer les tarifications.',
  noExtension: 'Extension Chrome non détectée : installez-la et connectez-vous pour remplir les extranets automatiquement. La saisie manuelle reste possible.',
  noInsurer: 'Aucun assureur ne tarifie ce produit pour votre cabinet. Un administrateur peut en activer dans Paramètres.',
} as const;

/** Onglet Tarification : une carte par assureur, avec le statut de son job en temps réel. */
@Component({
  selector: 'app-pricing-tab',
  imports: [MatIconModule, QuoteCardComponent],
  providers: [PricingStore],
  template: `
    @if (!store.canPrice()) {
      <p class="banner" role="status"><mat-icon>lock</mat-icon>{{ text.needNotValidated }}</p>
    } @else if (extensionMissing()) {
      <p class="banner" role="status"><mat-icon>extension_off</mat-icon>{{ text.noExtension }}</p>
    }
    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }

    @if (store.cards().length) {
      <div class="cards">
        @for (card of store.cards(); track card.insurer.id) {
          <app-quote-card
            [card]="card"
            [canPrice]="store.canPrice()"
            [busy]="store.busy().includes(card.insurer.id)"
            [schemaQuestions]="questions()"
            [answers]="dossierStore.answers()"
            (launch)="launch(card)"
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
      border-radius: 10px;
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
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingTabComponent {
  protected readonly store = inject(PricingStore);
  protected readonly dossierStore = inject(DossierStore);
  protected readonly extension = inject(ExtensionStore);
  private readonly _dialog = inject(MatDialog);
  private readonly _snackBar = inject(MatSnackBar);

  protected readonly text = TEXT;
  protected readonly questions = computed(() => questionsOf(this.dossierStore.schema()));
  protected readonly extensionMissing = computed(() => ['absent', 'unsupported'].includes(this.extension.status() ?? ''));

  constructor() {
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 4000 });
        this.store.clearMessages();
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

  protected openManualEntry(card: PricingCard): void {
    this._dialog
      .open<ManualOfferDialogComponent, ManualOfferDialogData, ManualOfferSubmission>(ManualOfferDialogComponent, {
        data: { insurerName: card.insurer.name, guarantees: this.dossierStore.guarantees(), offer: card.offer },
        width: '760px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(submission => {
        if (submission) {
          this.store.saveManualOffer(card.insurer.id, submission);
        }
      });
  }
}
