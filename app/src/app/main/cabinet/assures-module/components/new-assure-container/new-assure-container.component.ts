import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, untracked, viewChild } from '@angular/core';
import { HasUnsavedChanges } from '../../../../../core/routing/guards/unsaved-changes.guard';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AssureFormModel } from '../../models/assure-form.model';
import { AssuresStore } from '../../store/assures.store';
import { AssureDocumentImportComponent, ReadPiece } from '../assure-document-import/assure-document-import.component';
import { DuplicateCandidate } from '../../util/assures.utils';
import { AssureFormComponent } from '../assure-form/assure-form.component';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Création d'un assuré : à la réussite, ouvre sa fiche. */
@Component({
  selector: 'app-new-assure-container',
  imports: [AssureFormComponent, AssureDocumentImportComponent],
  template: `
    <h1>{{ structure.createTitle }}</h1>
    <app-assure-document-import (pieceRead)="pieces.update(list => [...list, $event])" />
    <app-assure-form
      [prefill]="prefill()"
      mode="create"
      [isPending]="store.isPending()"
      [error]="store.error()"
      [duplicates]="duplicates()"
      (candidateChanged)="checkDuplicates($event)"
      (submitted)="store.create($event)"
      (cancelled)="back()"
    />
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
    }

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewAssureContainerComponent implements OnInit, HasUnsavedChanges {
  private readonly _form = viewChild(AssureFormComponent);

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
      const open = () => this._router.navigate([CabinetRouteContainerModel.CLIENTS_ROUTE.url, createdId]);
      // Lu sans dépendance : remettre la pièce à null ne doit pas relancer l'effet (double navigation).
      const pieces = untracked(() => this.pieces());
      if (!pieces.length) {
        open();
        return;
      }
      this.pieces.set([]);
      // Chaque pièce est rangée avec le client ; un échec n'empêche pas les autres.
      this.store.attachPieces({
        assureId: createdId,
        pieces,
        done: (allAttached) => {
          if (!allAttached) this._snackBar.open(ASSURES_STRUCTURE.piece.attachFailed, undefined, { duration: 5000 });
          open();
        },
      });
    });
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
