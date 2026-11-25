import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import {
  Assure,
  CanonicalData,
  CanonicalPath,
  Dossier,
  DossierEvent,
  DossierStatus,
  Guarantee,
  Member,
  NeedAnalysis,
  NeedInput,
  NeedSuggestion,
  Product,
  QuestionnaireSection,
} from '@shared';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../../assures-module/util/assures.utils';
import { SaveStatus } from '../../../store/dossier.store';
import {
  canCloseStatus,
  DOSSIER_STAGES,
  DossierDetailView,
  DossierStage,
  isHaltedStatus,
  stageEnabledFor,
  stageStateFor,
} from '../../../util/dossier-stages.utils';
import { ComparisonTabContainerComponent } from '../../comparison-tab/comparison-tab-container/comparison-tab-container.component';
import { DocumentImportContainerComponent } from '../../document-import/document-import-container/document-import-container.component';
import { DossierTimelinePresentationComponent } from '../../dossier-timeline/dossier-timeline-presentation/dossier-timeline-presentation.component';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';
import { NeedFormPresentationComponent } from '../../need-form/need-form-presentation/need-form-presentation.component';
import { PricingTabContainerComponent } from '../../pricing-tab/pricing-tab-container/pricing-tab-container.component';
import { ProposalTabContainerComponent } from '../../proposal-tab/proposal-tab-container/proposal-tab-container.component';
import {
  AnswerChange,
  QuestionnaireFormPresentationComponent,
} from '../../questionnaire-form/questionnaire-form-presentation/questionnaire-form-presentation.component';
import { StatusChipPresentationComponent } from '../../status-chip/status-chip-presentation/status-chip-presentation.component';

/**
 * Détail d'un dossier : en-tête (statut, courtier en charge, actions), frise des étapes et espace de l'étape choisie.
 * Les onglets Tarification, Comparatif et Proposition, et l'import de documents, restent des containers autonomes
 * (créés seulement quand leur étape est affichée).
 */
@Component({
  selector: 'app-dossier-detail-presentation',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    StatusChipPresentationComponent,
    QuestionnaireFormPresentationComponent,
    NeedFormPresentationComponent,
    DossierTimelinePresentationComponent,
    DocumentImportContainerComponent,
    PricingTabContainerComponent,
    ComparisonTabContainerComponent,
    ProposalTabContainerComponent,
  ],
  templateUrl: './dossier-detail-presentation.component.html',
  styleUrl: './dossier-detail-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDetailPresentationComponent {
  readonly dossier = input<Dossier | null>(null);
  readonly assure = input<Assure | null>(null);
  readonly product = input<Product | null>(null);
  readonly error = input<string | null>(null);
  readonly loaded = input(false);
  /** Retour : l'espace du client du dossier. */
  readonly backUrl = input('');

  /** Vue affichée (une étape ou l'historique) et étape où se trouve le dossier. */
  readonly selected = input<DossierDetailView>('infos');
  readonly currentStage = input<DossierStage>('infos');

  readonly activeMembers = input<Member[]>([]);
  readonly isAdmin = input(false);
  readonly confirmingDelete = input(false);
  readonly deleting = input(false);
  readonly closing = input(false);

  readonly schema = input<QuestionnaireSection[]>([]);
  readonly answers = input<CanonicalData>({});
  /** Réponses reprises du dossier précédent encore à vérifier. */
  readonly toVerify = input<CanonicalPath[]>([]);
  readonly missing = input<CanonicalPath[]>([]);
  readonly missingLabels = input('');
  readonly isComplete = input(false);
  /** Réponses modifiables (avant la tarification, et pendant). */
  readonly answersEditable = input(false);
  /** Modification pendant la tarification : les tarifs déjà obtenus deviendront périmés. */
  readonly editingDuringPricing = input(false);
  readonly saveStatus = input<SaveStatus>('idle');

  readonly need = input<NeedAnalysis | null>(null);
  readonly guarantees = input<Guarantee[]>([]);
  readonly needSuggestion = input<NeedSuggestion | null>(null);
  readonly needEditable = input(false);
  readonly needPending = input(0);

  readonly events = input<DossierEvent[]>([]);
  readonly memberNames = input<Map<string, string>>(new Map());
  readonly insurerNames = input<Map<string, string>>(new Map());
  readonly eventsHasMore = input(false);
  readonly eventsLoadingMore = input(false);

  readonly selectedChanged = output<DossierDetailView>();
  readonly assignRequested = output<string>();
  readonly closeRequested = output<{ id: string; reference: string | null }>();
  readonly confirmingDeleteChanged = output<boolean>();
  readonly removeRequested = output<string>();
  readonly answerChanged = output<AnswerChange>();
  readonly answerVerified = output<CanonicalPath>();
  readonly saveRequested = output<void>();
  readonly needSaved = output<NeedInput>();
  readonly needValidated = output<void>();
  readonly loadMoreEvents = output<void>();

  protected readonly structure = DOSSIERS_STRUCTURE.detail;
  protected readonly listUrl = CabinetRouteContainerModel.DOSSIERS_ROUTE.url;
  protected readonly stages = DOSSIER_STAGES;
  protected readonly nameOf = displayName;

  protected stageEnabled(stage: DossierStage): boolean {
    return stageEnabledFor(stage, this.dossier());
  }

  protected stageState(stage: DossierStage): 'done' | 'current' | 'todo' {
    return stageStateFor(stage, this.dossier());
  }

  protected isHalted(status: DossierStatus): boolean {
    return isHaltedStatus(status);
  }

  protected canClose(status: DossierStatus): boolean {
    return canCloseStatus(status);
  }
}
