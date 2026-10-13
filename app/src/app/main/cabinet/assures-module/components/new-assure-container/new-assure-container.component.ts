import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Assure } from '@shared';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AssureFormModel } from '../../models/assure-form.model';
import { AssuresService } from '../../services/assures.service';
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
    <app-assure-document-import (pieceRead)="piece.set($event)" />
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
export class NewAssureContainerComponent implements OnInit {
  protected readonly store = inject(AssuresStore);
  private readonly _router = inject(Router);
  protected readonly structure = ASSURES_STRUCTURE.form;
  protected readonly duplicates = signal<Assure[]>([]);
  private readonly _service = inject(AssuresService);
  private readonly _snackBar = inject(MatSnackBar);

  /** Dernière pièce lue : elle pré-remplit le formulaire et sera rangée avec le client. */
  protected readonly piece = signal<ReadPiece | null>(null);
  protected readonly prefill = computed<Partial<AssureFormModel> | null>(() => {
    const piece = this.piece();
    if (!piece) return null;
    const { civilite, ...values } = piece.values;
    // Un Kbis, c'est une société : le client devient professionnel.
    return { ...values, ...(civilite ? { civilite } : {}), ...(piece.type === 'kbis' ? { type: 'pro' as const } : {}) };
  });

  constructor() {
    effect(() => {
      const createdId = this.store.createdId();
      if (!createdId) return;
      const open = () => this._router.navigate([CabinetRouteContainerModel.CLIENTS_ROUTE.url, createdId]);
      // Lu sans dépendance : remettre la pièce à null ne doit pas relancer l'effet (double navigation).
      const piece = untracked(() => this.piece());
      if (!piece) {
        open();
        return;
      }
      this.piece.set(null);
      this._service.attachPiece({ assureId: createdId, ...piece }).subscribe({
        next: open,
        error: () => {
          this._snackBar.open(ASSURES_STRUCTURE.piece.attachFailed, undefined, { duration: 5000 });
          open();
        },
      });
    });
  }

  ngOnInit(): void {
    this.store.resetStatus();
  }

  protected checkDuplicates(candidate: DuplicateCandidate): void {
    this.duplicates.set(this.store.duplicatesOf(candidate));
  }

  protected back(): void {
    this._router.navigateByUrl(CabinetRouteContainerModel.CLIENTS_ROUTE.url);
  }
}
