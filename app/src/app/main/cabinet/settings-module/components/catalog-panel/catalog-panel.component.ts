import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { Insurer, parseExtranetUrl, Product } from '@shared';
import { CatalogChoicesModel } from '../../models/catalog-choices.model';
import { CabinetInsurerInput, CabinetProductInput } from '../../services/settings.service';
import { ProductEditorComponent } from '../product-editor/product-editor.component';
import { SETTINGS_STRUCTURE } from '../settings.structure';

/**
 * L'admin choisit les assureurs et produits actifs de son cabinet parmi ceux du catalogue global,
 * et peut ajouter, modifier ou retirer ses propres assureurs (absents du catalogue).
 */
@Component({
  selector: 'app-catalog-panel',
  imports: [NgTemplateOutlet, MatButtonModule, MatCheckboxModule, MatIconModule, ProductEditorComponent],
  template: `
    <section class="card">
      <h2>{{ structure.title }}</h2>
      <p class="hint">{{ structure.hint }}</p>

      <div class="insurers-head">
        <h3>{{ structure.productsTitle }}</h3>
        @if (!creatingProduct() && !editingProduct()) {
          <button mat-stroked-button type="button" (click)="openProductForm()">
            <mat-icon>add</mat-icon>{{ structure.addProduct }}
          </button>
        }
      </div>

      @if (creatingProduct()) {
        <form class="insurer-form" (submit)="$event.preventDefault(); createProduct()" novalidate>
          <p class="form-title">{{ structure.addProduct }}</p>
          <label>
            <span>{{ structure.productName }}</span>
            <input type="text" maxlength="60" placeholder="Habitation, Santé, Multirisque pro…" [value]="productName()" (input)="productName.set($any($event.target).value)" />
          </label>
          <label>
            <span>{{ structure.productBase }}</span>
            <select class="select" [value]="productBase()" (change)="productBase.set($any($event.target).value)">
              <option value="">{{ structure.productBlank }}</option>
              @for (product of products(); track product.id) {
                <option [value]="product.id">{{ structure.productCopyOf }} {{ product.name }}</option>
              }
            </select>
            <small>{{ structure.productBaseHint }}</small>
          </label>
          @if (productSubmitted() && productName().trim().length < 2) {
            <p class="error" role="alert">{{ structure.errors.productName }}</p>
          }
          <div class="form-actions">
            <button mat-button type="button" (click)="creatingProduct.set(false)">{{ structure.cancel }}</button>
            <button mat-flat-button class="ci-cta" type="submit" [disabled]="isPending()">{{ structure.createProduct }}</button>
          </div>
        </form>
      }

      @for (product of products(); track product.id) {
        @if (editingProduct() === product.id) {
          <app-product-editor
            [product]="product"
            [isPending]="isPending()"
            (saved)="productUpdated.emit($event); editingProduct.set(null)"
            (cancelled)="editingProduct.set(null)"
          />
        } @else {
          <div class="insurer-row">
            <mat-checkbox [checked]="selectedProducts().includes(product.id)" (change)="toggleProduct(product.id, $event.checked)">
              {{ product.name }}
            </mat-checkbox>
            @if (product.custom) {
              <span class="badge">{{ structure.customBadge }}</span>
            }
            <span class="domain">{{ questionCount(product) }} {{ structure.questionsCount }}</span>
            <span class="spacer"></span>
            <!-- Tous les produits : un produit du catalogue modifié ou retiré l'est pour ce cabinet seulement. -->
            @if (confirmingArchive() === product.id) {
              <span class="confirm">
                {{ structure.archiveProductConfirm }}
                <button mat-button type="button" (click)="confirmingArchive.set(null)">{{ structure.cancel }}</button>
                <button mat-flat-button class="danger" type="button" [disabled]="isPending()" (click)="archiveProduct(product.id)">
                  {{ structure.archive }}
                </button>
              </span>
            } @else {
              <button mat-icon-button type="button" [attr.aria-label]="structure.edit + ' ' + product.name" (click)="openProductEditor(product.id)">
                <mat-icon>edit</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                class="danger-text"
                [attr.aria-label]="structure.archive + ' ' + product.name"
                (click)="confirmingArchive.set(product.id)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            }
          </div>
        }
      } @empty {
        <p class="hint">{{ structure.noProducts }}</p>
      }

      <div class="insurers-head">
        <h3>{{ structure.insurersTitle }}</h3>
        @if (editing() === null) {
          <button mat-stroked-button type="button" (click)="openForm(null)">
            <mat-icon>add</mat-icon>{{ structure.addInsurer }}
          </button>
        }
      </div>

      @if (editing() === 'new') {
        <ng-container *ngTemplateOutlet="form" />
      }

      @for (insurer of insurers(); track insurer.id) {
        @if (editing() === insurer.id) {
          <ng-container *ngTemplateOutlet="form" />
        } @else {
          <div class="insurer-row">
            <mat-checkbox [checked]="selectedInsurers().includes(insurer.id)" (change)="toggleInsurer(insurer.id, $event.checked)">
              {{ insurer.name }}
            </mat-checkbox>
            @if (insurer.custom) {
              <span class="badge">{{ structure.customBadge }}</span>
            }
            <span class="domain">{{ insurer.extranetDomains[0] }}</span>
            <span class="spacer"></span>
            <!-- Tous les assureurs : un assureur du catalogue modifié ou retiré l'est pour ce cabinet seulement. -->
            @if (confirmingArchive() === insurer.id) {
              <span class="confirm">
                {{ structure.archiveConfirm }}
                <button mat-button type="button" (click)="confirmingArchive.set(null)">{{ structure.cancel }}</button>
                <button mat-flat-button class="danger" type="button" [disabled]="isPending()" (click)="archive(insurer.id)">
                  {{ structure.archive }}
                </button>
              </span>
            } @else {
              <button mat-icon-button type="button" [attr.aria-label]="structure.edit + ' ' + insurer.name" (click)="openForm(insurer)">
                <mat-icon>edit</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                class="danger-text"
                [attr.aria-label]="structure.archive + ' ' + insurer.name"
                (click)="confirmingArchive.set(insurer.id)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            }
          </div>
        }
      } @empty {
        <p class="hint">{{ structure.noInsurers }}</p>
      }

      <div class="actions">
        <button mat-flat-button type="button" [disabled]="isPending()" (click)="save()">{{ structure.save }}</button>
      </div>
    </section>

    <ng-template #form>
      <form class="insurer-form" (submit)="$event.preventDefault(); submit()" novalidate>
        <p class="form-title">{{ editing() === 'new' ? structure.addInsurer : structure.editInsurer }}</p>

        <label>
          <span>{{ structure.insurerName }}</span>
          <input type="text" maxlength="80" [value]="name()" (input)="name.set($any($event.target).value)" />
        </label>

        <label>
          <span>{{ structure.extranetUrl }}</span>
          <input
            type="text" inputmode="url"
            placeholder="https://extranet.assureur.fr"
            [value]="url()"
            (input)="url.set($any($event.target).value)"
          />
          <small>{{ structure.extranetHint }}</small>
        </label>

        <fieldset>
          <legend>{{ structure.insurerProducts }}</legend>
          @for (product of products(); track product.id) {
            <mat-checkbox
              [checked]="formProducts().includes(product.id)"
              (change)="formProducts.set(toggle(formProducts(), product.id, $event.checked))"
            >
              {{ product.name }}
            </mat-checkbox>
          }
        </fieldset>

        @if (formError(); as error) {
          <p class="error" role="alert">{{ error }}</p>
        }

        <div class="form-actions">
          <button mat-button type="button" (click)="closeForm()">{{ structure.cancel }}</button>
          <button mat-flat-button class="ci-cta" type="submit" [disabled]="isPending()">
            {{ editing() === 'new' ? structure.addInsurer : structure.save }}
          </button>
        </div>
      </form>
    </ng-template>
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

    .insurers-head {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
    }

    .insurer-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      min-height: 44px;

      mat-checkbox {
        display: inline-block;
      }
    }

    .badge {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      color: var(--ci-accent-ink);
      background: var(--ci-accent-soft);
    }

    .domain {
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .spacer {
      flex: 1;
    }

    .confirm {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      font-size: 13px;
    }

    .danger-text {
      color: var(--ci-danger);
    }

    .danger {
      --mat-button-filled-container-color: var(--ci-danger);
      --mat-button-filled-label-text-color: #fff;
    }

    .insurer-form {
      display: grid;
      gap: 12px;
      max-width: 560px;
      margin: 8px 0 16px;
      padding: 16px;
      border: 1px solid var(--ci-border);
      border-radius: 12px;
      background: var(--ci-surface-2);

      label {
        display: grid;
        gap: 4px;
        font-size: 13px;
        font-weight: 600;
      }

      input,
      .select {
        height: 40px;
        padding: 0 12px;
        border: 1px solid var(--ci-border);
        border-radius: 8px;
        background: var(--ci-surface);
        font: inherit;
        font-weight: 400;

        &:focus {
          border-color: var(--ci-accent);
          outline: none;
          box-shadow: 0 0 0 3px var(--ci-accent-soft);
        }
      }

      small {
        font-weight: 400;
        color: var(--ci-text-muted);
      }

      fieldset {
        margin: 0;
        padding: 0;
        border: none;
      }

      legend {
        margin-bottom: 4px;
        font-size: 13px;
        font-weight: 600;
      }
    }

    .form-title {
      margin: 0;
      font-weight: 700;
    }

    .error {
      margin: 0;
      font-size: 13px;
      color: var(--ci-danger);
    }

    .form-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
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
  readonly insurerAdded = output<CabinetInsurerInput>();
  readonly insurerUpdated = output<{ id: string; insurer: CabinetInsurerInput }>();
  readonly insurerArchived = output<string>();
  readonly productCreated = output<{ name: string; baseProductId: string | null }>();
  readonly productUpdated = output<CabinetProductInput>();
  readonly productArchived = output<string>();

  protected readonly structure = SETTINGS_STRUCTURE.catalog;

  /** Sélection en cours d'édition : repart des choix du cabinet quand ils changent. */
  protected readonly selectedProducts = linkedSignal(() => this.enabledProducts());
  protected readonly selectedInsurers = linkedSignal(() => this.enabledInsurers());

  /** Formulaire d'assureur : « new » pour un ajout, l'identifiant pour une modification, null fermé. */
  protected readonly editing = signal<string | null>(null);
  protected readonly confirmingArchive = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly url = signal('');
  protected readonly formProducts = signal<string[]>([]);
  protected readonly submitted = signal(false);

  /** Erreur du formulaire, affichée après une première tentative d'envoi. */
  protected readonly formError = computed(() => {
    if (!this.submitted()) return null;
    const name = this.name().trim();
    if (name.length < 2) return this.structure.errors.name;
    if (!parseExtranetUrl(withScheme(this.url()))) return this.structure.errors.url;
    if (!this.formProducts().length) return this.structure.errors.products;
    return null;
  });

  /** Produits du cabinet : formulaire de création, éditeur ouvert (identifiant) et brouillon de création. */
  protected readonly creatingProduct = signal(false);
  protected readonly editingProduct = signal<string | null>(null);
  protected readonly productName = signal('');
  protected readonly productBase = signal('');
  protected readonly productSubmitted = signal(false);

  protected openProductForm(): void {
    this.closeForm();
    this.confirmingArchive.set(null);
    this.productName.set('');
    this.productBase.set('');
    this.productSubmitted.set(false);
    this.creatingProduct.set(true);
  }

  protected createProduct(): void {
    this.productSubmitted.set(true);
    const name = this.productName().trim();
    if (name.length < 2) return;
    this.productCreated.emit({ name, baseProductId: this.productBase() || null });
    this.creatingProduct.set(false);
  }

  protected openProductEditor(id: string): void {
    this.creatingProduct.set(false);
    this.confirmingArchive.set(null);
    this.editingProduct.set(id);
  }

  protected archiveProduct(id: string): void {
    this.confirmingArchive.set(null);
    this.productArchived.emit(id);
  }

  protected questionCount(product: Product): number {
    return product.questionnaireSchema.reduce((count, section) => count + section.questions.length, 0);
  }

  protected toggleProduct(id: string, checked: boolean): void {
    this.selectedProducts.update(ids => toggle(ids, id, checked));
  }

  protected toggleInsurer(id: string, checked: boolean): void {
    this.selectedInsurers.update(ids => toggle(ids, id, checked));
  }

  protected save(): void {
    this.saved.emit({ enabledProducts: this.selectedProducts(), enabledInsurers: this.selectedInsurers() });
  }

  protected openForm(insurer: Insurer | null): void {
    this.confirmingArchive.set(null);
    this.creatingProduct.set(false);
    this.editingProduct.set(null);
    this.submitted.set(false);
    this.editing.set(insurer?.id ?? 'new');
    this.name.set(insurer?.name ?? '');
    this.url.set(insurer?.extranetUrl ?? '');
    // Par défaut, un nouvel assureur tarifie les produits actifs du cabinet. Un produit supprimé depuis (archivé, donc
    // absent de la liste) est retiré : invisible, il resterait coché et le serveur refuserait l'enregistrement.
    const available = new Set(this.products().map(product => product.id));
    this.formProducts.set((insurer?.productsSupported ?? this.selectedProducts()).filter(id => available.has(id)));
  }

  protected closeForm(): void {
    this.editing.set(null);
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.formError()) return;
    const insurer: CabinetInsurerInput = {
      name: this.name().trim(),
      extranetUrl: withScheme(this.url()),
      productsSupported: this.formProducts(),
    };
    const editing = this.editing();
    if (editing === 'new') {
      this.insurerAdded.emit(insurer);
    } else if (editing) {
      this.insurerUpdated.emit({ id: editing, insurer });
    }
    this.closeForm();
  }

  protected archive(id: string): void {
    this.confirmingArchive.set(null);
    this.insurerArchived.emit(id);
  }

  protected readonly toggle = toggle;
}

function toggle(ids: string[], id: string, checked: boolean): string[] {
  return checked ? [...new Set([...ids, id])] : ids.filter(x => x !== id);
}

/**
 * Adresse saisie sans protocole (« extranet.assureur.fr », « localhost:8091 ») : https:// est ajouté, http:// pour un
 * serveur local (démo). Le port est conservé (hôte[:port]).
 */
export function withScheme(raw: string): string {
  const value = raw.trim();
  if (!value || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);
  return `${local ? 'http' : 'https'}://${value}`;
}
