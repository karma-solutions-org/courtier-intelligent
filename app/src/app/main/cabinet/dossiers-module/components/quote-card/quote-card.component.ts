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
  QUOTE_JOB_STATUS_LABELS,
  Question,
} from '@shared';
import { PRICING_CANCELLED_TEXT, PricingCard } from '../../store/pricing.store';
import { MissingFieldsFormComponent } from '../missing-fields-form/missing-fields-form.component';

const TEXT = {
  notStarted: 'Non lancée',
  manual: 'Saisie manuelle',
  price: 'Tarifer',
  retry: 'Relancer',
  openExtranet: "Ouvrir l'extranet",
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
  templateUrl: './quote-card.component.html',
  styleUrl: './quote-card.component.scss',
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

  protected readonly text = TEXT;

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
    if (offer) return QUOTE_JOB_STATUS_LABELS.captured;
    return job ? QUOTE_JOB_STATUS_LABELS[job.status] : TEXT.notStarted;
  });

  /** Couleur du statut : en cours, action du courtier attendue, obtenu, échec. */
  protected readonly tone = computed(() => {
    const { job, offer } = this.card();
    if (offer?.stale) return 'action';
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
