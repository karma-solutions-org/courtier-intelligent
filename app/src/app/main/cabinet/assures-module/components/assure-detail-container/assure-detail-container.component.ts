import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { TabQueryParamDirective } from '../../../../../core/directives/tab-query-param.directive';
import { HasUnsavedChanges } from '../../../../../core/routing/guards/unsaved-changes.guard';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { AssureDocumentsStore } from '../../store/assure-documents.store';
import { AssuresStore } from '../../store/assures.store';
import { dossierStats } from '../../util/assure-detail.utils';
import { DuplicateCandidate } from '../../util/assures.utils';
import { AssureDetailsCardComponent } from '../assure-details-card/assure-details-card.component';
import { AssureDocumentsListComponent } from '../assure-documents-list/assure-documents-list.component';
import { AssureDossiersTableComponent } from '../assure-dossiers-table/assure-dossiers-table.component';
import { AssureFormComponent } from '../assure-form/assure-form.component';
import { AssureIdentityCardComponent } from '../assure-identity-card/assure-identity-card.component';
import { ASSURES_STRUCTURE } from '../assures.structure';

/**
 * Espace client : carte d'identité et actions à gauche (nouveau dossier, modifier, supprimer), onglets à droite
 * (informations en lecture, dossiers, pièces). La fiche ne se modifie que sur « Modifier la fiche ».
 */
@Component({
  selector: 'app-assure-detail-container',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    TabQueryParamDirective,
    AssureDetailsCardComponent,
    AssureDocumentsListComponent,
    AssureDossiersTableComponent,
    AssureFormComponent,
    AssureIdentityCardComponent,
  ],
  providers: [AssureDocumentsStore],
  template: `
    <a mat-button [routerLink]="listUrl" class="back">
      <mat-icon>arrow_back</mat-icon>
      {{ structure.back }}
    </a>

    @if (store.selected(); as assure) {
      <div class="layout">
        <app-assure-identity-card
          [assure]="assure"
          [dossierCount]="store.dossiers().length"
          [isAdmin]="isAdmin()"
          [editing]="editing()"
          [confirmingDelete]="confirmingDelete()"
          [isPending]="store.isPending()"
          [error]="store.error()"
          (editRequested)="startEdit()"
          (deleteAsked)="confirmingDelete.set(true)"
          (deleteCancelled)="confirmingDelete.set(false)"
          (deleteConfirmed)="store.remove(assure.id)"
        />

        <section class="main">
          <mat-tab-group appTabQueryParam animationDuration="0ms" mat-stretch-tabs="false">
            <mat-tab [label]="structure.infoTitle">
              <div class="tab">
                <div class="card stats">
                  <div class="stat">
                    <span class="label">{{ structure.stats.total }}</span>
                    <span class="value">{{ store.dossiers().length }}</span>
                  </div>
                  <div class="stat">
                    <span class="label">{{ structure.stats.inProgress }}</span>
                    <span class="value">{{ stats().inProgress }}</span>
                  </div>
                  <div class="stat">
                    <span class="label">{{ structure.stats.won }}</span>
                    <span class="value">{{ stats().won }}</span>
                  </div>
                  <div class="stat">
                    <span class="label">{{ structure.stats.since }}</span>
                    <span class="value">{{ (assure.createdAt?.toMillis() | date: 'dd/MM/y') ?? '—' }}</span>
                  </div>
                </div>

                @if (editing()) {
                  <div class="card">
                    <h2 class="section-title">{{ structure.editTitle }}</h2>
                    <app-assure-form
                      mode="edit"
                      [assure]="assure"
                      [isPending]="store.isPending()"
                      [error]="store.error()"
                      [duplicates]="store.duplicates()"
                      (candidateChanged)="checkDuplicates($event)"
                      (submitted)="store.update({ id: assure.id, form: $event })"
                      (cancelled)="editing.set(false)"
                    />
                  </div>
                } @else {
                  <app-assure-details-card [assure]="assure" />
                }
              </div>
            </mat-tab>

            <mat-tab [label]="structure.dossiersTitle + ' (' + store.dossiers().length + ')'">
              <div class="tab card"><app-assure-dossiers-table [dossiers]="store.dossiers()" /></div>
            </mat-tab>

            <mat-tab [label]="structure.documentsTitle + ' (' + documents.documents().length + ')'">
              <div class="tab card">
                <app-assure-documents-list [documents]="documents.documents()" (opened)="documents.open($event)" />
              </div>
            </mat-tab>
          </mat-tab-group>
        </section>
      </div>
    } @else if (store.loaded()) {
      <p class="empty">{{ structure.notFound }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 16px;
    }

    .back {
      justify-self: start;
    }

    .layout {
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }

    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }

    .card {
      padding: 20px 24px;
      border: 1px solid var(--ci-border);
      border-radius: 12px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    .tab {
      display: grid;
      gap: 16px;
      margin-top: 16px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
    }

    .stat {
      display: grid;
      gap: 4px;

      .label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--ci-text-muted);
      }

      .value {
        font-size: 20px;
        font-weight: 700;
      }
    }

    .section-title {
      margin: 0 0 16px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ci-text-muted);
    }

    .empty {
      margin: 0;
      color: var(--ci-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDetailContainerComponent implements OnInit, HasUnsavedChanges {
  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(AssuresStore);
  protected readonly documents = inject(AssureDocumentsStore);
  private readonly _router = inject(Router);
  private readonly _snackBar = inject(MatSnackBar);
  private readonly _auth = inject(AuthStore);
  private readonly _form = viewChild(AssureFormComponent);
  protected readonly structure = ASSURES_STRUCTURE.detail;
  protected readonly listUrl = CabinetRouteContainerModel.CLIENTS_ROUTE.url;
  protected readonly isAdmin = computed(() => this._auth.role() === 'admin');
  /** La fiche se lit ; elle ne passe en saisie que sur « Modifier la fiche ». */
  protected readonly editing = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly stats = computed(() => dossierStats(this.store.dossiers()));

  constructor() {
    effect(() => {
      this.store.select(this.id());
      untracked(() => {
        this.editing.set(false);
        this.confirmingDelete.set(false);
      });
    });
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 3000 });
        this.store.clearMessage();
        // Fiche enregistrée : retour à la lecture.
        untracked(() => this.editing.set(false));
      }
    });
    // Client supprimé : retour à la liste.
    effect(() => {
      if (this.store.deleted()) {
        untracked(() => this._router.navigateByUrl(this.listUrl));
      }
    });
  }

  ngOnInit(): void {
    this.store.resetStatus();
  }

  /** Garde de sortie : fiche en cours de modification, pas enregistrée. */
  hasUnsavedChanges(): boolean {
    return this.editing() && !!this._form()?.hasUnsavedChanges();
  }

  protected startEdit(): void {
    this.store.resetStatus();
    this.confirmingDelete.set(false);
    this.editing.set(true);
  }

  protected checkDuplicates(candidate: DuplicateCandidate): void {
    this.store.checkDuplicates({ candidate, excludeId: this.id() });
  }
}
