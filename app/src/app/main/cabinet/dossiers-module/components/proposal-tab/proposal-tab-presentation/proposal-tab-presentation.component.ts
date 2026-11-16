import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Dossier, DossierOutcomeResult, Offer, OfferSnapshot, PROPOSAL_MESSAGE_MAX } from '@shared';
import { PROPOSAL_STRUCTURE } from '../proposal-tab.structure';

/** Onglet Proposition : résumé de l'offre retenue, formulaire d'envoi (et de renvoi), puis la réponse de l'assuré. */
@Component({
  selector: 'app-proposal-tab-presentation',
  imports: [CurrencyPipe, DatePipe, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './proposal-tab-presentation.component.html',
  styleUrl: './proposal-tab-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposalTabPresentationComponent {
  readonly dossier = input<Dossier | null>(null);
  readonly insurerName = input('');
  /** Offre retenue (copie figée de la proposition ou de la décision, à défaut l'offre actuelle). */
  readonly chosenOffer = input<Offer | OfferSnapshot | null>(null);
  /** L'offre retenue est à refaire (données du dossier modifiées depuis sa capture). */
  readonly chosenOfferStale = input(false);
  readonly canSend = input(false);
  /** Destinataire proposé : le dernier utilisé, sinon l'email de l'assuré. */
  readonly defaultRecipient = input('');
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly sendRequested = output<{ to: string; message: string }>();
  readonly answerRequested = output<Exclude<DossierOutcomeResult, 'souscrit'>>();
  readonly subscriptionRequested = output<void>();

  protected readonly text = PROPOSAL_STRUCTURE;
  protected readonly messageMax = PROPOSAL_MESSAGE_MAX;

  /** Destinataire modifiable, réinitialisé quand le destinataire proposé change. */
  protected readonly recipient = linkedSignal(() => this.defaultRecipient());
  protected readonly message = signal('');
  protected readonly recipientValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.recipient().trim()));

  protected readonly deductibles = computed(() =>
    Object.entries(this.chosenOffer()?.deductibles ?? {}).map(([label, amount]) => ({
      label: label === 'general' ? this.text.generalDeductible : label,
      amount,
    })),
  );
  protected readonly includedGuarantees = computed(() => (this.chosenOffer()?.guarantees ?? []).filter((g) => g.included));

  protected send(): void {
    this.sendRequested.emit({ to: this.recipient().trim(), message: this.message().trim() });
  }
}
