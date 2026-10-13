import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { Assure, AssureDocument, Dossier } from '@shared';
import { combineLatest, of, switchMap } from 'rxjs';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { AssuresService } from '../../services/assures.service';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { StatusChipComponent } from '../../../dossiers-module/components/status-chip/status-chip.component';
import { AssuresStore } from '../../store/assures.store';
import { DuplicateCandidate, displayName } from '../../util/assures.utils';
import { AssureFormComponent } from '../assure-form/assure-form.component';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Statuts où le dossier n'avance plus. */
const CLOSED_STATUSES: Dossier['status'][] = ['souscrit', 'refuse'];

/** Espace client : tous ses dossiers (ouverture, reprise, création) et ses informations. */
@Component({
  selector: 'app-assure-detail-container',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    AssureFormComponent,
    StatusChipComponent,
  ],
  template: `
    <a mat-button [routerLink]="listUrl" class="back">
      <mat-icon>arrow_back</mat-icon>
      {{ structure.back }}
    </a>

    @if (store.selected(); as assure) {
      <header class="head">
        <div>
          <h1>{{ nameOf(assure) }}</h1>
          <p class="sub">
            {{ typeLabels[assure.type] }}
            @if (assure.email) {
              · {{ assure.email }}
            }
            @if (assure.phone) {
              · {{ assure.phone }}
            }
          </p>
        </div>
        <a
          mat-flat-button
          [routerLink]="newDossierUrl"
          [queryParams]="{ assure: assure.id }"
        >
          <mat-icon>create_new_folder</mat-icon>
          {{ structure.newDossier }}
        </a>
      </header>

      <div class="stats">
        <div class="stat">
          <span class="value">{{ store.dossiers().length }}</span>
          <span class="label">{{ structure.stats.total }}</span>
        </div>
        <div class="stat">
          <span class="value">{{ inProgress() }}</span>
          <span class="label">{{ structure.stats.inProgress }}</span>
        </div>
        <div class="stat">
          <span class="value">{{ won() }}</span>
          <span class="label">{{ structure.stats.won }}</span>
        </div>
      </div>

      <mat-tab-group class="card" animationDuration="0ms">
        <mat-tab [label]="structure.dossiersTitle + ' (' + store.dossiers().length + ')'">
          @if (store.dossiers().length) {
            <table>
              <thead>
                <tr>
                  <th>{{ structure.columns.reference }}</th>
                  <th>{{ structure.columns.product }}</th>
                  <th>{{ structure.columns.status }}</th>
                  <th>{{ structure.columns.createdAt }}</th>
                  <th>{{ structure.columns.action }}</th>
                </tr>
              </thead>
              <tbody>
                @for (dossier of store.dossiers(); track dossier.id) {
                  <tr class="row" [routerLink]="dossierLink(dossier)">
                    <td>{{ dossier.reference || structure.draftReference }}</td>
                    <td>{{ dossier.productId }}</td>
                    <td><app-status-chip [status]="dossier.status" /></td>
                    <td>{{ dossier.createdAt?.toMillis() | date: 'd MMM y' }}</td>
                    <td class="action">
                      <a mat-button [routerLink]="dossierLink(dossier)" (click)="$event.stopPropagation()">
                        {{ dossier.status === 'brouillon' ? structure.resume : structure.open }}
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="empty">{{ structure.noDossiers }}</p>
          }
        </mat-tab>

        <mat-tab [label]="structure.infoTitle">
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
          @if (documents().length) {
            <section class="pieces">
              <h3>{{ pieceText.listTitle }}</h3>
              <ul>
                @for (document of documents(); track document.id) {
                  <li>
                    <mat-icon aria-hidden="true">description</mat-icon>
                    <span class="piece-name">{{ pieceText.types[document.type] }} · {{ document.fileName }}</span>
                    <span class="piece-date">{{ document.createdAt?.toMillis() | date: 'd MMM y' }}</span>
                    <button mat-button type="button" (click)="openDocument(document)">{{ pieceText.open }}</button>
                  </li>
                }
              </ul>
            </section>
          }
        </mat-tab>
      </mat-tab-group>
    } @else if (store.loaded()) {
      <p class="empty">{{ structure.notFound }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
    }

    .head {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    .sub {
      margin: 4px 0 0;
      color: var(--ci-text-muted);
    }

    .back {
      justify-self: start;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }

    .stat {
      display: grid;
      padding: 16px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);

      .value {
        font-size: 22px;
        font-weight: 600;
      }

      .label {
        font-size: 13px;
        color: var(--ci-text-muted);
      }
    }

    .card {
      padding: 8px 24px 24px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    table {
      width: 100%;
      margin-top: 12px;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 10px 8px;
      text-align: left;
      border-bottom: 1px solid var(--ci-border);
    }

    th {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ci-text-muted);
    }

    .row {
      cursor: pointer;

      &:hover {
        background: var(--ci-surface-2);
      }
    }

    .action {
      text-align: right;
    }

    .empty {
      color: var(--ci-text-muted);
    }

    .pieces {
      margin-top: 24px;

      h3 {
        margin: 0 0 8px;
        font-size: 15px;
        font-weight: 600;
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      li {
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px solid var(--ci-border);
      }

      .piece-name {
        flex: 1;
        overflow-wrap: anywhere;
      }

      .piece-date {
        font-size: 13px;
        color: var(--ci-text-muted);
      }
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
  protected readonly typeLabels = ASSURES_STRUCTURE.typeLabels;
  protected readonly listUrl = CabinetRouteContainerModel.CLIENTS_ROUTE.url;
  protected readonly newDossierUrl = CabinetRouteContainerModel.DOSSIER_NEW_ROUTE.url;
  protected readonly duplicates = signal<Assure[]>([]);
  protected readonly nameOf = displayName;
  protected readonly pieceText = ASSURES_STRUCTURE.piece;
  private readonly _service = inject(AssuresService);
  private readonly _auth = inject(AuthStore);

  /** Pièces rangées avec le client (CIN, Kbis importés à sa création). */
  protected readonly documents = toSignal(
    combineLatest([toObservable(this._auth.cabinetId), toObservable(this.id)]).pipe(
      switchMap(([cabinetId, id]) => (cabinetId && id ? this._service.watchDocuments(cabinetId, id) : of([]))),
    ),
    { initialValue: [] as AssureDocument[] },
  );

  protected openDocument(document: AssureDocument): void {
    this._service.downloadUrl(document.storagePath).subscribe((url) => window.open(url, '_blank', 'noopener'));
  }

  protected readonly inProgress = computed(
    () => this.store.dossiers().filter((dossier) => !CLOSED_STATUSES.includes(dossier.status)).length,
  );
  protected readonly won = computed(
    () => this.store.dossiers().filter((dossier) => dossier.status === 'souscrit').length,
  );

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

  /** Un brouillon se reprend dans son questionnaire, les autres s'ouvrent sur leur fiche. */
  protected dossierLink(dossier: Dossier): string[] {
    const base = [CabinetRouteContainerModel.DOSSIERS_ROUTE.url, dossier.id];
    return dossier.status === 'brouillon' ? [...base, 'brouillon'] : base;
  }

  protected checkDuplicates(candidate: DuplicateCandidate): void {
    this.duplicates.set(this.store.duplicatesOf(candidate, this.id()));
  }

  protected back(): void {
    this._router.navigateByUrl(this.listUrl);
  }
}
