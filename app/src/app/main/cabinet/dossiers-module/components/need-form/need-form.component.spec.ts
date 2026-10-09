import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { DossierStatus, Guarantee, NeedAnalysis, NeedInput, NeedSuggestion } from '@shared';
import { page, userEvent } from 'vitest/browser';
import { NeedFormComponent } from './need-form.component';

const GUARANTEES: Guarantee[] = [
  { code: 'RC', label: 'Responsabilité civile', type: 'included' },
  { code: 'VOL', label: 'Vol', type: 'deductible' },
  { code: 'ASS', label: 'Assistance', type: 'included' },
];

const SUGGESTION: NeedSuggestion = {
  coverageLevel: 'tous_risques',
  mandatoryGuarantees: ['RC', 'VOL'],
  niceToHave: ['ASS'],
  reasons: ['Véhicule récent (2 ans) : une couverture tous risques protège sa valeur.'],
};

const savedNeed = (overrides: Partial<NeedAnalysis> = {}): NeedAnalysis => ({
  coverageLevel: 'tiers_plus',
  budgetMax: 600,
  maxDeductible: null,
  mandatoryGuarantees: ['RC'],
  niceToHave: [],
  notes: null,
  validatedAt: null,
  ...overrides,
});

/** Le formulaire du besoin, tel que le courtier le remplit. */
class NeedFormTester {
  readonly fixture = TestBed.createComponent(NeedFormComponent);
  readonly root = page.elementLocator(this.fixture.nativeElement);

  readonly budget = this.root.getByRole('spinbutton', { name: 'Budget maximum (€ par an)' });
  readonly deductible = this.root.getByRole('spinbutton', { name: 'Franchise maximum (€)' });
  readonly notes = this.root.getByRole('textbox', { name: 'Notes' });
  readonly save = this.root.getByRole('button', { name: 'Enregistrer le besoin' });
  readonly validate = this.root.getByRole('button', { name: 'Valider le besoin' });
  readonly applySuggestion = this.root.getByRole('button', { name: 'Appliquer les suggestions' });

  readonly savedNeeds: NeedInput[] = [];
  validations = 0;

  constructor() {
    const component = this.fixture.componentInstance;
    component.saved.subscribe(need => this.savedNeeds.push(need));
    component.validated.subscribe(() => (this.validations += 1));
    this.fixture.componentRef.setInput('guarantees', GUARANTEES);
  }

  setInputs(inputs: {
    need?: NeedAnalysis | null;
    suggestion?: NeedSuggestion | null;
    status?: DossierStatus;
    readonly?: boolean;
  }): void {
    for (const [name, value] of Object.entries(inputs)) {
      this.fixture.componentRef.setInput(name, value);
    }
  }
}

