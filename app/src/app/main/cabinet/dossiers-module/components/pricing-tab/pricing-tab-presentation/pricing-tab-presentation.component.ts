import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CanonicalData, Question } from '@shared';
import { PricingCard } from '../../../store/pricing.store';
import { QuoteCardPresentationComponent } from '../../quote-card/quote-card-presentation/quote-card-presentation.component';
import { PRICING_TAB_STRUCTURE } from '../pricing-tab.structure';

/** Onglet Tarification : bandeaux d'état, puis une carte par assureur avec le statut de son job. */
@Component({
  selector: 'app-pricing-tab-presentation',
  imports: [MatButtonModule, MatIconModule, QuoteCardPresentationComponent],
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

  readonly launch = output<PricingCard>();
  readonly cancel = output<PricingCard>();
  readonly openExtranet = output<PricingCard>();
  readonly answered = output<{ card: PricingCard; answers: CanonicalData }>();
  /** Saisie (ou correction) de l'offre à la main. */
  readonly manualEntry = output<PricingCard>();
  /** Validation du tarif lu par l'extension. */
  readonly validate = output<PricingCard>();
  readonly addInsurer = output<void>();

  protected readonly text = PRICING_TAB_STRUCTURE;
}
