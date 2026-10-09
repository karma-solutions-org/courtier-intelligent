import { ChangeDetectionStrategy, Component, effect, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { Router, RouterLink } from '@angular/router';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../assures-module/util/assures.utils';
import { DossiersStore } from '../../store/dossiers.store';
import { DossierStepperHeaderComponent } from '../dossier-stepper-header/dossier-stepper-header.component';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';

/**
 * « Nouveau dossier », étapes 1 et 2 : assuré puis produit. Le dossier est créé en brouillon en quittant l'étape 2,
 * puis le courtier remplit le questionnaire (étapes 3 et 4) sur la page du brouillon.
 */
@Component({
  selector: 'app-new-dossier-container',
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    DossierStepperHeaderComponent,
  ],
  template: `
    <h1>{{ structure.title }}</h1>
    <app-dossier-stepper-header [current]="step()" />

    @if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    }

    <section class="card">
      @if (step() === 1) {
        <h2>{{ structure.assureTitle }}</h2>
        <mat-form-field appearance="outline" class="search" subscriptSizing="dynamic">
          <mat-label>{{ structure.assureSearch }}</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput type="search" [value]="store.assureQuery()" (input)="store.setAssureQuery($any($event.target).value)" />
          <mat-hint>{{ structure.assureHint }}</mat-hint>
        </mat-form-field>

        <mat-radio-group class="choices" [value]="assureId()" (change)="assureId.set($event.value)" [attr.aria-label]="structure.assureTitle">
          @for (assure of store.assureResults(); track assure.id) {
            <mat-radio-button [value]="assure.id">
              {{ nameOf(assure) }}
              <span class="sub">{{ assure.email || assure.phone || assure.address?.city || '' }}</span>
            </mat-radio-button>
          } @empty {
            <p class="sub">{{ structure.noAssure }}</p>
          }
        </mat-radio-group>
        <a mat-button [routerLink]="newAssureUrl"><mat-icon>person_add</mat-icon>{{ structure.createAssure }}</a>
      } @else {
        <h2>{{ structure.productTitle }}</h2>
        <mat-radio-group class="choices" [value]="productId()" (change)="productId.set($event.value)" [attr.aria-label]="structure.productTitle">
          @for (product of store.availableProducts(); track product.id) {
            <mat-radio-button [value]="product.id">{{ product.name }}</mat-radio-button>
          } @empty {
            <p class="sub">{{ structure.noProduct }}</p>
          }
        </mat-radio-group>
        <p class="sub">{{ structure.draftNote }}</p>
      }

      <div class="actions">
        <button mat-button type="button" (click)="back()">{{ step() === 1 ? structure.cancel : structure.back }}</button>
        <button mat-flat-button type="button" [disabled]="!canContinue() || store.isPending()" (click)="next()">
          {{ store.isPending() ? structure.creating : structure.next }}
        </button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    h1 {
      margin: 0 0 20px;
      font-size: 26px;
      font-weight: 600;
    }

    h2 {
      margin: 0 0 16px;
      font-size: 17px;
      font-weight: 600;
    }

    .card {
      padding: 24px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
    }

    .search {
      width: 100%;
      max-width: 480px;
      margin-bottom: 12px;
    }

    .choices {
      display: flex;
      flex-direction: column;
      margin-bottom: 8px;
    }

    .sub {
      margin-left: 8px;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }

    .error {
      margin: 0 0 16px;
      padding: 12px 14px;
      border-radius: 10px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewDossierContainerComponent implements OnInit {
  /** Assuré présélectionné (paramètre d'URL `?assure=`), par exemple depuis sa fiche. */
  readonly assure = input<string | undefined>(undefined);

  protected readonly store = inject(DossiersStore);
  private readonly _router = inject(Router);
  protected readonly structure = DOSSIERS_STRUCTURE.newDossier;
  protected readonly newAssureUrl = CabinetRouteContainerModel.ASSURE_NEW_ROUTE.url;
  protected readonly nameOf = displayName;

  protected readonly step = signal<1 | 2>(1);
  protected readonly assureId = signal<string | null>(null);
  protected readonly productId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const preselected = this.assure();
      if (preselected) {
        this.assureId.set(preselected);
      }
    });
    // Un seul produit disponible : il est présélectionné.
    effect(() => {
      const products = this.store.availableProducts();
      if (products.length === 1 && !this.productId()) {
        this.productId.set(products[0].id);
      }
    });
    // Le dossier est créé : on passe à son questionnaire.
    effect(() => {
      const createdId = this.store.createdId();
      if (createdId) {
        this._router.navigate([CabinetRouteContainerModel.DOSSIERS_ROUTE.url, createdId, 'brouillon']);
      }
    });
  }

  ngOnInit(): void {
    this.store.resetStatus();
  }

  protected canContinue(): boolean {
    return this.step() === 1 ? this.assureId() !== null : this.productId() !== null;
  }

  protected next(): void {
    if (this.step() === 1) {
      this.step.set(2);
      return;
    }
    this.store.create({ assureId: this.assureId()!, productId: this.productId()! });
  }

  protected back(): void {
    if (this.step() === 2) {
      this.step.set(1);
    } else {
      this._router.navigateByUrl(CabinetRouteContainerModel.DOSSIERS_ROUTE.url);
    }
  }
}
