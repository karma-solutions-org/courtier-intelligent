import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { Assure, DOSSIER_STATUS_LABELS } from '@shared';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AssuresStore } from '../../store/assures.store';
import { DuplicateCandidate, displayName } from '../../util/assures.utils';
import { AssureFormComponent } from '../assure-form/assure-form.component';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Fiche d'un assuré : informations modifiables et liste de ses dossiers. */
@Component({
  selector: 'app-assure-detail-container',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, AssureFormComponent],
  template: `
    <a mat-button [routerLink]="listUrl" class="back">
      <mat-icon>arrow_back</mat-icon>
      {{ structure.back }}
    </a>

    @if (store.selected(); as assure) {
      <h1>{{ nameOf(assure) }}</h1>

      <app-assure-form
        mode="edit"
        [assure]="assure"
        [isPending]="store.isPending()"
        [error]="store.error()"
        [duplicates]="duplicates()"
        (candidateChanged)="checkDuplicates($event)"
        (submitted)="store.update({ id: assure.id, form: $event })"
        (cancelled)="back()"
      />

      <section class="card">
        <h2>{{ structure.dossiersTitle }} ({{ store.dossiers().length }})</h2>
        @if (store.dossiers().length) {
          <table>
            <thead>
              <tr>
                <th>{{ structure.columns.reference }}</th>
                <th>{{ structure.columns.product }}</th>
                <th>{{ structure.columns.status }}</th>
                <th>{{ structure.columns.createdAt }}</th>
              </tr>
            </thead>
            <tbody>
              @for (dossier of store.dossiers(); track dossier.id) {
                <tr>
                  <td>{{ dossier.reference || structure.draftReference }}</td>
                  <td>{{ dossier.productId }}</td>
                  <td>{{ statusLabels[dossier.status] }}</td>
                  <td>{{ dossier.createdAt?.toMillis() | date: 'd MMM y' }}</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="empty">{{ structure.noDossiers }}</p>
        }
      </section>
    } @else if (store.loaded()) {
      <p class="empty">{{ structure.notFound }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
    }

    h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 600;
    }

    .back {
      justify-self: start;
    }

    .card {
      padding: 24px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
    }

    h2 {
      margin: 0 0 16px;
      font-size: 17px;
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 10px 8px;
      text-align: left;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    th {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDetailContainerComponent implements OnInit {
  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(AssuresStore);
  private readonly _router = inject(Router);
  private readonly _snackBar = inject(MatSnackBar);
  protected readonly structure = ASSURES_STRUCTURE.detail;
  protected readonly statusLabels = DOSSIER_STATUS_LABELS;
  protected readonly listUrl = CabinetRouteContainerModel.ASSURES_ROUTE.url;
  protected readonly duplicates = signal<Assure[]>([]);
  protected readonly nameOf = displayName;

  constructor() {
    effect(() => this.store.select(this.id()));
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 3000 });
        this.store.clearMessage();
      }
    });
  }

  ngOnInit(): void {
    this.store.resetStatus();
  }

  protected checkDuplicates(candidate: DuplicateCandidate): void {
    this.duplicates.set(this.store.duplicatesOf(candidate, this.id()));
  }

  protected back(): void {
    this._router.navigateByUrl(this.listUrl);
  }
}
