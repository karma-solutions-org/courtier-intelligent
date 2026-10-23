import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { Dossier } from '@shared';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { HasUnsavedChanges } from '../../../../../core/routing/guards/unsaved-changes.guard';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../assures-module/util/assures.utils';
import { DossierActionsStore } from '../../store/dossier-actions.store';
import { DossierStore } from '../../store/dossier.store';
import { currentStageOf, isHaltedStatus, pipelineOf, Stage } from '../../util/dossier-stages.utils';
import { ComparisonTabComponent } from '../comparison-tab/comparison-tab.component';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';
import { DocumentImportContainerComponent } from '../document-import/document-import-container.component';
import { DossierPipelineComponent } from '../dossier-pipeline/dossier-pipeline.component';
import { DossierTimelineComponent } from '../dossier-timeline/dossier-timeline.component';
import { DossierToolbarComponent } from '../dossier-toolbar/dossier-toolbar.component';
import { NeedFormComponent } from '../need-form/need-form.component';
import { PricingTabComponent } from '../pricing-tab/pricing-tab.component';
import { ProposalTabComponent } from '../proposal-tab/proposal-tab.component';
import { AnswerChange, QuestionnaireFormComponent } from '../questionnaire-form/questionnaire-form.component';
import { SansSuiteDialogComponent, SansSuiteDialogData } from '../sans-suite-dialog/sans-suite-dialog.component';
import { StatusChipComponent } from '../status-chip/status-chip.component';

