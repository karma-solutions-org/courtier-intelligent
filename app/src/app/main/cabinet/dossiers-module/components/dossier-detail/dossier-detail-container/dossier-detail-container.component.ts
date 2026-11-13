import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { DossierStatus, PROPOSAL_DOSSIER_STATUSES, TERMINAL_DOSSIER_STATUSES } from '@shared';
import { toBackendErrorMessage } from '../../../../../../core/utils/backend-error.utils';
import { AuthStore } from '../../../../../commons/authentication-module/store/auth.store';
import { DossiersService } from '../../../services/dossiers.service';
import { HasUnsavedChanges } from '../../../../../../core/routing/guards/unsaved-changes.guard';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../../assures-module/util/assures.utils';
import { DossierStore } from '../../../store/dossier.store';
import { ComparisonTabContainerComponent } from '../../comparison-tab/comparison-tab-container/comparison-tab-container.component';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';
import { DocumentImportContainerComponent } from '../../document-import/document-import-container/document-import-container.component';
import { DossierTimelinePresentationComponent } from '../../dossier-timeline/dossier-timeline-presentation/dossier-timeline-presentation.component';
import { NeedFormPresentationComponent } from '../../need-form/need-form-presentation/need-form-presentation.component';
import { PricingTabContainerComponent } from '../../pricing-tab/pricing-tab-container/pricing-tab-container.component';
import { ProposalTabContainerComponent } from '../../proposal-tab/proposal-tab-container/proposal-tab-container.component';
import {
  AnswerChange,
  QuestionnaireFormPresentationComponent,
} from '../../questionnaire-form/questionnaire-form-presentation/questionnaire-form-presentation.component';
import { SansSuiteDialogPresentationComponent, SansSuiteDialogData } from '../../sans-suite-dialog/sans-suite-dialog-presentation/sans-suite-dialog-presentation.component';
import { StatusChipPresentationComponent } from '../../status-chip/status-chip-presentation/status-chip-presentation.component';

type Stage = 'infos' | 'need' | 'pricing' | 'comparison' | 'proposal';

/** Étape de travail correspondant à chaque statut : c'est elle qui s'ouvre à l'arrivée sur le dossier. */
const STAGE_OF_STATUS: Record<DossierStatus, Stage> = {
  brouillon: 'infos',
  complet: 'need',
  besoin_valide: 'pricing',
  tarification: 'pricing',
  comparaison: 'comparison',
  decision: 'proposal',
  proposition_envoyee: 'proposal',
  souscrit: 'proposal',
  refuse: 'proposal',
  // Sans suite : l'étape réellement atteinte se déduit du dossier (voir currentStage).
  sans_suite: 'infos',
};

