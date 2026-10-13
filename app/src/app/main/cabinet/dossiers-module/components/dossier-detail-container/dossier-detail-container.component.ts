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
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { DossierStatus, PROPOSAL_DOSSIER_STATUSES } from '@shared';
import { HasUnsavedChanges } from '../../../../../core/routing/guards/unsaved-changes.guard';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../assures-module/util/assures.utils';
import { DossierStore } from '../../store/dossier.store';
import { ComparisonTabComponent } from '../comparison-tab/comparison-tab.component';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';
import { DocumentImportContainerComponent } from '../document-import/document-import-container.component';
import { DossierTimelineComponent } from '../dossier-timeline/dossier-timeline.component';
import { NeedFormComponent } from '../need-form/need-form.component';
import { PricingTabComponent } from '../pricing-tab/pricing-tab.component';
import { ProposalTabComponent } from '../proposal-tab/proposal-tab.component';
import {
  AnswerChange,
  QuestionnaireFormComponent,
} from '../questionnaire-form/questionnaire-form.component';
import { StatusChipComponent } from '../status-chip/status-chip.component';

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
    ComparisonTabComponent,
    DocumentImportContainerComponent,
    DossierTimelineComponent,
    NeedFormComponent,
    PricingTabComponent,
    ProposalTabComponent,
    QuestionnaireFormComponent,
    StatusChipComponent,
  ],
  template: `
    <a mat-button [routerLink]="backUrl()" class="back"
      ><mat-icon>arrow_back</mat-icon>{{ structure.back }}</a
    >

    @if (store.dossier(); as dossier) {
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

        <ol class="pipeline" [class.halted]="isHalted(dossier.status)" aria-label="Étapes du dossier">
          @for (stage of stages; track stage.key; let i = $index) {
            <li
              class="step"
              [class.done]="stageState(stage.key) === 'done'"
              [class.current]="stageState(stage.key) === 'current'"
              [class.selected]="selected() === stage.key"
            >
              <button
                type="button"
                class="step-button"
                [disabled]="!stageEnabled(stage.key)"
                [attr.aria-current]="selected() === stage.key ? 'step' : null"
                (click)="selected.set(stage.key)"
              >
                <span class="dot" aria-hidden="true">
                  @if (stageState(stage.key) === 'done') {
                    <mat-icon>check</mat-icon>
                  } @else {
                    {{ i + 1 }}
                  }
                </span>
                <span class="step-label">{{ stage.label }}</span>
              </button>
            </li>
          }
        </ol>

        <div class="toolbar">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="assignee">
            <mat-label>{{ structure.assignedTo }}</mat-label>
            <mat-select [value]="dossier.assignedTo" (selectionChange)="store.assign($event.value)">
              @for (member of store.activeMembers(); track member.id) {
                <mat-option [value]="member.id">{{
                  member.displayName || member.email
                }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <span class="spacer"></span>

          <button
            mat-button
            type="button"
            [class.active]="selected() === 'history'"
            (click)="selected.set(selected() === 'history' ? currentStage() : 'history')"
          >
            <mat-icon>history</mat-icon>{{ structure.tabs.history }}
          </button>

          @if (dossier.status === 'brouillon') {
            <a mat-stroked-button [routerLink]="[listUrl, dossier.id, 'brouillon']">{{
              structure.resume
            }}</a>
          }
        </div>
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
              @if (store.missing().length && store.editable()) {
                <p class="warning" role="status">
                  {{ structure.missingBanner }}
                  {{ missingLabels() }}
                </p>
              }
              @if (!store.editable()) {
                <p class="hint">{{ structure.readonlyNote }}</p>
              }
              <app-document-import-container class="documents" [editable]="store.editable()" />
              <app-questionnaire-form
                [sections]="store.schema()"
                [data]="store.answers()"
                [readonly]="!store.editable()"
                [showMissing]="true"
                (answerChanged)="onAnswer($event)"
              />
              @if (store.editable()) {
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

    .pipeline {
      display: flex;
      gap: 0;
      margin: 0 0 18px;
      padding: 4px 0 6px;
      list-style: none;
      overflow-x: auto;
      scrollbar-width: thin;
    }

    .step-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 0 4px 8px;
      border: 0;
      border-bottom: 2px solid transparent;
      font: inherit;
      background: none;
      cursor: pointer;

      &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      &:not(:disabled):hover .step-label {
        color: var(--ci-navy-900);
      }
    }

    .step.selected .step-button {
      border-bottom-color: var(--ci-navy-900);
    }

    .step.selected .step-label {
      font-weight: 600;
      color: var(--ci-navy-900);
    }

    .active {
      background: var(--ci-navy-50);
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

    .step {
      position: relative;
      display: flex;
      flex: 1 0 88px;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;

      &:not(:first-child)::before {
        content: '';
        position: absolute;
        top: 13px;
        right: 50%;
        width: 100%;
        height: 2px;
        background: var(--ci-border);
        z-index: 0;
      }

      &.done:not(:first-child)::before,
      &.current:not(:first-child)::before {
        background: var(--ci-navy-900);
      }
    }

    .dot {
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-size: 12px;
      font-weight: 600;
      color: var(--ci-text-muted);
      background: var(--ci-surface);
      border: 2px solid var(--ci-border);

      mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
    }

    .step.done .dot {
      color: #fff;
      border-color: var(--ci-navy-900);
      background: var(--ci-navy-900);
    }

    .step.current .dot {
      color: var(--ci-navy-900);
      border-color: var(--ci-navy-900);
      background: var(--ci-navy-50);
    }

    .step-label {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.25;
      color: var(--ci-text-muted);
    }

    .step.current .step-label {
      font-weight: 600;
    }

    .pipeline.halted {
      opacity: 0.6;
      filter: grayscale(1);
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }

    .assignee {
      width: 240px;
      max-width: 100%;
    }

    .spacer {
      flex: 1;
    }

    .secondary {
      --mat-button-filled-container-color: var(--ci-navy-100);
      --mat-button-filled-label-text-color: var(--ci-navy-900);
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
      color: #7a3e00;
      background: var(--ci-warning-soft);
    }

    .error {
      border-left: 3px solid var(--ci-danger);
      color: #8a1621;
      background: var(--ci-danger-soft);
    }

    @media (max-width: 600px) {
      .card {
        padding: 18px 16px;
      }

      .panel {
        padding: 4px 8px 12px;
      }

      h1 {
        font-size: 22px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDetailContainerComponent implements OnInit, HasUnsavedChanges {
  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(DossierStore);
  private readonly _snackBar = inject(MatSnackBar);
  protected readonly structure = DOSSIERS_STRUCTURE.detail;
  protected readonly listUrl = CabinetRouteContainerModel.DOSSIERS_ROUTE.url;

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
    return status === 'refuse';
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
    ].includes(this.store.dossier()?.status ?? ''),
  );

  /** La proposition s'ouvre dès qu'une offre est retenue (sans suite : seulement si une décision existe). */
  protected readonly proposalEnabled = computed(() => {
    const dossier = this.store.dossier();
    return !!dossier && PROPOSAL_DOSSIER_STATUSES.includes(dossier.status) && !!dossier.decision;
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
