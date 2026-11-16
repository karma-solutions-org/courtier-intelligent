import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { Insurer, Product } from '@shared';
import { CatalogChoicesModel } from '../../../models/catalog-choices.model';
import { SETTINGS_STRUCTURE } from '../settings.structure';

/**
 * L'admin choisit les assureurs et produits actifs de son cabinet. Le catalogue (extranets compris) est publié depuis
 * le dépôt back : il n'est ni complété ni modifié ici.
 */
@Component({
  selector: 'app-catalog-panel',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule],
  templateUrl: './catalog-panel-presentation.component.html',
  styleUrls: ['../settings.scss', './catalog-panel-presentation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPanelPresentationComponent {
  readonly products = input<Product[]>([]);
  readonly insurers = input<Insurer[]>([]);
  /** Choix actuels du cabinet. */
  readonly enabledProducts = input<string[]>([]);
  readonly enabledInsurers = input<string[]>([]);
  readonly isPending = input(false);
  readonly saved = output<CatalogChoicesModel>();

  protected readonly structure = SETTINGS_STRUCTURE.catalog;

  /** Sélection en cours d'édition : repart des choix du cabinet quand ils changent. */
  protected readonly selectedProducts = linkedSignal(() => this.enabledProducts());
  protected readonly selectedInsurers = linkedSignal(() => this.enabledInsurers());

  protected questionCount(product: Product): number {
    return product.questionnaireSchema.reduce((count, section) => count + section.questions.length, 0);
  }

  protected toggleProduct(id: string, checked: boolean): void {
    this.selectedProducts.update(ids => toggle(ids, id, checked));
  }

  protected toggleInsurer(id: string, checked: boolean): void {
    this.selectedInsurers.update(ids => toggle(ids, id, checked));
  }

  /** Un choix qui n'est plus au catalogue (assureur ou produit retiré) n'est pas réenregistré. */
  protected save(): void {
    this.saved.emit({
      enabledProducts: inCatalog(this.selectedProducts(), this.products()),
      enabledInsurers: inCatalog(this.selectedInsurers(), this.insurers()),
    });
  }
}

function toggle(ids: string[], id: string, checked: boolean): string[] {
  return checked ? [...new Set([...ids, id])] : ids.filter(x => x !== id);
}

function inCatalog(ids: string[], items: { id: string }[]): string[] {
  const known = new Set(items.map(item => item.id));
  return ids.filter(id => known.has(id));
}
