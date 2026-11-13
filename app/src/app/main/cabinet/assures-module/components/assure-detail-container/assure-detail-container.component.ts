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
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { TabQueryParamDirective } from '../../../../../core/directives/tab-query-param.directive';
import { Router, RouterLink } from '@angular/router';
import { Assure, AssureDocument, Dossier } from '@shared';
import { combineLatest, of, switchMap } from 'rxjs';
import { HasUnsavedChanges } from '../../../../../core/routing/guards/unsaved-changes.guard';
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
    TabQueryParamDirective,
    AssureFormComponent,
    StatusChipComponent,
  ],
  templateUrl: './assure-detail-container.component.html',
  styleUrl: './assure-detail-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDetailContainerComponent implements OnInit, HasUnsavedChanges {
  private readonly _form = viewChild(AssureFormComponent);

  /** Garde de sortie : fiche en cours de modification, pas enregistrée. */
  hasUnsavedChanges(): boolean {
    return this.editing() && !!this._form()?.hasUnsavedChanges();
  }

  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(AssuresStore);
  private readonly _router = inject(Router);
  private readonly _snackBar = inject(MatSnackBar);
  protected readonly structure = ASSURES_STRUCTURE.detail;
  protected readonly typeLabels = ASSURES_STRUCTURE.typeLabels;
  protected readonly listUrl = CabinetRouteContainerModel.CLIENTS_ROUTE.url;
  protected readonly newDossierUrl = CabinetRouteContainerModel.DOSSIER_NEW_ROUTE.url;
  protected readonly duplicates = this.store.duplicates;
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
    this.store.checkDuplicates({ candidate, excludeId: this.id() });
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
