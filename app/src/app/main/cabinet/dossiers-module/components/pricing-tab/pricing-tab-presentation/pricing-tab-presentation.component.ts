import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CanonicalData, Question } from '@shared';
import { PricingCard, PricingSummary } from '../../../store/pricing.store';
import { QuoteCardPresentationComponent } from '../../quote-card/quote-card-presentation/quote-card-presentation.component';
import { PRICING_TAB_STRUCTURE } from '../pricing-tab.structure';

/** Onglet Tarification : bandeaux d'état, puis une carte par assureur avec le statut de son job. */
@Component({
  selector: 'app-pricing-tab-presentation',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, QuoteCardPresentationComponent],
  templateUrl: './pricing-tab-presentation.component.html',
  styleUrl: './pricing-tab-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingTabPresentationComponent {
  /** Le dossier peut être tarifé (couverture validée, pas encore décidé). */
  readonly canPrice = input(false);
  /** La couverture n'est pas encore validée : la tarification attend. */
  readonly awaitingCoverage = input(false);
  readonly extensionMissing = input(false);
  readonly error = input<string | null>(null);
  readonly loaded = input(false);
  readonly cards = input<PricingCard[]>([]);
  /** Assureurs dont une action est en cours. */
  readonly busyIds = input<string[]>([]);
  readonly questions = input<Question[]>([]);
  readonly answers = input<CanonicalData>({});
  /** Le cabinet a des assureurs actifs (sinon : message d'aide). */
  readonly hasInsurers = input(false);
  /** Dossier en tarification avec des assureurs proposés pas encore choisis : « Ajouter un assureur ». */
  readonly canAddInsurer = input(false);
  /** Ajout d'assureurs en cours : le bouton reste grisé. */
  readonly addingInsurer = input(false);
  /** Assureurs que « Tarifer sur tous les extranets » lancerait (0 : bouton masqué). */
  readonly launchableCount = input(0);
  readonly launchingAll = input(false);
  /** Avancement tous assureurs confondus (null : rien de lancé). */
  readonly summary = input<PricingSummary | null>(null);

  readonly launch = output<PricingCard>();
  readonly cancel = output<PricingCard>();
  readonly openExtranet = output<PricingCard>();
  readonly answered = output<{ card: PricingCard; answers: CanonicalData }>();
  /** Saisie (ou correction) de l'offre à la main. */
  readonly manualEntry = output<PricingCard>();
  /** Validation du tarif lu par l'extension. */
  readonly validate = output<PricingCard>();
  readonly addInsurer = output<void>();
  readonly launchAll = output<void>();

  protected readonly text = PRICING_TAB_STRUCTURE;

  /** Le bouton « Tarifer sur tous les extranets » : à partir de 2 assureurs à lancer, extension présente. */
  protected readonly showLaunchAll = computed(
    () => this.canPrice() && !this.extensionMissing() && this.launchableCount() >= 2,
  );

  /** Détail de l'avancement : seulement les compteurs non nuls. */
  protected readonly summaryDetails = computed(() => {
    const summary = this.summary();
    if (!summary) return [];
    const text = PRICING_TAB_STRUCTURE.launchAll;
    return [
      summary.toReview ? text.toReview(summary.toReview) : null,
      summary.inProgress ? text.inProgress(summary.inProgress) : null,
      summary.needsAction ? text.needsAction(summary.needsAction) : null,
      summary.failed ? text.failed(summary.failed) : null,
    ].filter((detail): detail is string => !!detail);
  });
}
