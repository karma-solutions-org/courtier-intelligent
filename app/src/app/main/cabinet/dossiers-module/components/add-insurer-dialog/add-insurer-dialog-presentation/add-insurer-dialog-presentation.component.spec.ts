import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CanonicalData, Insurer, QuestionnaireSection, schemaWithComplements } from '@shared';
import { page } from 'vitest/browser';
import { AddInsurerDialogData, AddInsurerDialogPresentationComponent } from './add-insurer-dialog-presentation.component';

/** Produit en deux niveaux : un socle, puis des compléments demandés par tel ou tel assureur. */
const PRODUCT_SCHEMA: QuestionnaireSection[] = [
  {
    title: 'Conducteur',
    questions: [
      { canonicalPath: 'driver.lastName', label: 'Nom', type: 'text', required: true, core: true },
      { canonicalPath: 'driver.firstName', label: 'Prénom', type: 'text', required: true },
    ],
  },
  {
    title: 'Véhicule',
    questions: [
      { canonicalPath: 'vehicle.registration', label: 'Immatriculation', type: 'text', required: true },
      { canonicalPath: 'vehicle.version', label: 'Version', type: 'text', required: true },
      { canonicalPath: 'vehicle.brand', label: 'Marque', type: 'text', required: true },
    ],
  },
];

const insurer = (id: string, name: string, questions: string[]): Insurer => ({
  id,
  name,
  extranetUrl: `https://${id}.example`,
  extranetDomains: [],
  productsSupported: ['auto'],
  questions: { auto: questions },
});

const CURRENT = insurer('alpha', 'Alpha', ['vehicle.registration']);
/** Demande la version (sans réponse) et le prénom. */
const BETA = insurer('beta', 'Beta', ['vehicle.version', 'driver.firstName']);
/** Demande la marque, déjà renseignée dans le dossier. */
const GAMMA = insurer('gamma', 'Gamma', ['vehicle.brand']);

const ANSWERS: CanonicalData = {
  'driver.lastName': 'Martin',
  'driver.firstName': 'Léa',
  'vehicle.registration': 'AB-123-CD',
  'vehicle.brand': 'Peugeot',
};

describe('AddInsurerDialogPresentationComponent', () => {
  let close: ReturnType<typeof vi.fn>;

  function open() {
    close = vi.fn();
    const data: AddInsurerDialogData = {
      candidates: [BETA, GAMMA],
      currentInsurerIds: ['alpha'],
      currentInsurers: [CURRENT],
      // Questionnaire figé à la validation de la couverture, avec le seul assureur Alpha.
      frozenSchema: schemaWithComplements(PRODUCT_SCHEMA, [CURRENT], 'auto', {}),
      productSchema: PRODUCT_SCHEMA,
      productId: 'auto',
      learned: {},
      answers: ANSWERS,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(AddInsurerDialogPresentationComponent);
    return page.elementLocator(fixture.nativeElement);
  }

  it('propose les assureurs pas encore choisis, et attend un choix pour continuer', async () => {
    const root = open();

    await expect.element(root.getByRole('checkbox', { name: 'Beta' })).toBeVisible();
    await expect.element(root.getByRole('checkbox', { name: 'Gamma' })).toBeVisible();
    await expect.element(root.getByRole('checkbox', { name: 'Alpha' })).not.toBeInTheDocument();
    await expect.element(root.getByRole('button', { name: 'Suivant' })).toBeDisabled();

    await root.getByRole('checkbox', { name: 'Beta' }).click();

    await expect.element(root.getByRole('button', { name: 'Suivant' })).toBeEnabled();
  });

  it('pose seulement les questions obligatoires ajoutées et sans réponse, puis renvoie assureurs et réponses', async () => {
    const root = open();
    await root.getByRole('checkbox', { name: 'Beta' }).click();
    await root.getByRole('button', { name: 'Suivant' }).click();

    // Le prénom est déjà renseigné : seule la version est demandée.
    await expect.element(root.getByRole('textbox', { name: 'Version *' })).toBeVisible();
    await expect.element(root.getByRole('textbox', { name: 'Prénom *' })).not.toBeInTheDocument();

    // Sans réponse : rien n'est renvoyé, le champ est signalé.
    await root.getByRole('button', { name: 'Ajouter' }).click();
    expect(close).not.toHaveBeenCalled();
    await expect.element(root.getByText('Ce champ est obligatoire')).toBeVisible();

    await root.getByRole('textbox', { name: 'Version *' }).fill('1.2 PureTech');
    await root.getByRole('button', { name: 'Ajouter' }).click();

    expect(close).toHaveBeenCalledWith({
      insurerIds: ['alpha', 'beta'],
      patch: { 'vehicle.version': '1.2 PureTech' },
    });
  });

  it("sans question à poser : « Aucune question supplémentaire. », et l'ajout part sans réponse", async () => {
    const root = open();
    await root.getByRole('checkbox', { name: 'Gamma' }).click();
    await root.getByRole('button', { name: 'Suivant' }).click();

    await expect.element(root.getByText('Aucune question supplémentaire.')).toBeVisible();
    await root.getByRole('button', { name: 'Ajouter' }).click();

    expect(close).toHaveBeenCalledWith({ insurerIds: ['alpha', 'gamma'], patch: {} });
  });

  it('plusieurs assureurs : leurs questions sont réunies, dans l’ordre de la liste proposée', async () => {
    const root = open();
    await root.getByRole('checkbox', { name: 'Gamma' }).click();
    await root.getByRole('checkbox', { name: 'Beta' }).click();
    await root.getByRole('button', { name: 'Suivant' }).click();
    await root.getByRole('textbox', { name: 'Version *' }).fill('GT Line');
    await root.getByRole('button', { name: 'Ajouter' }).click();

    expect(close).toHaveBeenCalledWith({
      insurerIds: ['alpha', 'beta', 'gamma'],
      patch: { 'vehicle.version': 'GT Line' },
    });
  });
});