/** Détail d'un dossier : en-tête (statut, courtier en charge, actions) et une seule navigation par étapes. */
@Component({
  selector: 'app-dossier-detail-container',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    ComparisonTabComponent,
    DocumentImportContainerComponent,
    DossierPipelineComponent,
    DossierTimelineComponent,
    DossierToolbarComponent,
    NeedFormComponent,
    PricingTabComponent,
    ProposalTabComponent,
    QuestionnaireFormComponent,
    StatusChipComponent,
  ],
  providers: [DossierActionsStore],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <a mat-button [routerLink]="backUrl()" class="back"
      ><mat-icon>arrow_back</mat-icon>{{ structure.back }}</a
    >

    @if (store.dossier(); as dossier) {
      @if (dossier.deletedAt) {
        <p class="trashed" role="status">
          <mat-icon aria-hidden="true">delete</mat-icon>
          Ce dossier est dans la corbeille. Un administrateur peut le restaurer depuis la page Corbeille.
        </p>
      }
      @if (dossier.status === 'sans_suite') {
        <p class="trashed" role="status">
          <mat-icon aria-hidden="true">block</mat-icon>
          Dossier classé sans suite{{ dossier.outcome?.motif ? ' : ' + dossier.outcome?.motif : '.' }}
        </p>
      }
      <header class="card header" [attr.data-status]="dossier.status">
        <div class="title">
          <span class="title-icon" aria-hidden="true"><mat-icon>folder_open</mat-icon></span>
          <h1>{{ dossier.reference }}</h1>
          <app-status-chip [status]="dossier.status" />
        </div>
        <p class="sub">
          {{ store.assure() ? nameOf(store.assure()!) : '—' }} ·
          {{ store.product()?.name ?? dossier.productId }} ·
          {{ dossier.createdAt?.toMillis() | date: 'd MMM y' }}
        </p>

        <app-dossier-pipeline
          [steps]="pipeline()"
          [selected]="selected()"
          [halted]="isHalted(dossier.status)"
          (stageSelected)="selected.set($event)"
        />

        <app-dossier-toolbar
          [dossier]="dossier"
          [members]="store.activeMembers()"
          [listUrl]="listUrl"
          [isAdmin]="isAdmin()"
          [historyOpen]="selected() === 'history'"
          [closing]="actions.closing()"
          [deleting]="actions.deleting()"
          [confirmingDelete]="actions.confirmingDelete()"
          (assigned)="store.assign($event)"
          (historyToggled)="toggleHistory()"
          (closeRequested)="classerSansSuite(dossier)"
          (deleteAsked)="actions.askDelete()"
          (deleteCancelled)="actions.cancelDelete()"
          (deleteConfirmed)="actions.remove({ dossierId: dossier.id, backUrl: backUrl() })"
        />
        @if (dossier.status === 'brouillon' && !store.isComplete() && store.schema().length) {
          <p class="hint">{{ structure.incompleteHint }}</p>
        }
      </header>

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }
      <section class="panel">
        @switch (selected()) {
          @case ('infos') {
            <div class="tab">
              @if (store.missing().length && store.answersEditable()) {
                <p class="warning" role="status">
                  {{ structure.missingBanner }}
                  {{ missingLabels() }}
                </p>
              }
              @if (!store.answersEditable()) {
                <p class="hint">{{ structure.readonlyNote }}</p>
              } @else if (store.editingDuringPricing()) {
                <p class="hint" role="status">{{ structure.pricingEditNote }}</p>
              }
              <app-document-import-container class="documents" [editable]="store.answersEditable()" />
              <app-questionnaire-form
                [sections]="store.schema()"
                [data]="store.answers()"
                [readonly]="!store.answersEditable()"
                [showMissing]="true"
                (answerChanged)="onAnswer($event)"
              />
              @if (store.answersEditable()) {
                <div class="actions">
                  <button
                    mat-flat-button
                    type="button"
                    [disabled]="store.saveStatus() !== 'dirty' && store.saveStatus() !== 'error'"
                    (click)="store.saveNow({ event: true })"
                  >
                    {{ structure.save }}
                  </button>
                </div>
              }
            </div>
          }
          @case ('need') {
            <div class="tab">
              <app-need-form
                [need]="store.need()"
                [guarantees]="store.guarantees()"
                [suggestion]="store.needSuggestion()"
                [status]="dossier.status"
                [readonly]="!store.needEditable()"
                [isPending]="store.needPending() > 0"
                (saved)="store.saveNeed($event)"
                (validated)="store.validateNeed()"
              />
            </div>
          }
          @case ('pricing') {
            <div class="tab"><app-pricing-tab /></div>
          }
          @case ('comparison') {
            <div class="tab"><app-comparison-tab /></div>
          }
          @case ('proposal') {
            <div class="tab"><app-proposal-tab /></div>
          }
          @case ('history') {
            <div class="tab history">
              <!-- Le titre « Historique » est celui de la carte de la frise : ici seulement la fermeture. -->
              <button
                mat-icon-button
                type="button"
                class="close"
                [attr.aria-label]="structure.closeHistory"
                (click)="selected.set(currentStage())"
              >
                <mat-icon>close</mat-icon>
              </button>
              <app-dossier-timeline
                [events]="store.events()"
                [memberNames]="store.memberNames()"
                [insurerNames]="store.insurerNames()"
                [hasMore]="store.eventsHasMore()"
                [loadingMore]="store.eventsLoadingMore()"
                (loadMore)="store.loadMoreEvents()"
              />
            </div>
          }
        }
      </section>
    } @else if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    } @else if (store.loaded()) {
      <p>{{ structure.notFound }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 18px;
      min-width: 0;
    }

    .back {
      justify-self: start;
    }

    .card {
      min-width: 0;
      padding: 22px 24px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    .header {
      position: relative;
      overflow: hidden;
    }

    .title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }

    .title-icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      color: var(--ci-navy-900);
      background: var(--ci-navy-50);
    }

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .sub {
      margin: 8px 0 16px;
      color: var(--ci-text-muted);
      font-weight: 500;
    }

    .history {
      position: relative;

      .close {
        position: absolute;
        top: 28px;
        right: 12px;
        z-index: 1;
      }
    }

    .trashed {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 0;
      padding: 12px 16px;
      border: 1px solid var(--ci-danger, #c62828);
      border-radius: 8px;
      color: var(--ci-danger, #c62828);
    }

    .hint {
      margin: 12px 0 0;
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .panel {
      min-width: 0;
      padding: 4px 16px 16px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    .tab {
      display: grid;
      gap: 16px;
      min-width: 0;
      padding-top: 20px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
    }

    .warning,
    .error {
      margin: 0;
      padding: 12px 14px;
      border-radius: 8px;
    }

    .warning {
      border-left: 3px solid var(--ci-warning);
      color: var(--ci-warning);
      background: var(--ci-warning-soft);
    }

    .error {
      border-left: 3px solid var(--ci-danger);
      color: var(--ci-danger);
      background: var(--ci-danger-soft);
    }

    @media (max-width: 600px) {
      .card {
        padding: 18px 16px;
      }

      .panel {
        padding: 4px 8px 12px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDetailContainerComponent implements OnInit, HasUnsavedChanges {
  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(DossierStore);
  protected readonly actions = inject(DossierActionsStore);
  private readonly _snackBar = inject(MatSnackBar);
  private readonly _dialog = inject(MatDialog);
  private readonly _auth = inject(AuthStore);
  protected readonly structure = DOSSIERS_STRUCTURE.detail;
  protected readonly listUrl = CabinetRouteContainerModel.DOSSIERS_ROUTE.url;
  protected readonly isAdmin = computed(() => this._auth.role() === 'admin');
  protected readonly nameOf = displayName;
  protected readonly isHalted = isHaltedStatus;

  /** Étape où se trouve le dossier, d'après son statut (sans suite : la dernière étape atteinte). */
  protected readonly currentStage = computed<Stage>(() => currentStageOf(this.store.dossier()));
  protected readonly pipeline = computed(() => pipelineOf(this.store.dossier()));
  /** Étape affichée (ou l'historique) : suit l'avancement du dossier, le courtier peut revenir sur une étape passée. */
  protected readonly selected = signal<Stage | 'history'>('infos');

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

  /** Le dossier se gère depuis l'espace de son client. */
  protected backUrl(): string {
    const assureId = this.store.dossier()?.assureId;
    return assureId ? CabinetRouteContainerModel.clientUrl(assureId) : CabinetRouteContainerModel.CLIENTS_ROUTE.url;
  }

  protected toggleHistory(): void {
    this.selected.set(this.selected() === 'history' ? this.currentStage() : 'history');
  }

  /** Demande le motif, puis classe le dossier sans suite. */
  protected async classerSansSuite(dossier: Dossier): Promise<void> {
    const dialog = this._dialog.open<SansSuiteDialogComponent, SansSuiteDialogData, string>(SansSuiteDialogComponent, {
      data: { reference: dossier.reference },
    });
    const motif = await firstValueFrom(dialog.afterClosed());
    if (motif) this.actions.classerSansSuite({ dossierId: dossier.id, motif });
  }

  /** Garde de sortie de route : des modifications ne sont pas enregistrées. */
  hasUnsavedChanges(): boolean {
    return this.store.hasPendingEdits();
  }

  /** Fermeture ou rechargement de l'onglet pendant une saisie ou un enregistrement. */
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.hasPendingEdits() || this.store.saveStatus() === 'saving') {
      event.preventDefault();
    }
  }

  protected onAnswer({ path, value }: AnswerChange): void {
    this.store.edit(path, value);
  }
}
