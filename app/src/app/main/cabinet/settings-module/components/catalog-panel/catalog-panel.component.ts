import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { Insurer, Product } from '@shared';
import { CatalogChoicesModel } from '../../models/catalog-choices.model';
import { SETTINGS_STRUCTURE } from '../settings.structure';

/**
 * L'admin choisit les assureurs et produits actifs de son cabinet. Le catalogue (extranets compris) est publié depuis
 * le dépôt back : il n'est ni complété ni modifié ici.
 */
@Component({
  selector: 'app-catalog-panel',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule],
  template: `
    <section class="card">
      <h2>{{ structure.title }}</h2>
      <p class="hint">{{ structure.hint }}</p>

      <h3>{{ structure.productsTitle }}</h3>
      @for (product of products(); track product.id) {
        <div class="row">
          <mat-checkbox [checked]="selectedProducts().includes(product.id)" (change)="toggleProduct(product.id, $event.checked)">
            {{ product.name }}
          </mat-checkbox>
          <span class="muted">{{ questionCount(product) }} {{ structure.questionsCount }}</span>
        </div>
      } @empty {
        <p class="hint">{{ structure.noProducts }}</p>
      }

      <h3>{{ structure.insurersTitle }}</h3>
      @for (insurer of insurers(); track insurer.id) {
        <div class="row">
          <mat-checkbox [checked]="selectedInsurers().includes(insurer.id)" (change)="toggleInsurer(insurer.id, $event.checked)">
            <span class="insurer">
              @if (insurer.logo) {
                <img class="logo" [src]="insurer.logo" alt="" loading="lazy" />
              } @else {
                <span class="logo initial" aria-hidden="true">{{ insurer.name.charAt(0) }}</span>
              }
              {{ insurer.name }}
            </span>
          </mat-checkbox>
          <span class="muted">{{ insurer.extranetDomains[0] }}</span>
          <span class="spacer"></span>
          <a
            mat-icon-button
            [href]="insurer.extranetUrl"
            target="_blank"
            rel="noopener noreferrer"
            [attr.aria-label]="structure.openExtranet + ' ' + insurer.name"
          >
            <mat-icon>open_in_new</mat-icon>
          </a>
        </div>
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

    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      min-height: 44px;
    }

    .insurer {
      display: inline-flex;
      gap: 10px;
      align-items: center;
    }

    .logo {
      width: 56px;
      height: 28px;
      border-radius: 4px;
      object-fit: contain;
      background: #fff;
    }

    .initial {
      display: inline-grid;
      place-items: center;
      font-weight: 700;
      color: var(--ci-accent-ink);
      background: var(--ci-accent-soft);
    }

    .muted {
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .spacer {
      flex: 1;
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
