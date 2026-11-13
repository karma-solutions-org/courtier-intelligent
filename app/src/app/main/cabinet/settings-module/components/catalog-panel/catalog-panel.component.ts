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
  templateUrl: './catalog-panel.component.html',
  styleUrls: ['../settings.scss', './catalog-panel.component.scss'],
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