describe('NeedFormComponent', () => {
  let tester: NeedFormTester;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    tester = new NeedFormTester();
  });

  it("enregistre le besoin saisi : montants numériques (0 compris), notes nettoyées, champs vides à null", async () => {
    await tester.budget.fill('650');
    await tester.deductible.fill('0');
    await tester.notes.fill('  Client sensible au prix  ');
    await tester.save.click();

    expect(tester.savedNeeds).toEqual([
      {
        coverageLevel: null,
        budgetMax: 650,
        maxDeductible: 0,
        mandatoryGuarantees: [],
        niceToHave: [],
        notes: 'Client sensible au prix',
      },
    ]);
  });

  it("ne propose d'enregistrer qu'après une modification", async () => {
    tester.setInputs({ need: savedNeed() });

    await expect.element(tester.save).toBeDisabled();
    await tester.budget.fill('700');
    await expect.element(tester.save).toBeEnabled();
  });

  it('affiche le besoin enregistré', async () => {
    tester.setInputs({ need: savedNeed({ budgetMax: 600, notes: 'RAS' }) });

    await expect.element(tester.budget).toHaveValue(600);
    await expect.element(tester.notes).toHaveValue('RAS');
    await expect.element(tester.root.getByText(/Besoin enregistré : il reste à le valider/)).toBeVisible();
  });

  it('refuse un montant négatif', async () => {
    await tester.budget.fill('-5');
    await tester.save.click();

    await expect.element(tester.root.getByText('Montant positif attendu').first()).toBeVisible();
    expect(tester.savedNeeds).toEqual([]);
  });

  describe('Suggestions', () => {
    it('affiche pourquoi elles sont proposées, et les applique au formulaire sans les enregistrer', async () => {
      tester.setInputs({ suggestion: SUGGESTION });

      await expect.element(tester.root.getByText(/Véhicule récent \(2 ans\)/)).toBeVisible();
      await tester.applySuggestion.click();

      // Pas enregistré tant que le courtier ne le décide pas, et modifiable avant.
      expect(tester.savedNeeds).toEqual([]);
      await tester.budget.fill('800');
      await tester.save.click();

      expect(tester.savedNeeds[0]).toMatchObject({
        coverageLevel: 'tous_risques',
        budgetMax: 800,
        mandatoryGuarantees: ['RC', 'VOL'],
        niceToHave: ['ASS'],
      });
    });

    it('ne suggère ni budget ni franchise', async () => {
      tester.setInputs({ suggestion: SUGGESTION });
      await tester.applySuggestion.click();

      await expect.element(tester.budget).toHaveValue(null);
      await expect.element(tester.deductible).toHaveValue(null);
    });

    it("n'affiche rien sans suggestion, ni en consultation seule", async () => {
      await expect.element(tester.applySuggestion).not.toBeInTheDocument();

      tester.setInputs({ suggestion: SUGGESTION, readonly: true });
      await expect.element(tester.applySuggestion).not.toBeInTheDocument();
    });
  });

  describe('Garanties', () => {
    it('une garantie indispensable disparaît des garanties souhaitées', async () => {
      tester.setInputs({ need: savedNeed({ mandatoryGuarantees: [], niceToHave: ['VOL'] }) });

      await tester.root.getByRole('combobox', { name: 'Garanties indispensables' }).click();
      await page.getByRole('option', { name: 'Vol' }).click();
      await userEvent.keyboard('{Escape}');
      await tester.save.click();

      const saved = tester.savedNeeds[0];
      expect(saved.mandatoryGuarantees).toContain('VOL');
      expect(saved.niceToHave).not.toContain('VOL');
    });
  });

  describe('Validation du besoin', () => {
    it("ne peut pas être validé sans besoin enregistré ni niveau de couverture", async () => {
      await expect.element(tester.validate).toBeDisabled();
      await expect.element(tester.root.getByText('Choisissez un niveau de couverture pour pouvoir valider.')).toBeVisible();

      tester.setInputs({ need: savedNeed({ coverageLevel: null }) });
      await expect.element(tester.validate).toBeDisabled();
    });

    it("se valide quand le besoin enregistré a une couverture et que la saisie est enregistrée", async () => {
      tester.setInputs({ need: savedNeed() });

      await tester.validate.click();

      expect(tester.validations).toBe(1);
    });

    it("demande d'enregistrer avant de valider quand le formulaire a été modifié", async () => {
      tester.setInputs({ need: savedNeed() });
      await tester.budget.fill('900');

      await expect.element(tester.validate).toBeDisabled();
      await expect.element(tester.root.getByText('Enregistrez le besoin avant de le valider.')).toBeVisible();
    });

    it('un besoin validé affiche sa date et prévient que le modifier annule la validation', async () => {
      tester.setInputs({
        need: savedNeed({ validatedAt: { toMillis: () => new Date('2026-10-09T10:00:00').getTime() } }),
        status: 'besoin_valide',
      });

      await expect.element(tester.root.getByText(/Besoin validé le/)).toBeVisible();
      await expect.element(tester.root.getByText(/annule sa validation/)).toBeVisible();
      await expect.element(tester.validate).not.toBeInTheDocument();
    });
  });

  it('est consultable seulement au-delà de l’analyse du besoin', async () => {
    tester.setInputs({ need: savedNeed(), readonly: true, status: 'tarification' });

    await expect.element(tester.root.getByText(/consultable seulement/)).toBeVisible();
    await expect.element(tester.budget).toBeDisabled();
    await expect.element(tester.save).not.toBeInTheDocument();
  });
});
