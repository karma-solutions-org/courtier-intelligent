import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComparisonStore } from '../../store/comparison.store';
import { DossierStore } from '../../store/dossier.store';
import { ComparisonColumn, ComparisonTableComponent } from '../comparison-table/comparison-table.component';
import { DecisionDialogComponent, DecisionDialogData } from '../decision-dialog/decision-dialog.component';
import { COMPARISON_STRUCTURE } from './comparison-tab.structure';

/** Onglet Comparatif : offres côte à côte (analysées par le serveur) et choix justifié de l'offre retenue. */
@Component({
  selector: 'app-comparison-tab',
  imports: [MatIconModule, ComparisonTableComponent],
  providers: [ComparisonStore],
  template: `
    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }
    @if (store.columns().length) {
      <p class="hint"><mat-icon>info</mat-icon>{{ dossierStore.need() ? text.indicativeScore : text.noNeed }}</p>
      @if (decision(); as decision) {
        <p class="decided" role="status">
          <mat-icon>check_circle</mat-icon>
          <span>
            <strong>{{ text.decided }} : {{ dossierStore.insurerNames().get(decision.insurerId) ?? decision.insurerId }}</strong>
            — {{ decision.justification }}
          </span>
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
    } @else {
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
      color: var(--mat-sys-on-surface-variant);
    }

    .decided,
    .error {
      padding: 12px 14px;
      border-radius: 10px;
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
        this.store.clearMessages();
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
      .subscribe(justification => {
        if (justification) {
          this.store.decide({ insurerId: column.insurerId, justification });
        }
      });
  }
}
