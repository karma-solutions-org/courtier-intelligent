import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { CurrencyPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComparisonStore } from '../../store/comparison.store';
import { DossierStore } from '../../store/dossier.store';
import {
  ComparisonColumn,
  ComparisonTableComponent,
} from '../comparison-table/comparison-table.component';
import {
  DecisionDialogComponent,
  DecisionDialogData,
} from '../decision-dialog/decision-dialog.component';
import { COMPARISON_STRUCTURE } from './comparison-tab.structure';

/** Onglet Comparatif : offres côte à côte (analysées par le serveur) et choix justifié de l'offre retenue. */
@Component({
  selector: 'app-comparison-tab',
  imports: [CurrencyPipe, MatButtonModule, MatIconModule, ComparisonTableComponent],
  providers: [ComparisonStore],
  template: `
    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }
    @if (!store.loaded() && !store.error()) {
      <p class="hint" role="status">{{ text.loading }}</p>
    } @else if (store.columns().length) {
      <p class="hint">
        <mat-icon>info</mat-icon>{{ dossierStore.need() ? text.indicativeScore : text.noNeed }}
      </p>
      @if (store.staleNames().length) {
        <p class="error" role="status">
          <mat-icon>warning</mat-icon>
          Offres à refaire (informations du dossier modifiées depuis le tarif) : {{ store.staleNames().join(', ') }}.
          Relancez-les depuis l'étape Tarification.
        </p>
      }
      @if (decision(); as decision) {
        <p class="decided" role="status">
          <mat-icon>check_circle</mat-icon>
          <span>
            <strong
              >{{ text.decided }} :
              {{
                dossierStore.insurerNames().get(decision.insurerId) ?? decision.insurerId
              }}</strong
            >
            — {{ decision.justification }}
            @if (decision.offerSnapshot; as snap) {
              <br />
              <small>
                Offre retenue (figée au moment du choix) :
                @if (snap.premiumAnnual !== null) {
                  {{ snap.premiumAnnual | currency: 'EUR' : 'symbol' : '1.0-2' }} / an
                }
                @if (snap.premiumMonthly !== null) {
                  · {{ snap.premiumMonthly | currency: 'EUR' : 'symbol' : '1.0-2' }} / mois
                }
                @if (snap.quoteNumber) {
                  · devis {{ snap.quoteNumber }}
                }
                @if (snap.score !== null) {
                  · score {{ snap.score }}
                }
              </small>
            }
          </span>
          @if (store.canReopen()) {
            <button mat-stroked-button type="button" class="reopen" [disabled]="store.busy()" (click)="store.reopen()">
              <mat-icon>undo</mat-icon>Revenir au comparatif
            </button>
          }
        </p>
      }
      <app-comparison-table
        [columns]="store.columns()"
        [guarantees]="dossierStore.guarantees()"
        [mandatory]="dossierStore.need()?.mandatoryGuarantees ?? []"
        [niceToHave]="dossierStore.need()?.niceToHave ?? []"
        [decidedInsurerId]="decision()?.insurerId ?? null"
        [canDecide]="store.canDecide()"
        [busy]="store.busy()"
        (choose)="choose($event)"
      />
    } @else if (!store.error()) {
      <p class="hint">{{ text.empty }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 16px;
      min-width: 0;
    }

    .hint,
    .decided,
    .error {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }

    .hint {
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .decided,
    .error {
      padding: 12px 14px;
      border-radius: 8px;
    }

    .reopen {
      margin-left: auto;
      flex-shrink: 0;
    }

    .decided {
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);
    }

    .error {
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparisonTabComponent {
  protected readonly store = inject(ComparisonStore);
  protected readonly dossierStore = inject(DossierStore);
  private readonly _dialog = inject(MatDialog);
  private readonly _snackBar = inject(MatSnackBar);

  protected readonly text = COMPARISON_STRUCTURE;
  protected readonly decision = computed(() => this.dossierStore.dossier()?.decision ?? null);

  constructor() {
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 4000 });
        this.store.clearSuccess();
      }
    });
  }

  protected choose(column: ComparisonColumn): void {
    const current = this.decision();
    this._dialog
      .open<DecisionDialogComponent, DecisionDialogData, string>(DecisionDialogComponent, {
        data: {
          insurerName: column.insurerName,
          justification: current?.insurerId === column.insurerId ? current.justification : null,
        },
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((justification) => {
        if (justification) {
          this.store.decide({ insurerId: column.insurerId, justification });
        }
      });
  }
}
