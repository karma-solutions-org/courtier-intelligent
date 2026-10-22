import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Insurer, Product } from '@shared';
import { CatalogChoicesModel } from '../../models/catalog-choices.model';
import { CatalogPanelComponent } from './catalog-panel.component';

const PRODUCT: Product = { id: 'auto', name: 'Auto', active: true, questionnaireSchema: [], guaranteeCatalog: [] };

const ALLIANZ: Insurer = {
  id: 'allianz',
  name: 'Allianz',
  logo: 'insurers/allianz.webp',
  extranetUrl: 'https://authentification-courtage.allianz.fr/am/XUI/?realm=courtiers',
  extranetDomains: ['authentification-courtage.allianz.fr'],
  productsSupported: ['auto'],
};

async function setup() {
  TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
  const fixture = TestBed.createComponent(CatalogPanelComponent);
  fixture.componentRef.setInput('products', [PRODUCT]);
  fixture.componentRef.setInput('insurers', [ALLIANZ, { ...ALLIANZ, id: 'luxior', name: 'Luxior', logo: null }]);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('CatalogPanelComponent', () => {
  it("le catalogue est en lecture seule : ni ajout, ni modification, ni retrait d'assureur ou de produit", async () => {
    const { element } = await setup();
    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('[aria-label^="Modifier"]')).toBeNull();
    expect(element.querySelector('[aria-label^="Retirer"]')).toBeNull();
    expect(element.textContent).not.toContain('Ajouter un assureur');
    expect(element.textContent).not.toContain('Nouveau produit');
  });

  it("chaque assureur affiche son logo (ou son initiale) et un lien vers son extranet", async () => {
    const { element } = await setup();
    expect(element.querySelector<HTMLImageElement>('img.logo')?.getAttribute('src')).toBe('insurers/allianz.webp');
    expect(element.querySelector('.initial')?.textContent?.trim()).toBe('L');
    const link = element.querySelector<HTMLAnchorElement>('[aria-label="Ouvrir l\'extranet de Allianz"]');
    expect(link?.href).toBe(ALLIANZ.extranetUrl);
    expect(link?.rel).toBe('noopener noreferrer');
  });

  it("n'enregistre que les choix encore au catalogue (un assureur ou produit retiré est oublié)", async () => {
    const { fixture } = await setup();
    fixture.componentRef.setInput('enabledInsurers', ['allianz', 'assureur-a']);
    fixture.componentRef.setInput('enabledProducts', ['auto', 'habitation']);
    await fixture.whenStable();

    const sent: CatalogChoicesModel[] = [];
    fixture.componentInstance.saved.subscribe(choices => sent.push(choices));
    (fixture.componentInstance as unknown as { save(): void }).save();

    expect(sent).toEqual([{ enabledInsurers: ['allianz'], enabledProducts: ['auto'] }]);
  });
});
