import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { CanonicalPath, Dossier, QuestionnaireSection } from '@shared';
import { page } from 'vitest/browser';
import { DossierStore } from '../../../store/dossier.store';
import { DossierDraftContainerComponent } from './dossier-draft-container.component';

const SCHEMA: QuestionnaireSection[] = [
  {
    title: 'Conducteur',
    questions: [{ canonicalPath: 'driver.lastName', label: 'Nom', type: 'text', required: true }],
  },
  {
    title: 'Véhicule',
    questions: [{ canonicalPath: 'vehicle.registration', label: 'Immatriculation', type: 'text', required: true }],
  },
  {
    title: 'Informations complémentaires (facultatif)',
    optional: true,
    questions: [
      { canonicalPath: 'driver.birthCountry', label: 'Pays de naissance', type: 'text', required: false },
      { canonicalPath: 'vehicle.model', label: 'Modèle', type: 'text', required: false },
    ],
  },
];

/** Faux DossierStore : seulement ce que le brouillon lit et appelle. */
function fakeStore(sectionIndex: number, status: Dossier['status']) {
  return {
    dossier: signal({ id: 'd1', reference: '2026-000001', status, data: {} } as unknown as Dossier),
    editable: signal(true),
    product: signal(null),
    loaded: signal(true),
    error: signal<string | null>(null),
    notice: signal(null),
    saveStatus: signal('idle'),
    clientPiecesReading: signal(false),
    availableInsurers: signal([]),
    selectedInsurers: signal<string[]>([]),
    sectionIndex: signal(sectionIndex),
    schema: signal(SCHEMA),
    missing: signal<CanonicalPath[]>([]),
    answers: signal({}),
    hasPendingEdits: () => false,
    select: vi.fn(),
    setAutosave: vi.fn(),
    clearMessages: vi.fn(),
    clearNotice: vi.fn(),
    takeClientPieces: vi.fn(),
    selectInsurers: vi.fn(),
    edit: vi.fn(),
    goToSection: vi.fn(),
    saveNow: vi.fn(),
    changeStatus: vi.fn(),
  };
}

describe('DossierDraftContainerComponent', () => {
  let store: ReturnType<typeof fakeStore>;

  /** Ouvre le brouillon au questionnaire, à l'étape enregistrée (un brouillon à l'étape 0 s'ouvrirait aux extranets). */
  function open(sectionIndex: number, status: Dossier['status'] = 'brouillon') {
    store = fakeStore(sectionIndex, status);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: DossierStore, useValue: store },
      ],
    });
    const fixture = TestBed.createComponent(DossierDraftContainerComponent);
    fixture.componentRef.setInput('id', 'd1');
    return page.elementLocator(fixture.nativeElement);
  }

  it("la section facultative n'est pas une étape : elle est repliée sous la dernière", async () => {
    const root = open(1);

    await expect.element(root.getByText(/Section 2 sur\s+2/)).toBeVisible();
    await expect.element(root.getByRole('heading', { name: 'Véhicule' })).toBeVisible();
    await expect
      .element(root.getByRole('button', { name: /Informations complémentaires \(facultatif\)/ }))
      .toHaveAttribute('aria-expanded', 'false');
    await expect.element(root.getByText(/2 questions à remplir\s*· 2 facultatives/)).toBeVisible();
  });

  it('une étape intermédiaire ne montre pas la section facultative', async () => {
    const root = open(0, 'complet');

    await expect.element(root.getByRole('heading', { name: 'Conducteur' })).toBeVisible();
    await expect.element(root.getByRole('button', { name: /Informations complémentaires/ })).not.toBeInTheDocument();
    await expect.element(root.getByRole('button', { name: 'Suivant' })).toBeVisible();
  });

  it('« Terminer le dossier » passe le dossier en complet sans ouvrir la section facultative', async () => {
    const root = open(1);

    await root.getByRole('button', { name: 'Terminer le dossier' }).click();

    expect(store.changeStatus).toHaveBeenCalledWith('complet');
  });

  it("une reprise enregistrée au-delà des étapes revient à la dernière étape (pas à la section facultative)", async () => {
    const root = open(2);

    await expect.element(root.getByText(/Section 2 sur\s+2/)).toBeVisible();
    await expect.element(root.getByRole('heading', { name: 'Véhicule' })).toBeVisible();
  });
});
