import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DossierOutcomeResult, PROPOSAL_MESSAGE_MAX } from '@shared';
import { DossierStore } from '../../store/dossier.store';
import { ProposalStore } from '../../store/proposal.store';
import { SubscriptionDialogComponent, SubscriptionDialogResult } from '../subscription-dialog/subscription-dialog.component';
import { PROPOSAL_STRUCTURE } from './proposal-tab.structure';

/** Onglet Proposition : résumé de l'offre retenue, envoi (et renvoi) à l'assuré, puis sa réponse. */
@Component({
  selector: 'app-proposal-tab',
  imports: [CurrencyPipe, DatePipe, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  providers: [ProposalStore],
  template: `
    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }

    @if (dossier(); as dossier) {
      <section class="card">
        <h2>{{ text.offerTitle }} : {{ insurerName() }}</h2>
        @if (store.chosenOffer(); as offer) {
          <dl>
            @if (offer.premiumAnnual !== null) {
              <dt>{{ text.premiumAnnual }}</dt>
              <dd>{{ offer.premiumAnnual | currency: 'EUR' : 'symbol' : '1.0-2' }}</dd>
            }
            @if (offer.premiumMonthly !== null) {
              <dt>{{ text.premiumMonthly }}</dt>
              <dd>{{ offer.premiumMonthly | currency: 'EUR' : 'symbol' : '1.0-2' }}</dd>
            }
            @for (entry of deductibles(); track entry.label) {
              <dt>{{ entry.label }}</dt>
              <dd>{{ entry.amount | currency: 'EUR' : 'symbol' : '1.0-2' }}</dd>
            }
          </dl>
          @if (includedGuarantees().length) {
            <h3>{{ text.guarantees }}</h3>
            <ul>
              @for (guarantee of includedGuarantees(); track $index) {
                <li>
                  {{ guarantee.label }}
                  @if (guarantee.limit !== null) {
                    <span class="muted">({{ text.limit }} {{ guarantee.limit | currency: 'EUR' : 'symbol' : '1.0-0' }})</span>
                  }
                </li>
              }
            </ul>
          }
        } @else {
          <p class="muted">{{ text.noOffer }}</p>
        }
        @if (dossier.decision?.justification) {
          <h3>{{ text.justification }}</h3>
          <p class="justification">{{ dossier.decision?.justification }}</p>
        }
      </section>

      @if (dossier.proposal; as proposal) {
        <p class="sent" role="status">
          <mat-icon>mark_email_read</mat-icon>
          <span>
            <strong>{{ text.sent }}</strong> {{ text.sentOn }} {{ proposal.sentAt?.toMillis() | date: 'd MMM y, HH:mm' }}
            {{ text.sentTo }} {{ proposal.sentTo }} · {{ text.reminders }} : {{ proposal.reminders ?? 0 }}
            @if (proposal.lastReminderAt) {
              ({{ text.lastReminder }} {{ proposal.lastReminderAt.toMillis() | date: 'd MMM y' }})
            }
          </span>
        </p>
      }

      @if (canSend()) {
        <section class="card form">
          <h2>{{ text.sendTitle }}</h2>
          <mat-form-field appearance="outline">
            <mat-label>{{ text.recipient }}</mat-label>
            <input matInput type="email" [ngModel]="recipient()" (ngModelChange)="recipient.set($event)" />
            <mat-hint>{{ text.recipientHint }}</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ text.message }}</mat-label>
            <textarea matInput rows="4" [maxlength]="messageMax" [ngModel]="message()" (ngModelChange)="message.set($event)"></textarea>
          </mat-form-field>
          <div class="actions">
            <button mat-flat-button type="button" [disabled]="store.busy() || !recipientValid()" (click)="send()">
              {{ dossier.status === 'proposition_envoyee' ? text.resend : text.send }}
            </button>
          </div>
        </section>
      }

      @if (dossier.status === 'proposition_envoyee') {
        <section class="card">
          <h2>{{ text.answerTitle }}</h2>
          <div class="actions start">
            <button mat-flat-button type="button" [disabled]="store.busy()" (click)="subscribe()">{{ text.subscribed }}</button>
            <button mat-stroked-button type="button" [disabled]="store.busy()" (click)="answer('refuse')">{{ text.refused }}</button>
            <button mat-stroked-button type="button" [disabled]="store.busy()" (click)="answer('sans_suite')">{{ text.noFollowUp }}</button>
          </div>
        </section>
      }

      @if (dossier.outcome; as outcome) {
        <section class="card outcome" role="status">
          <h2>{{ text.outcome[outcome.result] }}</h2>
          @if (outcome.contractNumber) {
            <p>{{ text.contractNumber }} : <strong>{{ outcome.contractNumber }}</strong></p>
          }
          @if (outcome.effectiveDate) {
            <p>{{ text.effectiveDate }} : <strong>{{ outcome.effectiveDate | date: 'd MMM y' }}</strong></p>
          }
          @if (outcome.decidedAt) {
            <p class="muted">{{ text.decidedOn }} {{ outcome.decidedAt.toMillis() | date: 'd MMM y, HH:mm' }}</p>
          }
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 16px;
      min-width: 0;
    }

    .card {
      padding: 20px 24px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
    }

    .form {
      display: grid;
      gap: 8px;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 17px;
      font-weight: 600;
    }

    h3 {
      margin: 16px 0 8px;
      font-size: 14px;
      font-weight: 600;
    }

    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 16px;
      margin: 0;
    }

    dt {
      color: var(--mat-sys-on-surface-variant);
    }

    dd {
      margin: 0;
      font-weight: 500;
    }

    ul {
      margin: 0;
      padding-left: 20px;
    }

    .justification {
      margin: 0;
      white-space: pre-line;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 12px;
    }

    .actions.start {
      justify-content: flex-start;
    }

    .sent,
    .error {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 12px 14px;
      border-radius: 10px;
    }

    .sent {
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);
    }

    .outcome p {
      margin: 4px 0;
    }

    .error {
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposalTabComponent {
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
  protected readonly includedGuarantees = computed(() => (this.store.chosenOffer()?.guarantees ?? []).filter(g => g.included));
  protected readonly canSend = computed(() => ['decision', 'proposition_envoyee'].includes(this.dossier()?.status ?? ''));

  /** Destinataire : le dernier utilisé, sinon l'email de l'assuré (modifiable). */
  protected readonly recipient = linkedSignal(() => this.dossier()?.proposal?.sentTo ?? this.dossierStore.assure()?.email ?? '');
  protected readonly message = signal('');
  protected readonly recipientValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.recipient().trim()));

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
    if (confirm(result === 'refuse' ? this.text.confirmRefused : this.text.confirmNoFollowUp)) {
      this.store.recordAnswer({ result });
    }
  }

  protected subscribe(): void {
    this._dialog
      .open<SubscriptionDialogComponent, void, SubscriptionDialogResult>(SubscriptionDialogComponent, { maxWidth: '95vw' })
      .afterClosed()
      .subscribe(result => {
        if (result) {
          this.store.recordAnswer({ result: 'souscrit', ...result });
        }
      });
  }
}
