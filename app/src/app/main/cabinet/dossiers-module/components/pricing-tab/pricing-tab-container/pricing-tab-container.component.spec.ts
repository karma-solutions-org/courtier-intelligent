import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { Dossier, Insurer, QuestionnaireSection } from '@shared';
import { of } from 'rxjs';
import { page } from 'vitest/browser';
import { ExtensionStore } from '../../../../../commons/extension-module/store/extension.store';
import { AddInsurersInput, DossierStore } from '../../../store/dossier.store';
import { PricingStore } from '../../../store/pricing.store';
import { AddInsurerDialogPresentationComponent } from '../../add-insurer-dialog/add-insurer-dialog-presentation/add-insurer-dialog-presentation.component';
import { PricingTabContainerComponent } from './pricing-tab-container.component';

const insurer = (id: string, name: string): Insurer => ({
  id,
  name,
  extranetUrl: `https://${id}.example`,
  extranetDomains: [],
  productsSupported: ['auto'],
});

const ALPHA = insurer('alpha', 'Alpha');
const BETA = insurer('beta', 'Beta');
const FROZEN: QuestionnaireSection[] = [
  { title: 'Conducteur', questions: [{ canonicalPath: 'driver.lastName', label: 'Nom', type: 'text', required: true }] },
];

/** Faux DossierStore : seulement ce que l'onglet lit et appelle. */
function fakeDossierStore(status: Dossier['status'], addable: Insurer[]) {
  return {
    dossier: signal({ id: 'd1', productId: 'auto', status, insurerIds: ['alpha'], data: {} } as unknown as Dossier),
    product: signal({ id: 'auto', questionnaireSchema: FROZEN, insurerQuestions: { beta: ['driver.lastName'] } }),
    schema: signal(FROZEN),
    frozenSchema: signal(FROZEN),
    answers: signal({ 'driver.lastName': 'Martin' }),
    insurers: signal([ALPHA, BETA]),
    chosenInsurerIds: signal(['alpha']),
    addableInsurers: signal(addable),
    addingInsurers: signal(false),
    guarantees: signal([]),
    addInsurers: vi.fn(),
  };
}

function fakePricingStore() {
  return {
    canPrice: signal(true),
    error: signal<string | null>(null),
    loaded: signal(true),
    cards: signal([]),
    busy: signal<string[]>([]),
    successMessage: signal<string | null>(null),
    clearSuccess: vi.fn(),
  };
}

describe('PricingTabContainerComponent', () => {
  let dossierStore: ReturnType<typeof fakeDossierStore>;
  let dialog: { open: ReturnType<typeof vi.fn> };

  function open(status: Dossier['status'], addable: Insurer[], result?: AddInsurersInput) {
    dossierStore = fakeDossierStore(status, addable);
    dialog = { open: vi.fn(() => ({ afterClosed: () => of(result) })) };
    TestBed.configureTestingModule({
      providers: [
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: DossierStore, useValue: dossierStore },
        { provide: ExtensionStore, useValue: { status: signal('connected') } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    TestBed.overrideComponent(PricingTabContainerComponent, {
      set: { providers: [{ provide: PricingStore, useValue: fakePricingStore() }] },
    });
    const fixture = TestBed.createComponent(PricingTabContainerComponent);
    return page.elementLocator(fixture.nativeElement);
  }

  it('« Ajouter un assureur » : en tarification, quand un assureur proposé reste à choisir', async () => {
    const root = open('tarification', [BETA]);

    await expect.element(root.getByRole('button', { name: /Ajouter un assureur/ })).toBeVisible();
  });

  it('pas de bouton hors tarification', async () => {
    const root = open('decision', [BETA]);

    await expect.element(root.getByRole('button', { name: /Ajouter un assureur/ })).not.toBeInTheDocument();
  });

  it('pas de bouton quand tous les assureurs proposés sont déjà choisis', async () => {
    const root = open('tarification', []);

    await expect.element(root.getByRole('button', { name: /Ajouter un assureur/ })).not.toBeInTheDocument();
  });

  it('ouvre la boîte de dialogue avec les assureurs à ajouter et le questionnaire figé, puis enregistre le résultat', async () => {
    const result: AddInsurersInput = { insurerIds: ['alpha', 'beta'], patch: { 'vehicle.version': 'GT' } };
    const root = open('tarification', [BETA], result);

    await root.getByRole('button', { name: /Ajouter un assureur/ }).click();

    expect(dialog.open).toHaveBeenCalledWith(
      AddInsurerDialogPresentationComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          candidates: [BETA],
          currentInsurerIds: ['alpha'],
          currentInsurers: [ALPHA],
          frozenSchema: FROZEN,
          productId: 'auto',
          learned: { beta: ['driver.lastName'] },
          answers: { 'driver.lastName': 'Martin' },
        }),
      }),
    );
    await vi.waitFor(() => expect(dossierStore.addInsurers).toHaveBeenCalledWith(result));
  });

  it("boîte de dialogue fermée sans résultat : rien n'est enregistré", async () => {
    const root = open('tarification', [BETA], undefined);

    await root.getByRole('button', { name: /Ajouter un assureur/ }).click();

    expect(dialog.open).toHaveBeenCalled();
    await Promise.resolve();
    expect(dossierStore.addInsurers).not.toHaveBeenCalled();
  });
});
