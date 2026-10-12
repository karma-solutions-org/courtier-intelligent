import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, OnInit, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { DOSSIER_STATUS_LABELS, DossierStatus, PROPOSAL_DOSSIER_STATUSES } from '@shared';
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
import { AnswerChange, QuestionnaireFormComponent } from '../questionnaire-form/questionnaire-form.component';
import { StatusChipComponent } from '../status-chip/status-chip.component';

/** Détail d'un dossier : en-tête (statut, courtier en charge, actions) et onglets Infos (modifiable), Historique, Besoin et Tarification. */
@Component({
  selector: 'app-dossier-detail-container',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTabsModule,
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
    <a mat-button [routerLink]="listUrl" class="back"><mat-icon>arrow_back</mat-icon>{{ structure.back }}</a>

    @if (store.dossier(); as dossier) {
      <header class="card header" [attr.data-status]="dossier.status">
        <div class="title">
          <span class="title-icon" aria-hidden="true"><mat-icon>folder_open</mat-icon></span>
          <h1>{{ dossier.reference }}</h1>
          <app-status-chip [status]="dossier.status" />
        </div>
        <p class="sub">
          {{ store.assure() ? nameOf(store.assure()!) : '—' }} · {{ store.product()?.name ?? dossier.productId }} ·
          {{ dossier.createdAt?.toMillis() | date: 'd MMM y' }}
        </p>

        <ol class="pipeline" [class.halted]="isHalted(dossier.status)" aria-label="Progression du dossier">
          @for (step of pipeline; track step; let i = $index) {
            <li
              class="step"
              [attr.data-status]="step"
              [class.done]="stepIndex(dossier.status) > i"
              [class.current]="stepIndex(dossier.status) === i"
              [attr.aria-current]="stepIndex(dossier.status) === i ? 'step' : null"
            >
              <span class="dot" aria-hidden="true">
                @if (stepIndex(dossier.status) > i) {
                  <mat-icon>check</mat-icon>
                } @else {
                  {{ i + 1 }}
                }
              </span>
              <span class="step-label">{{ statusLabels[step] }}</span>
            </li>
          }
        </ol>

        <div class="toolbar">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="assignee">
            <mat-label>{{ structure.assignedTo }}</mat-label>
            <mat-select [value]="dossier.assignedTo" (selectionChange)="store.assign($event.value)">
              @for (member of store.activeMembers(); track member.id) {
                <mat-option [value]="member.id">{{ member.displayName || member.email }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <span class="spacer"></span>

          @if (dossier.status === 'brouillon') {
            <a mat-stroked-button [routerLink]="[listUrl, dossier.id, 'brouillon']">{{ structure.resume }}</a>
          }
          @for (target of store.transitions(); track target) {
            <button
              mat-flat-button
              type="button"
              [class.secondary]="target !== 'complet'"
              [disabled]="target === 'complet' && !store.isComplete()"
              (click)="changeStatus(target)"
            >
              {{ structure.statusActions[target] }}
            </button>
          }
        </div>
        @if (dossier.status === 'brouillon' && !store.isComplete() && store.schema().length) {
          <p class="hint">{{ structure.incompleteHint }}</p>
        }
      </header>

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }

      <mat-tab-group animationDuration="0ms">
        <mat-tab [label]="structure.tabs.infos">
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
        </mat-tab>
        <mat-tab [label]="structure.tabs.history">
          <div class="tab">
            <app-dossier-timeline [events]="store.events()" [memberNames]="store.memberNames()" [insurerNames]="store.insurerNames()" />
          </div>
        </mat-tab>
        <mat-tab [label]="structure.tabs.need" [disabled]="dossier.status === 'brouillon'">
          <div class="tab">
            <app-need-form
              [need]="store.need()"
              [guarantees]="store.guarantees()"
              [suggestion]="store.needSuggestion()"
              [status]="dossier.status"
              [readonly]="!store.needEditable()"
              (saved)="store.saveNeed($event)"
              (validated)="store.validateNeed()"
            />
          </div>
        </mat-tab>
        <mat-tab [label]="structure.tabs.pricing" [disabled]="dossier.status === 'brouillon' || dossier.status === 'complet'">
          <ng-template matTabContent>
            <div class="tab">
              <app-pricing-tab />
            </div>
          </ng-template>
        </mat-tab>
        <mat-tab [label]="structure.tabs.comparison" [disabled]="!comparisonEnabled()">
          <ng-template matTabContent>
            <div class="tab">
              <app-comparison-tab />
            </div>
          </ng-template>
        </mat-tab>
        <mat-tab [label]="structure.tabs.proposal" [disabled]="!proposalEnabled()">
          <ng-template matTabContent>
            <div class="tab">
              <app-proposal-tab />
            </div>
          </ng-template>
        </mat-tab>
      </mat-tab-group>
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
      color: var(--st-color);
      border-color: var(--st-color);
      background: var(--st-bg);
    }

    .step-label {
      font-size: 11.5px;
      font-weight: 500;
      line-height: 1.25;
      color: var(--ci-text-muted);
    }

    .step.current .step-label {
      font-weight: 600;
      color: var(--st-color);
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

    mat-tab-group {
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

      mat-tab-group {
        padding: 4px 8px 12px;
      }

      h1 {
        font-size: 22px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDetailContainerComponent implements OnInit {
  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(DossierStore);
  private readonly _snackBar = inject(MatSnackBar);
  protected readonly structure = DOSSIERS_STRUCTURE.detail;
  protected readonly listUrl = CabinetRouteContainerModel.DOSSIERS_ROUTE.url;
  protected readonly nameOf = displayName;
  protected readonly statusLabels = DOSSIER_STATUS_LABELS;
  /** Parcours nominal affiché dans l'en-tête (purement visuel). */
  protected readonly pipeline: DossierStatus[] = [
    'brouillon',
    'complet',
    'besoin_valide',
    'tarification',
    'comparaison',
    'decision',
    'proposition_envoyee',
    'souscrit',
  ];

  protected stepIndex(status: DossierStatus): number {
    return this.pipeline.indexOf(status);
  }

  protected isHalted(status: DossierStatus): boolean {
    return status === 'refuse' || status === 'sans_suite';
  }

  /** Le comparatif s'ouvre dès la tarification (les offres arrivent au fil de l'eau). */
  protected readonly comparisonEnabled = computed(() =>
    ['tarification', 'comparaison', 'decision', 'proposition_envoyee', 'souscrit', 'refuse'].includes(this.store.dossier()?.status ?? ''),
  );

  /** La proposition s'ouvre dès qu'une offre est retenue (sans suite : seulement si une décision existe). */
  protected readonly proposalEnabled = computed(() => {
    const dossier = this.store.dossier();
    return !!dossier && PROPOSAL_DOSSIER_STATUSES.includes(dossier.status) && !!dossier.decision;
  });

  protected readonly missingLabels = computed(() =>
    this.store
      .missing()
      .map(path => this.store.labels().get(path) ?? path)
      .join(', '),
  );

  constructor() {
    effect(() => this.store.select(this.id()));
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 3000 });
        this.store.clearMessages();
      }
    });
  }

  ngOnInit(): void {
    // Sur la fiche, les modifications sont enregistrées avec le bouton (et tracées dans l'historique), pas à la frappe.
    this.store.setAutosave(false);
    this.store.clearMessages();
  }

  protected onAnswer({ path, value }: AnswerChange): void {
    this.store.edit(path, value);
  }

  protected changeStatus(status: DossierStatus): void {
    if (status === 'sans_suite' && !confirm(this.structure.confirmSansSuite)) {
      return;
    }
    this.store.changeStatus(status);
  }
}
