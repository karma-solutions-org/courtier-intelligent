import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  ACTIVE_QUOTE_JOB_STATUSES,
  canLaunchQuoteJob,
  CanonicalData,
  isOfferToReview,
  QUOTE_JOB_STATUS_LABELS,
  Question,
} from '@shared';
import { PRICING_CANCELLED_TEXT, PricingCard } from '../../store/pricing.store';
import { MissingFieldsFormComponent } from '../missing-fields-form/missing-fields-form.component';

const TEXT = {
  notStarted: 'Non lancée',
  manual: 'Saisie manuelle',
  toReview: 'À vérifier',
  reviewHint:
    "Tarif lu automatiquement sur l'extranet : comparez-le au devis affiché par l'assureur, puis validez-le ou corrigez-le.",
  validate: 'Valider le tarif',
  correct: 'Corriger',
  price: 'Tarifer',
  retry: 'Relancer',
  openExtranet: "Ouvrir l'extranet",
  manualEntry: "Saisir l'offre",
  editOffer: "Corriger l'offre",
  requested: "Ouvrez l'extranet de l'assureur : l'extension prend le relais.",
  resuming: "Informations enregistrées : l'extension reprend le remplissage.",
  awaitingSubmit: "Formulaire rempli : vérifiez-le et validez-le vous-même sur l'extranet.",
  failed: 'La tarification a échoué.',
  cancelled: PRICING_CANCELLED_TEXT,
  cancel: 'Annuler la tarification',
  stale: 'Les informations du dossier ont changé depuis ce tarif : relancez la tarification pour une offre à jour.',
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
  imports: [
    CurrencyPipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MissingFieldsFormComponent,
  ],
  template: `
    @let job = card().job;
    @let offer = card().offer;
    <article class="card" [attr.data-tone]="tone()" [attr.aria-label]="card().insurer.name">
      <header>
        <h3>
          @if (card().insurer.logo; as logo) {
            <img class="insurer-logo" [src]="logo" alt="" loading="lazy" />
          } @else {
            <span class="insurer-mark" aria-hidden="true">{{ card().insurer.name.charAt(0) }}</span>
          }
          {{ card().insurer.name }}
        </h3>
        <span class="status" [class]="tone()">{{ statusLabel() }}</span>
      </header>

      @if (job && job.attempts > 1) {
        <p class="meta">{{ job.attempts }}e {{ text.attempt }}</p>
      }

      @if (offer) {
        <div class="offer">
          @if (offer.premiumAnnual !== null) {
            <strong
              >{{ offer.premiumAnnual | currency: 'EUR' : 'symbol' : '1.0-2' }}
              {{ text.perYear }}</strong
            >
          }
          @if (offer.premiumMonthly !== null) {
            <span
              >{{ offer.premiumMonthly | currency: 'EUR' : 'symbol' : '1.0-2' }}
              {{ text.perMonth }}</span
            >
          }
          @if (offer.quoteNumber) {
            <span class="meta">{{ text.quoteNumber }} {{ offer.quoteNumber }}</span>
          }
          @if (offer.source === 'manual') {
            <span class="badge">{{ text.manual }}</span>
          }
        </div>
        @if (toReview()) {
          <p class="hint">{{ text.reviewHint }}</p>
        }
        @if (offer.stale) {
          <p class="error" role="status">{{ text.stale }}</p>
        }
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
          @case ('cancelled') {
            <p class="hint">{{ text.cancelled }}</p>
          }
        }
        @if (progress(); as progress) {
          <div class="steps">
            <span class="meta"
              >{{ text.step }} {{ progress.current }} {{ text.of }} {{ progress.total }}</span
            >
            <mat-progress-bar mode="determinate" [value]="progress.percent" />
          </div>
        } @else if (job.status === 'analyzing' || job.status === 'filling') {
          <mat-progress-bar mode="indeterminate" />
        }
      }

      <footer>
        @if (canLaunch()) {
          <button
            mat-flat-button
            type="button"
            [disabled]="!canPrice() || busy()"
            (click)="launch.emit()"
          >
            @if (busy()) {
              <mat-progress-spinner class="busy" mode="indeterminate" diameter="16" aria-hidden="true" />
            }
            {{ job ? text.retry : text.price }}
          </button>
        }
        @if (active()) {
          <button mat-stroked-button type="button" (click)="openExtranet.emit()">
            <mat-icon>open_in_new</mat-icon>{{ text.openExtranet }}
          </button>
          <button mat-button type="button" [disabled]="busy()" [attr.aria-busy]="busy()" (click)="cancel.emit()">
            @if (busy()) {
              <mat-progress-spinner class="busy" mode="indeterminate" diameter="16" aria-hidden="true" />
            } @else {
              <mat-icon>cancel</mat-icon>
            }
            {{ text.cancel }}
          </button>
        }
        @if (toReview()) {
          <button mat-flat-button type="button" [disabled]="busy()" (click)="validate.emit()">
            <mat-icon>check</mat-icon>{{ text.validate }}
          </button>
        }
        <button mat-button type="button" [disabled]="!canPrice() || busy()" (click)="manualEntry.emit()">
          {{ toReview() ? text.correct : offer ? text.editOffer : text.manualEntry }}
        </button>
      </footer>
    </article>
  `,
  styles: `
    .busy {
      display: inline-block;
      margin-right: 6px;
      vertical-align: middle;
    }

    .card {
      display: grid;
      /* Un contenu large (groupe de boutons, libellé long) ne fait jamais déborder la carte de sa colonne. */
      min-width: 0;
      overflow-wrap: anywhere;
      gap: 12px;
      align-content: start;
      padding: 20px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    header {
      display: flex;
      flex-wrap: wrap;
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
      color: var(--ci-text-muted);
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
      color: var(--ci-success);
      background: var(--ci-success-soft);
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
      color: var(--ci-text-muted);
    }

    .steps {
      display: grid;
      gap: 6px;
    }

    .error {
      margin: 0;
      padding: 10px 12px;
      border-radius: 8px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }

    footer {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .card {
      position: relative;
      overflow: hidden;
      box-shadow: var(--ci-shadow-sm);
      transition: border-color 0.15s;

      &:hover {
        border-color: var(--border-strong);
      }
    }

    h3 {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
    }

    .insurer-mark {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      font-weight: 600;
      color: var(--ci-navy-900);
      background: var(--ci-navy-50);
    }

    .insurer-logo {
      flex-shrink: 0;
      width: 64px;
      height: 32px;
      border-radius: 8px;
      object-fit: contain;
      background: #fff;
    }

    .status {
      font-weight: 600;
    }

    .status.progress {
      color: var(--ci-info);
      background: var(--ci-info-soft);
    }

    .status.action {
      color: var(--ci-warning);
      background: var(--ci-warning-soft);
    }

    .status.ok {
      color: var(--ci-success);
      background: var(--ci-success-soft);
    }

    .status.ko {
      color: var(--ci-danger);
      background: var(--ci-danger-soft);
    }

    .offer strong {
      font-size: 24px;
      font-weight: 600;
      color: var(--ci-navy-900);
    }

    .badge {
      color: var(--ci-warning);
      background: var(--ci-warning-soft);
      font-weight: 600;
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
  /** Annule le job en cours (bloqué, extension fermée…). */
  readonly cancel = output<void>();
  readonly answered = output<CanonicalData>();
  /** Ouvre la saisie manuelle de l'offre (ou sa correction). */
  readonly manualEntry = output<void>();
  /** Valide le tarif lu par l'extension (« à vérifier »). */
  readonly validate = output<void>();

  protected readonly text = TEXT;
  protected readonly toReview = computed(() => isOfferToReview(this.card().offer));

  /** Pas encore lancée, échouée ou annulée ; ou tarif obtenu mais périmé (données du dossier modifiées depuis). */
  protected readonly canLaunch = computed(() => {
    const { job, offer } = this.card();
    if (offer) return !!offer.stale && (!job || !ACTIVE_QUOTE_JOB_STATUSES.includes(job.status));
    return canLaunchQuoteJob(job);
  });
  protected readonly active = computed(() => {
    const status = this.card().job?.status;
    return !!status && ACTIVE_QUOTE_JOB_STATUSES.includes(status) && (!this.card().offer || !!this.card().offer?.stale);
  });

  protected readonly statusLabel = computed(() => {
    const { job, offer } = this.card();
    if (isOfferToReview(offer)) return TEXT.toReview;
    if (offer) return QUOTE_JOB_STATUS_LABELS.captured;
    return job ? QUOTE_JOB_STATUS_LABELS[job.status] : TEXT.notStarted;
  });

  /** Couleur du statut : en cours, action du courtier attendue, obtenu, échec. */
  protected readonly tone = computed(() => {
    const { job, offer } = this.card();
    if (offer?.stale || isOfferToReview(offer)) return 'action';
    if (offer || job?.status === 'captured') return 'ok';
    switch (job?.status) {
      case 'failed':
        return 'ko';
      case 'cancelled':
        return '';
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
    return {
      current: job.currentStep,
      total: job.totalSteps,
      percent: Math.round((job.currentStep / job.totalSteps) * 100),
    };
  });
}
