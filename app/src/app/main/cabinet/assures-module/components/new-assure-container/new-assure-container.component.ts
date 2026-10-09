import { ChangeDetectionStrategy, Component, effect, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Assure } from '@shared';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AssuresStore } from '../../store/assures.store';
import { DuplicateCandidate } from '../../util/assures.utils';
import { AssureFormComponent } from '../assure-form/assure-form.component';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Création d'un assuré : à la réussite, ouvre sa fiche. */
@Component({
  selector: 'app-new-assure-container',
  imports: [AssureFormComponent],
  template: `
    <h1>{{ structure.createTitle }}</h1>
    <app-assure-form
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
    h1 {
      margin: 0 0 20px;
      font-size: 26px;
      font-weight: 600;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewAssureContainerComponent implements OnInit {
  protected readonly store = inject(AssuresStore);
  private readonly _router = inject(Router);
  protected readonly structure = ASSURES_STRUCTURE.form;
  protected readonly duplicates = signal<Assure[]>([]);

  constructor() {
    effect(() => {
      const createdId = this.store.createdId();
      if (createdId) {
        this._router.navigate([CabinetRouteContainerModel.ASSURES_ROUTE.url, createdId]);
      }
    });
  }

  ngOnInit(): void {
    this.store.resetStatus();
  }

  protected checkDuplicates(candidate: DuplicateCandidate): void {
    this.duplicates.set(this.store.duplicatesOf(candidate));
  }

  protected back(): void {
    this._router.navigateByUrl(CabinetRouteContainerModel.ASSURES_ROUTE.url);
  }
}
