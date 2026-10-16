import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Insurer, Product } from '@shared';
import { CabinetInsurerInput } from '../../services/settings.service';
import { CatalogPanelComponent } from './catalog-panel.component';

const product = (id: string): Product => ({ id, name: 'Habitation', active: true, questionnaireSchema: [], guaranteeCatalog: [] });

/** Assureur créé avant que son produit soit supprimé : il pointe encore vers l'ancien produit (archivé). */
const INSURER: Insurer = {
  id: 'cab-assureur-a',
  name: 'Assureur Habitation A',
  extranetUrl: 'http://localhost:8091/',
  extranetDomains: ['localhost:8091'],
  productsSupported: ['cab-habitation-old'],
  custom: true,
};

describe('CatalogPanelComponent', () => {
  it("modifier un assureur dont le produit a été supprimé : n'envoie que les produits encore proposés", async () => {
    TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    const fixture = TestBed.createComponent(CatalogPanelComponent);
    // Seul le nouveau produit est proposé : l'ancien, archivé, n'est plus dans la liste.
    fixture.componentRef.setInput('products', [product('cab-habitation-new')]);
    fixture.componentRef.setInput('insurers', [INSURER]);
    await fixture.whenStable();

    const sent: { id: string; insurer: CabinetInsurerInput }[] = [];
    fixture.componentInstance.insurerUpdated.subscribe(event => sent.push(event));
    const panel = fixture.componentInstance as unknown as {
      openForm(insurer: Insurer): void;
      formProducts: { set(ids: string[]): void; (): string[] };
      submit(): void;
    };

    panel.openForm(INSURER);
    // L'ancien produit n'est plus coché en douce.
    expect(panel.formProducts()).toEqual([]);

    panel.formProducts.set(['cab-habitation-new']);
    panel.submit();
    expect(sent).toEqual([{ id: 'cab-assureur-a', insurer: expect.objectContaining({ productsSupported: ['cab-habitation-new'] }) }]);
  });

  it('un assureur du catalogue global peut aussi être modifié et retiré', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    const fixture = TestBed.createComponent(CatalogPanelComponent);
    const global: Insurer = { ...INSURER, id: 'assureur-a', name: 'Assureur A', custom: undefined };
    fixture.componentRef.setInput('insurers', [global]);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[aria-label="Modifier Assureur A"]')).not.toBeNull();
    expect(element.querySelector('.badge')).toBeNull();
    expect(element.querySelectorAll('.danger-text').length).toBe(1);
  });

  it('un produit du catalogue global (Auto) peut aussi être modifié et retiré', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    const fixture = TestBed.createComponent(CatalogPanelComponent);
    fixture.componentRef.setInput('products', [{ ...product('auto'), name: 'Auto' }]);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[aria-label="Modifier Auto"]')).not.toBeNull();
    expect(element.querySelector('[aria-label="Retirer Auto"]')).not.toBeNull();
  });
});
