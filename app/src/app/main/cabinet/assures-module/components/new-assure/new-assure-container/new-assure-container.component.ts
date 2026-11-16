import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, untracked, viewChild } from '@angular/core';
import { HasUnsavedChanges } from '../../../../../../core/routing/guards/unsaved-changes.guard';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AssureFormModel } from '../../../models/assure-form.model';
import { AssuresStore } from '../../../store/assures.store';
import { ReadPiece } from '../../../models/assure-document-import.model';
import { AssureDocumentImportContainerComponent } from '../../assure-document-import/assure-document-import-container/assure-document-import-container.component';
import { DuplicateCandidate } from '../../../util/assures.utils';
import { AssureFormPresentationComponent } from '../../assure-form/assure-form-presentation/assure-form-presentation.component';
import { ASSURES_STRUCTURE } from '../../assures.structure';

/** Création d'un assuré : à la réussite, ouvre sa fiche. */
@Component({
  selector: 'app-new-assure-container',
  imports: [AssureFormPresentationComponent, AssureDocumentImportContainerComponent],
  templateUrl: './new-assure-container.component.html',
  styleUrl: './new-assure-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewAssureContainerComponent implements OnInit, HasUnsavedChanges {
  private readonly _form = viewChild(AssureFormPresentationComponent);

  /** Garde de sortie : formulaire commencé mais pas enregistré. */
  hasUnsavedChanges(): boolean {
    return !this.store.createdId() && !!this._form()?.hasUnsavedChanges();
  }

  protected readonly store = inject(AssuresStore);
  private readonly _router = inject(Router);
  protected readonly structure = ASSURES_STRUCTURE.form;
  protected readonly duplicates = this.store.duplicates;
  private readonly _snackBar = inject(MatSnackBar);

  /** Pièces lues (recto, verso…) : elles pré-remplissent le formulaire et seront rangées avec le client. */
  protected readonly pieces = signal<ReadPiece[]>([]);
  protected readonly prefill = computed<Partial<AssureFormModel> | null>(() => {
    const pieces = this.pieces();
    if (!pieces.length) return null;
    // Une valeur lue sur une pièce n'est pas écrasée par une suivante : celle-ci ne complète que les champs manquants.
    const merged: Record<string, unknown> = {};
    for (const piece of pieces) {
      for (const [key, value] of Object.entries(piece.values)) {
        if (merged[key] === undefined && value !== undefined && value !== null && value !== '') merged[key] = value;
      }
    }
    // Un Kbis, c'est une société : le client devient professionnel.
    return { ...(merged as Partial<AssureFormModel>), ...(pieces.some(piece => piece.type === 'kbis') ? { type: 'pro' as const } : {}) };
  });

  constructor() {
    effect(() => {
      const createdId = this.store.createdId();
      if (!createdId) return;
      // Lu sans dépendance : remettre les pièces à zéro ne doit pas relancer l'effet (double navigation).
      const pieces = untracked(() => this.pieces());
      if (!pieces.length) {
        untracked(() => this._open(createdId));
        return;
      }
      untracked(() => {
        this.pieces.set([]);
        // Chaque pièce est rangée avec le client ; un échec n'empêche pas les autres.
        this.store.attachPieces({ assureId: createdId, pieces });
      });
    });
    // Pièces rangées : message si l'une a échoué, puis ouverture de la fiche du client.
    effect(() => {
      const result = this.store.piecesAttachResult();
      const createdId = untracked(() => this.store.createdId());
      if (!result || !createdId) return;
      if (result === 'partial') this._snackBar.open(ASSURES_STRUCTURE.piece.attachFailed, undefined, { duration: 5000 });
      untracked(() => this._open(createdId));
    });
  }

  private _open(assureId: string): void {
    this._router.navigate([CabinetRouteContainerModel.CLIENTS_ROUTE.url, assureId]);
  }

  ngOnInit(): void {
    this.store.resetStatus();
  }

  protected checkDuplicates(candidate: DuplicateCandidate): void {
    this.store.checkDuplicates({ candidate });
  }

  protected back(): void {
    this._router.navigateByUrl(CabinetRouteContainerModel.CLIENTS_ROUTE.url);
  }
}
