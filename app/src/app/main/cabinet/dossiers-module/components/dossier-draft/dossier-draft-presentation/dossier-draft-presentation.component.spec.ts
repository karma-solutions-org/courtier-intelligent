import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Dossier, QuestionnaireSection } from '@shared';
import { page } from 'vitest/browser';
import { DossierDraftPresentationComponent } from './dossier-draft-presentation.component';

const DOSSIER = { id: 'd1', reference: '2026-000001', status: 'brouillon', data: {} } as unknown as Dossier;

const LAST: QuestionnaireSection = {
  title: 'Véhicule',
  questions: [{ canonicalPath: 'vehicle.registration', label: 'Immatriculation', type: 'text', required: true }],
};
const OPTIONAL: QuestionnaireSection = {
  title: 'Informations complémentaires (facultatif)',
  optional: true,
  questions: [{ canonicalPath: 'driver.birthCountry', label: 'Pays de naissance', type: 'text', required: false }],
};

/** L'écran du questionnaire, tel que le container le remplit. */
class DraftTester {
  readonly fixture = TestBed.createComponent(DossierDraftPresentationComponent);
  readonly root = page.elementLocator(this.fixture.nativeElement);
  nextCount = 0;

  constructor() {
    this.fixture.componentInstance.nextRequested.subscribe(() => this.nextCount++);
    this.setInputs({ dossier: DOSSIER, view: 'questionnaire', loaded: true });
  }

  setInputs(inputs: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(inputs)) {
      this.fixture.componentRef.setInput(name, value);
    }
  }
}

describe('DossierDraftPresentationComponent', () => {
  let tester: DraftTester;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    tester = new DraftTester();
  });

  describe('Mesure de la saisie', () => {
    it('affiche le nombre de questions à remplir et, à part, les facultatives', async () => {
      tester.setInputs({ questionCount: { asked: 12, optional: 4 } });

      await expect.element(tester.root.getByText(/12 questions à remplir\s*· 4 facultatives/)).toBeVisible();
    });

    it("ne mentionne pas les facultatives quand il n'y en a pas", async () => {
      tester.setInputs({ questionCount: { asked: 1, optional: 0 } });

      await expect.element(tester.root.getByText('1 question à remplir')).toBeVisible();
      await expect.element(tester.root.getByText(/facultative/)).not.toBeInTheDocument();
    });
  });

  describe('Dernière étape avec la section facultative', () => {
    beforeEach(() =>
      tester.setInputs({ sectionIndex: 1, sectionCount: 2, isLastSection: true, currentSection: [LAST, OPTIONAL] }),
    );

    it('compte les étapes sans la section facultative', async () => {
      await expect.element(tester.root.getByText(/Section 2 sur\s+2/)).toBeVisible();
    });

    it('affiche la section facultative repliée sous la dernière étape', async () => {
      await expect.element(tester.root.getByRole('heading', { name: 'Véhicule' })).toBeVisible();
      await expect
        .element(tester.root.getByRole('button', { name: /Informations complémentaires \(facultatif\)/ }))
        .toHaveAttribute('aria-expanded', 'false');
      await expect.element(tester.root.getByRole('textbox', { name: 'Pays de naissance' })).not.toBeInTheDocument();
    });

    it('« Terminer le dossier » se clique sans ouvrir la section facultative', async () => {
      await tester.root.getByRole('button', { name: 'Terminer le dossier' }).click();

      expect(tester.nextCount).toBe(1);
    });
  });
});
