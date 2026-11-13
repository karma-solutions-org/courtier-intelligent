import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DossierOutcomeResult, PROPOSAL_MESSAGE_MAX } from '@shared';
import { openConfirmDialog } from '../../../../../../core/components/confirm-dialog/util/confirm-dialog.util';
import { DossierStore } from '../../../store/dossier.store';
import { ProposalStore } from '../../../store/proposal.store';
import {
  SubscriptionDialogPresentationComponent,
  SubscriptionDialogResult,
} from '../../subscription-dialog/subscription-dialog-presentation/subscription-dialog-presentation.component';
import { PROPOSAL_STRUCTURE } from '../proposal-tab.structure';

/** Onglet Proposition : résumé de l'offre retenue, envoi (et renvoi) à l'assuré, puis sa réponse. */
@Component({
  selector: 'app-proposal-tab',
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  providers: [ProposalStore],
  templateUrl: './proposal-tab-container.component.html',
  styleUrl: './proposal-tab-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposalTabContainerComponent {
  protected readonly store = inject(ProposalStore);
  protected readonly dossierStore = inject(DossierStore);
  private readonly _dialog = inject(MatDialog);
  private readonly _snackBar = inject(MatSnackBar);

  protected readonly text = PROPOSAL_STRUCTURE;
  protected readonly messageMax = PROPOSAL_MESSAGE_MAX;
  protected readonly dossier = this.dossierStore.dossier;

  protected readonly insurerName = computed(() => {
    const insurerId = this.dossier()?.decision?.insurerId ?? '';
    return this.dossierStore.insurerNames().get(insurerId) ?? insurerId;
  });
  protected readonly deductibles = computed(() =>
    Object.entries(this.store.chosenOffer()?.deductibles ?? {}).map(([label, amount]) => ({
      label: label === 'general' ? this.text.generalDeductible : label,
      amount,
    })),
  );
  protected readonly includedGuarantees = computed(() =>
    (this.store.chosenOffer()?.guarantees ?? []).filter((g) => g.included),
  );
  protected readonly canSend = computed(() =>
    ['decision', 'proposition_envoyee'].includes(this.dossier()?.status ?? ''),
  );

  /** Destinataire : le dernier utilisé, sinon l'email de l'assuré (modifiable). */
  protected readonly recipient = linkedSignal(
    () => this.dossier()?.proposal?.sentTo ?? this.dossierStore.assure()?.email ?? '',
  );
  protected readonly message = signal('');
  protected readonly recipientValid = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.recipient().trim()),
  );

  constructor() {
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 4000 });
        this.store.clearMessages();
      }
    });
  }

  protected send(): void {
    this.store.send({ to: this.recipient().trim(), message: this.message().trim() });
  }

  protected answer(result: Exclude<DossierOutcomeResult, 'souscrit'>): void {
    const refused = result === 'refuse';
    openConfirmDialog(this._dialog, {
      title: refused ? this.text.refusedTitle : this.text.noFollowUpTitle,
      message: refused ? this.text.confirmRefused : this.text.confirmNoFollowUp,
      confirm: this.text.confirmAnswer,
      destructive: true,
    }).subscribe((confirmed) => {
      if (confirmed) this.store.recordAnswer({ result });
    });
  }

  protected subscribe(): void {
    this._dialog
      .open<SubscriptionDialogPresentationComponent, void, SubscriptionDialogResult>(
        SubscriptionDialogPresentationComponent,
        { maxWidth: '95vw' },
      )
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          this.store.recordAnswer({ result: 'souscrit', ...result });
        }
      });
  }
}
