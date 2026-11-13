import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { HasUnsavedChanges } from '../../../../../../core/routing/guards/unsaved-changes.guard';
import { AuthStore } from '../../../../../commons/authentication-module/store/auth.store';
import { AssuresStore } from '../../../store/assures.store';
import { DuplicateCandidate } from '../../../util/assures.utils';
import { AssureDetailPresentationComponent } from '../assure-detail-presentation/assure-detail-presentation.component';

/** Espace client : sélection du client de la route, pièces, modification, suppression et retour à la liste. */
@Component({
  selector: 'app-assure-detail-container',
  imports: [AssureDetailPresentationComponent],
  templateUrl: './assure-detail-container.component.html',
  styleUrl: './assure-detail-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDetailContainerComponent implements OnInit, HasUnsavedChanges {
  private readonly _presentation = viewChild(AssureDetailPresentationComponent);

  /** Garde de sortie : fiche en cours de modification, pas enregistrée. */
  hasUnsavedChanges(): boolean {
    return !!this._presentation()?.hasUnsavedChanges();
  }

  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(AssuresStore);
  private readonly _router = inject(Router);
  private readonly _snackBar = inject(MatSnackBar);
  private readonly _auth = inject(AuthStore);
  private readonly _listUrl = CabinetRouteContainerModel.CLIENTS_ROUTE.url;
  protected readonly duplicates = this.store.duplicates;
  protected readonly isAdmin = computed(() => this._auth.role() === 'admin');
  /** La fiche se lit ; elle ne passe en saisie que sur « Modifier la fiche ». */
  protected readonly editing = signal(false);
  protected readonly confirmingDelete = signal(false);

  constructor() {
    // Pièces rangées avec le client (CIN, Kbis importés à sa création).
    this.store.listenDocuments(computed(() => ({ cabinetId: this._auth.cabinetId(), assureId: this.id() })));
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

  protected startEdit(): void {
    this.store.resetStatus();
    this.confirmingDelete.set(false);
    this.editing.set(true);
  }

  protected checkDuplicates(candidate: DuplicateCandidate): void {
    this.store.checkDuplicates({ candidate, excludeId: this.id() });
  }

  protected back(): void {
    this._router.navigateByUrl(this._listUrl);
  }
}
