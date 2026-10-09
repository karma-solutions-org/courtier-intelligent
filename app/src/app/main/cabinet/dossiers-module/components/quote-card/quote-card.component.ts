import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ACTIVE_QUOTE_JOB_STATUSES, canLaunchQuoteJob, CanonicalData, QUOTE_JOB_STATUS_LABELS, Question } from '@shared';
import { PricingCard } from '../../store/pricing.store';
import { MissingFieldsFormComponent } from '../missing-fields-form/missing-fields-form.component';

const TEXT = {
  notStarted: 'Non lancée',
  manual: 'Saisie manuelle',
  price: 'Tarifer',
  retry: 'Relancer',
  openExtranet: 'Ouvrir l’extranet',
  manualEntry: 'Saisir l’offre',
  editOffer: 'Corriger l’offre',
  requested: 'Ouvrez l’extranet de l’assureur : l’extension prend le relais.',
  resuming: 'Informations enregistrées : l’extension reprend le remplissage.',
  awaitingSubmit: 'Formulaire rempli : vérifiez-le et validez-le vous-même sur l’extranet.',
  failed: 'La tarification a échoué.',
  attempt: 'tentative',
  step: 'Étape',
  of: 'sur',
  quoteNumber: 'Devis',
  perYear: '/ an',
  perMonth: '/ mois',
} as const;

/** Carte d'un assureur dans l'onglet Tarification : statut du job en temps réel, actions et offre obtenue. */
@Component({
  selector: 'app-quote-card',
  imports: [CurrencyPipe, MatButtonModule, MatIconModule, MatProgressBarModule, MissingFieldsFormComponent],
  template: `
    @let job = card().job;
    @let offer = card().offer;
    <article class="card" [attr.aria-label]="card().insurer.name">
      <header>
        <h3>{{ card().insurer.name }}</h3>
        <span class="status" [class]="tone()">{{ statusLabel() }}</span>
      </header>

      @if (job && job.attempts > 1) {
        <p class="meta">{{ job.attempts }}e {{ text.attempt }}</p>
      }

      @if (offer) {
        <div class="offer">
          @if (offer.premiumAnnual !== null) {
            <strong>{{ offer.premiumAnnual | currency: 'EUR' : 'symbol' : '1.0-2' }} {{ text.perYear }}</strong>
          }
          @if (offer.premiumMonthly !== null) {
            <span>{{ offer.premiumMonthly | currency: 'EUR' : 'symbol' : '1.0-2' }} {{ text.perMonth }}</span>
          }
          @if (offer.quoteNumber) {
            <span class="meta">{{ text.quoteNumber }} {{ offer.quoteNumber }}</span>
          }
          @if (offer.source === 'manual') {
            <span class="badge">{{ text.manual }}</span>
          }
        </div>
      } @else if (job) {
        @switch (job.status) {
          @case ('requested') {
            <p class="hint">{{ text.requested }}</p>
          }
          @case ('needs_info') {
            @if (job.missingFields.length) {
              <app-missing-fields-form
                [fields]="job.missingFields"
                [schemaQuestions]="schemaQuestions()"
                [initial]="answers()"
                [busy]="busy()"
                (submitted)="answered.emit($event)"
              />
            } @else {
              <p class="hint">{{ text.resuming }}</p>
            }
          }
          @case ('awaiting_submit') {
            <p class="hint">{{ text.awaitingSubmit }}</p>
          }
          @case ('failed') {
            <p class="error" role="alert">{{ text.failed }} {{ job.error }}</p>
          }
        }
        @if (progress(); as progress) {
          <div class="steps">
            <span class="meta">{{ text.step }} {{ progress.current }} {{ text.of }} {{ progress.total }}</span>
            <mat-progress-bar mode="determinate" [value]="progress.percent" />
          </div>
        } @else if (job.status === 'analyzing' || job.status === 'filling') {
          <mat-progress-bar mode="indeterminate" />
        }
      }

      <footer>
        @if (!offer && canLaunch()) {
          <button mat-flat-button type="button" [disabled]="!canPrice() || busy()" (click)="launch.emit()">
            {{ job ? text.retry : text.price }}
          </button>
        }
        @if (active()) {
          <button mat-stroked-button type="button" (click)="openExtranet.emit()">
            <mat-icon>open_in_new</mat-icon>{{ text.openExtranet }}
          </button>
        }
        <button mat-button type="button" [disabled]="!canPrice() || busy()" (click)="manualEntry.emit()">
          {{ offer ? text.editOffer : text.manualEntry }}
        </button>
      </footer>
    </article>
  `,
  styles: `
    .card {
      display: grid;
      gap: 12px;
      align-content: start;
      padding: 20px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    h3 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
    }

    .status {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      color: var(--mat-sys-on-surface-variant);
      background: var(--mat-sys-surface-container);
    }

    .status.progress {
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);
    }

    .status.action {
      color: var(--mat-sys-on-tertiary-container);
      background: var(--mat-sys-tertiary-container);
    }

    .status.ok {
      color: #0b5d1e;
      background: #d7f5dd;
    }

    .status.ko {
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }

    .offer {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 14px;
    }

    .offer strong {
      font-size: 22px;
    }

    .badge {
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
      background: var(--mat-sys-surface-container);
    }

    .hint,
    .meta {
      margin: 0;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .steps {
      display: grid;
      gap: 6px;
    }

    .error {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }

    footer {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteCardComponent {
  readonly card = input.required<PricingCard>();
  /** Le besoin est validé : on peut tarifer. */
  readonly canPrice = input(false);
  readonly busy = input(false);
  /** Questions du produit et réponses du dossier : pour le formulaire des champs manquants. */
  readonly schemaQuestions = input<Question[]>([]);
  readonly answers = input<CanonicalData>({});

  readonly launch = output<void>();
  readonly openExtranet = output<void>();
  readonly answered = output<CanonicalData>();
  readonly manualEntry = output<void>();

  protected readonly text = TEXT;

  protected readonly canLaunch = computed(() => canLaunchQuoteJob(this.card().job));
  protected readonly active = computed(() => {
    const status = this.card().job?.status;
    return !!status && ACTIVE_QUOTE_JOB_STATUSES.includes(status) && !this.card().offer;
  });

  protected readonly statusLabel = computed(() => {
    const { job, offer } = this.card();
    if (offer) return QUOTE_JOB_STATUS_LABELS.captured;
    return job ? QUOTE_JOB_STATUS_LABELS[job.status] : TEXT.notStarted;
  });

  /** Couleur du statut : en cours, action du courtier attendue, obtenu, échec. */
  protected readonly tone = computed(() => {
    const { job, offer } = this.card();
    if (offer || job?.status === 'captured') return 'ok';
    switch (job?.status) {
      case 'failed':
        return 'ko';
      case 'needs_info':
      case 'awaiting_submit':
        return 'action';
      case 'requested':
      case 'analyzing':
      case 'filling':
        return 'progress';
      default:
        return '';
    }
  });

  protected readonly progress = computed(() => {
    const job = this.card().job;
    if (!job || job.status !== 'filling' || !job.currentStep || !job.totalSteps) return null;
    return { current: job.currentStep, total: job.totalSteps, percent: Math.round((job.currentStep / job.totalSteps) * 100) };
  });
}
