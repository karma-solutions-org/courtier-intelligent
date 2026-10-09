import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Insurer, Product } from '@shared';
import { CatalogChoicesModel } from '../../models/catalog-choices.model';
import { SETTINGS_STRUCTURE } from '../settings.structure';

/** L'admin choisit les assureurs et produits actifs de son cabinet parmi ceux du catalogue global. */
@Component({
  selector: 'app-catalog-panel',
  imports: [MatButtonModule, MatCheckboxModule],
  template: `
    <section class="card">
      <h2>{{ structure.title }}</h2>
      <p class="hint">{{ structure.hint }}</p>

      <h3>{{ structure.productsTitle }}</h3>
      @for (product of products(); track product.id) {
        <mat-checkbox [checked]="selectedProducts().includes(product.id)" (change)="toggleProduct(product.id, $event.checked)">
          {{ product.name }}
        </mat-checkbox>
      } @empty {
        <p class="hint">{{ structure.noProducts }}</p>
      }

      <h3>{{ structure.insurersTitle }}</h3>
      @for (insurer of insurers(); track insurer.id) {
        <mat-checkbox [checked]="selectedInsurers().includes(insurer.id)" (change)="toggleInsurer(insurer.id, $event.checked)">
          {{ insurer.name }}
        </mat-checkbox>
      } @empty {
        <p class="hint">{{ structure.noInsurers }}</p>
      }

      <div class="actions">
        <button mat-flat-button type="button" [disabled]="isPending()" (click)="save()">{{ structure.save }}</button>
      </div>
    </section>
  `,
  styleUrl: '../settings.scss',
  styles: `
    h3 {
      margin: 16px 0 4px;
      font-size: 15px;
      font-weight: 600;
    }

    mat-checkbox {
      display: block;
    }

    .actions {
      margin-top: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPanelComponent {
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

  protected toggleProduct(id: string, checked: boolean): void {
    this.selectedProducts.update(ids => toggle(ids, id, checked));
  }

  protected toggleInsurer(id: string, checked: boolean): void {
    this.selectedInsurers.update(ids => toggle(ids, id, checked));
  }

  protected save(): void {
    this.saved.emit({ enabledProducts: this.selectedProducts(), enabledInsurers: this.selectedInsurers() });
  }
}

function toggle(ids: string[], id: string, checked: boolean): string[] {
  return checked ? [...new Set([...ids, id])] : ids.filter(x => x !== id);
}