/** Détail d'un dossier : en-tête (statut, courtier en charge, actions) et une seule navigation par étapes. */
@Component({
  selector: 'app-dossier-detail-container',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    ComparisonTabContainerComponent,
    DocumentImportContainerComponent,
    DossierTimelinePresentationComponent,
    NeedFormPresentationComponent,
    PricingTabContainerComponent,
    ProposalTabContainerComponent,
    QuestionnaireFormPresentationComponent,
    StatusChipPresentationComponent,
  ],
  templateUrl: './dossier-detail-container.component.html',
  styleUrl: './dossier-detail-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDetailContainerComponent implements OnInit, HasUnsavedChanges {
  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(DossierStore);
  private readonly _snackBar = inject(MatSnackBar);
  protected readonly structure = DOSSIERS_STRUCTURE.detail;
  protected readonly listUrl = CabinetRouteContainerModel.DOSSIERS_ROUTE.url;
  private readonly _router = inject(Router);
  private readonly _dossiers = inject(DossiersService);
  private readonly _auth = inject(AuthStore);
  protected readonly isAdmin = computed(() => this._auth.role() === 'admin');
  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly closing = signal(false);
  private readonly _dialog = inject(MatDialog);

  /** Un dossier se classe sans suite à toute étape, tant qu'il n'est pas clos. */
  protected canClose(status: DossierStatus): boolean {
    return !TERMINAL_DOSSIER_STATUSES.includes(status);
  }

  /** Demande le motif, puis classe le dossier sans suite (les tarifications en cours sont annulées par le serveur). */
  protected classerSansSuite(dossierId: string, reference: string | null): void {
    this._dialog
      .open<SansSuiteDialogPresentationComponent, SansSuiteDialogData, string>(SansSuiteDialogPresentationComponent, { data: { reference } })
      .afterClosed()
      .subscribe((motif) => {
        if (!motif) return;
        this.closing.set(true);
        this._dossiers.classerSansSuite(dossierId, motif).subscribe({
          next: ({ cancelledJobs }) => {
            this.closing.set(false);
            const jobs = cancelledJobs ? ` ${cancelledJobs} tarification(s) annulée(s).` : '';
            this._snackBar.open(`Dossier classé sans suite.${jobs}`, undefined, { duration: 4000 });
          },
          error: (error) => {
            this.closing.set(false);
            this._snackBar.open(toBackendErrorMessage(error), undefined, { duration: 5000 });
          },
        });
      });
  }

  /** Met le dossier dans la corbeille, puis revient à l'espace du client. */
  protected remove(dossierId: string): void {
    const back = this.backUrl();
    this.deleting.set(true);
    this._dossiers.remove(dossierId).subscribe({
      next: () => {
        this._snackBar.open('Dossier placé dans la corbeille.', undefined, { duration: 3000 });
        this._router.navigateByUrl(back);
      },
      error: (error) => {
        this.deleting.set(false);
        this.confirmingDelete.set(false);
        this._snackBar.open(toBackendErrorMessage(error), undefined, { duration: 5000 });
      },
    });
  }

  /** Le dossier se gère depuis l'espace de son client. */
  protected backUrl(): string {
    const assureId = this.store.dossier()?.assureId;
    return assureId ? CabinetRouteContainerModel.clientUrl(assureId) : CabinetRouteContainerModel.CLIENTS_ROUTE.url;
  }
  protected readonly nameOf = displayName;
  /** Les étapes du dossier : chacune ouvre son espace de travail (une seule navigation). */
  protected readonly stages: { key: Stage; label: string }[] = [
    { key: 'infos', label: 'Informations' },
    { key: 'need', label: 'Couverture' },
    { key: 'pricing', label: 'Tarification' },
    { key: 'comparison', label: 'Comparatif' },
    { key: 'proposal', label: 'Proposition' },
  ];

  /** Étape où se trouve le dossier, d'après son statut (sans suite : la dernière étape atteinte). */
  protected readonly currentStage = computed<Stage>(() => {
    const status = this.store.dossier()?.status;
    if (!status) return 'infos';
    if (status === 'sans_suite') {
      const dossier = this.store.dossier()!;
      if (dossier.decision || dossier.proposal) return 'proposal';
      if (dossier.needAnalysis?.validatedAt) return 'pricing';
      return dossier.completeness?.ok ? 'need' : 'infos';
    }
    return STAGE_OF_STATUS[status];
  });

  /** Étape affichée (ou l'historique) : suit l'avancement du dossier, le courtier peut revenir sur une étape passée. */
  protected readonly selected = signal<Stage | 'history'>('infos');

  protected stageEnabled(stage: Stage): boolean {
    const status = this.store.dossier()?.status;
    switch (stage) {
      case 'infos':
        return true;
      case 'need':
        return !!status && status !== 'brouillon';
      case 'pricing':
        return !!status && status !== 'brouillon' && status !== 'complet';
      case 'comparison':
        return this.comparisonEnabled();
      case 'proposal':
        return this.proposalEnabled();
    }
  }

  protected stageState(stage: Stage): 'done' | 'current' | 'todo' {
    if (this.store.dossier()?.status === 'souscrit') return 'done';
    const order = this.stages.findIndex((s) => s.key === stage);
    const current = this.stages.findIndex((s) => s.key === this.currentStage());
    return order < current ? 'done' : order === current ? 'current' : 'todo';
  }

  protected isHalted(status: DossierStatus): boolean {
    return status === 'refuse' || status === 'sans_suite';
  }

  /** Le comparatif s'ouvre dès la tarification (les offres arrivent au fil de l'eau). */
  protected readonly comparisonEnabled = computed(() =>
    [
      'tarification',
      'comparaison',
      'decision',
      'proposition_envoyee',
      'souscrit',
      'refuse',
    ].includes(this.store.dossier()?.status ?? '') ||
      (this.store.dossier()?.status === 'sans_suite' && !!this.store.dossier()?.needAnalysis?.validatedAt),
  );

  /** La proposition s'ouvre dès qu'une offre est retenue (sans suite : seulement si une décision existe). */
  protected readonly proposalEnabled = computed(() => {
    const dossier = this.store.dossier();
    return (
      !!dossier &&
      (PROPOSAL_DOSSIER_STATUSES.includes(dossier.status) || dossier.status === 'sans_suite') &&
      !!dossier.decision
    );
  });

  protected readonly missingLabels = computed(() =>
    this.store
      .missing()
      .map((path) => this.store.labels().get(path) ?? 'Champ sans libellé')
      .join(', '),
  );

  constructor() {
    effect(() => this.store.select(this.id()));
    effect(() => this.selected.set(this.currentStage()));
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 3000 });
        this.store.clearSuccess();
      }
    });
  }

  ngOnInit(): void {
    // Sur la fiche, les modifications sont enregistrées avec le bouton (et tracées dans l'historique), pas à la frappe.
    this.store.setAutosave(false);
    this.store.clearMessages();
  }

  /** Garde de sortie de route : des modifications ne sont pas enregistrées. */
  hasUnsavedChanges(): boolean {
    return this.store.hasPendingEdits();
  }

  /** Fermeture ou rechargement de l'onglet pendant une saisie ou un enregistrement. */
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.hasPendingEdits() || this.store.saveStatus() === 'saving') {
      event.preventDefault();
    }
  }

  protected onAnswer({ path, value }: AnswerChange): void {
    this.store.edit(path, value);
  }

}
