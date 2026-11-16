import { ChangeDetectionStrategy, Component, effect, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { Router, RouterLink } from '@angular/router';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../../assures-module/util/assures.utils';
import { DossiersStore } from '../../../store/dossiers.store';
import { DossierStepperHeaderPresentationComponent } from '../../dossier-stepper-header/dossier-stepper-header-presentation/dossier-stepper-header-presentation.component';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';

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
    DossierStepperHeaderPresentationComponent,
  ],
  templateUrl: './new-dossier-container.component.html',
  styleUrl: './new-dossier-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewDossierContainerComponent implements OnInit {
  /** Assuré présélectionné (paramètre d'URL `?assure=`), par exemple depuis sa fiche. */
  readonly assure = input<string | undefined>(undefined);

  protected readonly store = inject(DossiersStore);
  private readonly _router = inject(Router);
  protected readonly structure = DOSSIERS_STRUCTURE.newDossier;
  protected readonly newAssureUrl = CabinetRouteContainerModel.CLIENT_NEW_ROUTE.url;
  protected readonly nameOf = displayName;

  protected readonly step = signal<1 | 2>(1);
  protected readonly assureId = signal<string | null>(null);
  protected readonly productId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const preselected = this.assure();
      if (preselected) {
        // Client déjà choisi depuis son espace : on passe directement au produit.
        this.assureId.set(preselected);
        this.step.set(2);
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
    if (this.step() === 2 && !this.assure()) {
      this.step.set(1);
    } else {
      const preselected = this.assure();
      this._router.navigateByUrl(
        preselected ? CabinetRouteContainerModel.clientUrl(preselected) : CabinetRouteContainerModel.CLIENTS_ROUTE.url,
      );
    }
  }
}
