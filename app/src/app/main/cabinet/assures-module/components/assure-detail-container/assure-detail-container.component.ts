import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
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
    AssureFormComponent,
    StatusChipComponent,
  ],
  template: `
    <a mat-button [routerLink]="listUrl" class="back">
      <mat-icon>arrow_back</mat-icon>
      {{ structure.back }}
    </a>

    @if (store.selected(); as assure) {
      <div class="layout">
        <aside class="card identity">
          <div class="avatar" aria-hidden="true">{{ initials(assure) }}</div>
          <h1>{{ nameOf(assure) }}</h1>
          <p class="type">{{ typeLabels[assure.type] }}</p>

          <ul class="contact">
            @if (assure.siret) {
              <li><mat-icon aria-hidden="true">badge</mat-icon>{{ assure.siret }}</li>
            }
            @if (assure.email) {
              <li><mat-icon aria-hidden="true">mail</mat-icon>{{ assure.email }}</li>
            }
            @if (assure.phone) {
              <li><mat-icon aria-hidden="true">call</mat-icon>{{ assure.phone }}</li>
            }
            @if (assure.address?.city) {
              <li><mat-icon aria-hidden="true">place</mat-icon>{{ assure.address?.city }}</li>
            }
          </ul>

          <div class="actions">
            <a mat-flat-button [routerLink]="newDossierUrl" [queryParams]="{ assure: assure.id }">
              <mat-icon>create_new_folder</mat-icon>
              {{ structure.newDossier }}
            </a>
            <button mat-stroked-button type="button" (click)="startEdit()" [disabled]="editing()">
              <mat-icon>edit</mat-icon>
              {{ structure.edit }}
            </button>
            @if (isAdmin()) {
              @if (confirmingDelete()) {
                <div class="confirm" role="alert">
                  <p>
                    {{
                      store.dossiers().length
                        ? structure.deleteConfirmWithDossiers(store.dossiers().length)
                        : structure.deleteConfirm
                    }}
                  </p>
                  <div class="confirm-actions">
                    <button mat-button type="button" (click)="confirmingDelete.set(false)">
                      {{ structure.deleteNo }}
                    </button>
                    <button
                      mat-flat-button
                      class="danger"
                      type="button"
                      [disabled]="store.isPending()"
                      (click)="store.remove(assure.id)"
                    >
                      {{ structure.deleteYes }}
                    </button>
                  </div>
                </div>
              } @else {
                <button
                  mat-stroked-button
                  class="danger-outline"
                  type="button"
                  (click)="confirmingDelete.set(true)"
                >
                  <mat-icon>delete</mat-icon>
                  {{ structure.delete }}
                </button>
              }
            }
            @if (store.error() && !editing()) {
              <p class="error" role="alert">{{ store.error() }}</p>
            }
          </div>
        </aside>

        <section class="main">
          <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false">
            <mat-tab [label]="structure.infoTitle">
              <div class="tab">
                <div class="card stats">
                  <div class="stat">
                    <span class="label">{{ structure.stats.total }}</span>
                    <span class="value">{{ store.dossiers().length }}</span>
                  </div>
                  <div class="stat">
                    <span class="label">{{ structure.stats.inProgress }}</span>
                    <span class="value">{{ inProgress() }}</span>
                  </div>
                  <div class="stat">
                    <span class="label">{{ structure.stats.won }}</span>
                    <span class="value">{{ won() }}</span>
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
                      [duplicates]="duplicates()"
                      (candidateChanged)="checkDuplicates($event)"
                      (submitted)="store.update({ id: assure.id, form: $event })"
                      (cancelled)="editing.set(false)"
                    />
                  </div>
                } @else {
                  <div class="card">
                    <h2 class="section-title">{{ structure.detailsTitle }}</h2>
                    <dl class="details">
                      @for (field of detailsOf(assure); track field.label) {
                        <div>
                          <dt>{{ field.label }}</dt>
                          <dd>{{ field.value || '—' }}</dd>
                        </div>
                      }
                    </dl>
                  </div>
                }
              </div>
            </mat-tab>

            <mat-tab [label]="structure.dossiersTitle + ' (' + store.dossiers().length + ')'">
              <div class="tab card">
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
              </div>
            </mat-tab>

            <mat-tab [label]="structure.documentsTitle + ' (' + documents().length + ')'">
              <div class="tab card">
                @if (documents().length) {
                  <ul class="pieces">
                    @for (document of documents(); track document.id) {
                      <li>
                        <mat-icon aria-hidden="true">description</mat-icon>
                        <span class="piece-name">{{ pieceText.types[document.type] }} · {{ document.fileName }}</span>
                        <span class="piece-date">{{ document.createdAt?.toMillis() | date: 'd MMM y' }}</span>
                        <button mat-button type="button" (click)="openDocument(document)">{{ pieceText.open }}</button>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="empty">{{ structure.noDocuments }}</p>
                }
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

    .identity {
      display: grid;
      justify-items: center;
      gap: 4px;
      text-align: center;
    }

    .avatar {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      margin-bottom: 8px;
      border: 1px solid var(--ci-border);
      border-radius: 50%;
      background: var(--ci-surface-2);
      font-size: 22px;
      font-weight: 600;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
    }

    .type {
      margin: 0;
      color: var(--ci-text-muted);
    }

    .contact {
      display: grid;
      gap: 10px;
      justify-self: stretch;
      margin: 16px 0 0;
      padding: 16px 0;
      border-top: 1px solid var(--ci-border);
      border-bottom: 1px solid var(--ci-border);
      list-style: none;
      text-align: left;

      &:empty {
        display: none;
      }

      li {
        display: flex;
        gap: 10px;
        align-items: center;
        overflow-wrap: anywhere;
      }

      mat-icon {
        flex: none;
        width: 18px;
        height: 18px;
        font-size: 18px;
        color: var(--ci-text-muted);
      }
    }

    .actions {
      display: grid;
      gap: 10px;
      justify-self: stretch;
      margin-top: 16px;

      > a,
      > button {
        width: 100%;
      }
    }

    .danger-outline {
      color: var(--ci-danger, #c62828);
    }

    .danger {
      background: var(--ci-danger, #c62828);
      color: #fff;
    }

    .confirm {
      padding: 12px;
      border: 1px solid var(--ci-danger, #c62828);
      border-radius: 8px;
      text-align: left;

      p {
        margin: 0 0 8px;
      }
    }

    .confirm-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .hint,
    .error {
      margin: 0;
      font-size: 13px;
      text-align: left;
    }

    .hint {
      color: var(--ci-text-muted);
    }

    .error {
      color: var(--ci-danger, #c62828);
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

    .details {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 20px 24px;
      margin: 0;

      dt {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--ci-text-muted);
      }

      dd {
        margin: 4px 0 0;
        font-weight: 500;
        overflow-wrap: anywhere;
      }
    }

    table {
      width: 100%;
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
      letter-spacing: 0.04em;
      text-transform: uppercase;
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
      margin: 0;
      color: var(--ci-text-muted);
    }

    .pieces {
      margin: 0;
      padding: 0;
      list-style: none;

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
  protected readonly isAdmin = computed(() => this._auth.role() === 'admin');
  /** La fiche se lit ; elle ne passe en saisie que sur « Modifier la fiche ». */
  protected readonly editing = signal(false);
  protected readonly confirmingDelete = signal(false);

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
        untracked(() => this.back());
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

  protected startEdit(): void {
    this.store.resetStatus();
    this.confirmingDelete.set(false);
    this.editing.set(true);
  }

  protected initials(assure: Assure): string {
    const words = displayName(assure).trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /** Détails affichés en lecture : la société d'abord pour un professionnel. */
  protected detailsOf(assure: Assure): { label: string; value: string | null | undefined }[] {
    const fields = this.structure.fields;
    const company =
      assure.type === 'pro'
        ? [
            { label: fields.companyName, value: assure.companyName },
            { label: fields.siret, value: assure.siret },
          ]
        : [];
    return [
      ...company,
      { label: fields.civilite, value: assure.civilite },
      { label: fields.lastName, value: assure.lastName },
      { label: fields.firstName, value: assure.firstName },
      { label: fields.birthDate, value: formatDate(assure.birthDate) },
      { label: fields.email, value: assure.email },
      { label: fields.phone, value: assure.phone },
      { label: fields.street, value: assure.address?.street },
      { label: fields.postalCode, value: assure.address?.postalCode },
      { label: fields.city, value: assure.address?.city },
    ];
  }

  protected checkDuplicates(candidate: DuplicateCandidate): void {
    this.duplicates.set(this.store.duplicatesOf(candidate, this.id()));
  }

  protected back(): void {
    this._router.navigateByUrl(this.listUrl);
  }
}

/** « 1985-04-12 » → « 12/04/1985 ». */
function formatDate(iso: string | null | undefined): string | null {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (iso ?? null);
}
