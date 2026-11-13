import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DossierOutcomeResult } from '@shared';
import { openConfirmDialog } from '../../../../../../core/components/confirm-dialog/util/confirm-dialog.util';
import { DossierStore } from '../../../store/dossier.store';
import { ProposalStore } from '../../../store/proposal.store';
import {
  SubscriptionDialogPresentationComponent,
  SubscriptionDialogResult,
} from '../../subscription-dialog/subscription-dialog-presentation/subscription-dialog-presentation.component';
import { ProposalTabPresentationComponent } from '../proposal-tab-presentation/proposal-tab-presentation.component';
import { PROPOSAL_STRUCTURE } from '../proposal-tab.structure';

/** Onglet Proposition : résumé de l'offre retenue, envoi (et renvoi) à l'assuré, puis sa réponse. */
@Component({
  selector: 'app-proposal-tab-container',
  imports: [ProposalTabPresentationComponent],
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
  protected readonly dossier = this.dossierStore.dossier;

  protected readonly insurerName = computed(() => {
    const insurerId = this.dossier()?.decision?.insurerId ?? '';
    return this.dossierStore.insurerNames().get(insurerId) ?? insurerId;
  });
  protected readonly canSend = computed(() =>
    ['decision', 'proposition_envoyee'].includes(this.dossier()?.status ?? ''),
  );

  /** Destinataire proposé : le dernier utilisé, sinon l'email de l'assuré (modifiable dans l'onglet). */
  protected readonly defaultRecipient = computed(
    () => this.dossier()?.proposal?.sentTo ?? this.dossierStore.assure()?.email ?? '',
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
