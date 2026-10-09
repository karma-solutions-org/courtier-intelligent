import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { CanonicalData, QuestionnaireSection } from '@shared';
import { page } from 'vitest/browser';
import { AnswerChange, QuestionnaireFormComponent } from './questionnaire-form.component';

/** Un petit questionnaire qui couvre chaque type de question, une condition et un champ avec niveau de connaissance. */
const SCHEMA: QuestionnaireSection[] = [
  {
    title: 'Véhicule',
    questions: [
      { canonicalPath: 'vehicle.registration', label: 'Immatriculation', type: 'text', required: true },
      { canonicalPath: 'vehicle.fiscalPower', label: 'Puissance fiscale', type: 'number', required: true },
      { canonicalPath: 'vehicle.firstRegistrationDate', label: 'Mise en circulation', type: 'date', required: false },
      {
        canonicalPath: 'vehicle.usage',
        label: 'Usage',
        type: 'choice',
        required: true,
        choices: [
          { value: 'prive', label: 'Privé' },
          { value: 'professionnel', label: 'Professionnel' },
        ],
      },
    ],
  },
  {
    title: 'Historique',
    questions: [
      { canonicalPath: 'insuranceHistory.currentlyInsured', label: 'Actuellement assuré', type: 'boolean', required: true },
      {
        canonicalPath: 'insuranceHistory.previousInsurer',
        label: 'Assureur actuel',
        type: 'text',
        required: true,
        visibleIf: { path: 'insuranceHistory.currentlyInsured', equals: true },
      },
      { canonicalPath: 'insuranceHistory.claimsCount', label: 'Sinistres', type: 'number', required: true, withKnowledge: true },
    ],
  },
];

/** Le formulaire généré, tel que le courtier le remplit. */
class QuestionnaireTester {
  readonly fixture = TestBed.createComponent(QuestionnaireFormComponent);
  readonly root = page.elementLocator(this.fixture.nativeElement);
  readonly changes: AnswerChange[] = [];

  constructor() {
    this.fixture.componentInstance.answerChanged.subscribe(change => this.changes.push(change));
    this.setInputs({ sections: SCHEMA });
  }

  setInputs(inputs: { sections?: QuestionnaireSection[]; data?: CanonicalData; readonly?: boolean; showMissing?: boolean }): void {
    for (const [name, value] of Object.entries(inputs)) {
      this.fixture.componentRef.setInput(name, value);
    }
  }
}

describe('QuestionnaireFormComponent', () => {
  let tester: QuestionnaireTester;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    tester = new QuestionnaireTester();
  });

  it('génère une section par bloc du JSON, avec ses questions et la marque des champs obligatoires', async () => {
    await expect.element(tester.root.getByRole('heading', { name: 'Véhicule' })).toBeVisible();
    await expect.element(tester.root.getByRole('heading', { name: 'Historique' })).toBeVisible();
    await expect.element(tester.root.getByRole('textbox', { name: 'Immatriculation *' })).toBeVisible();
    await expect.element(tester.root.getByRole('spinbutton', { name: 'Puissance fiscale *' })).toBeVisible();
    // Facultatif : pas d'astérisque.
    await expect.element(tester.root.getByLabelText('Mise en circulation', { exact: true })).toBeVisible();
  });

  it('affiche la réponse déjà enregistrée', async () => {
    tester.setInputs({ data: { 'vehicle.registration': 'AB-123-CD', 'vehicle.fiscalPower': 0 } });

    await expect.element(tester.root.getByRole('textbox', { name: 'Immatriculation *' })).toHaveValue('AB-123-CD');
    await expect.element(tester.root.getByRole('spinbutton', { name: 'Puissance fiscale *' })).toHaveValue(0);
  });

  it('émet le texte saisi, et `null` quand le champ est vidé', async () => {
    const field = tester.root.getByRole('textbox', { name: 'Immatriculation *' });

    await field.fill('AB-123-CD');
    expect(tester.changes.at(-1)).toEqual({ path: 'vehicle.registration', value: 'AB-123-CD' });

    await field.fill('');
    expect(tester.changes.at(-1)).toEqual({ path: 'vehicle.registration', value: null });
  });

  it('émet un nombre, y compris 0, et `null` quand le champ est vidé', async () => {
    const field = tester.root.getByRole('spinbutton', { name: 'Puissance fiscale *' });

    await field.fill('0');
    expect(tester.changes.at(-1)).toEqual({ path: 'vehicle.fiscalPower', value: 0 });

    await field.fill('');
    expect(tester.changes.at(-1)).toEqual({ path: 'vehicle.fiscalPower', value: null });
  });

  it('émet la valeur d’un choix', async () => {
    await tester.root.getByRole('combobox', { name: 'Usage *' }).click();
    await page.getByRole('option', { name: 'Professionnel' }).click();

    expect(tester.changes.at(-1)).toEqual({ path: 'vehicle.usage', value: 'professionnel' });
  });

  it('émet oui / non pour une question booléenne', async () => {
    await tester.root.getByRole('radio', { name: 'Non' }).click();

    expect(tester.changes.at(-1)).toEqual({ path: 'insuranceHistory.currentlyInsured', value: false });
  });

  describe('Questions conditionnelles', () => {
    it("n'affiche la question que si la condition est remplie", async () => {
      await expect.element(tester.root.getByRole('textbox', { name: 'Assureur actuel *' })).not.toBeInTheDocument();

      tester.setInputs({ data: { 'insuranceHistory.currentlyInsured': false } });
      await expect.element(tester.root.getByRole('textbox', { name: 'Assureur actuel *' })).not.toBeInTheDocument();

      tester.setInputs({ data: { 'insuranceHistory.currentlyInsured': true } });
      await expect.element(tester.root.getByRole('textbox', { name: 'Assureur actuel *' })).toBeVisible();
    });
  });

  describe('Niveau de connaissance', () => {
    const claims = () => tester.root.getByRole('radiogroup', { name: 'Sinistres' });

    it("n'affiche le nombre qu'une fois « Valeur connue » choisi, et émet valeur + niveau", async () => {
      await expect.element(tester.root.getByRole('spinbutton', { name: 'Sinistres' })).not.toBeInTheDocument();

      await claims().getByRole('radio', { name: 'Valeur connue' }).click();
      await tester.root.getByRole('spinbutton', { name: 'Sinistres' }).fill('2');

      expect(tester.changes.at(-1)).toEqual({ path: 'insuranceHistory.claimsCount', value: { value: 2, knowledge: 'KNOWN' } });
    });

    it("« L'assuré ne sait pas » est une réponse sans valeur", async () => {
      await claims().getByRole('radio', { name: "L'assuré ne sait pas" }).click();

      expect(tester.changes.at(-1)).toEqual({
        path: 'insuranceHistory.claimsCount',
        value: { value: null, knowledge: 'DECLARED_UNKNOWN' },
      });
    });

    it('« À vérifier » enregistre un niveau inconnu', async () => {
      await claims().getByRole('radio', { name: 'À vérifier' }).click();

      expect(tester.changes.at(-1)).toEqual({ path: 'insuranceHistory.claimsCount', value: { value: null, knowledge: 'UNKNOWN' } });
    });

    it('reprend le niveau et la valeur déjà enregistrés', async () => {
      tester.setInputs({ data: { 'insuranceHistory.claimsCount': { value: 3, knowledge: 'KNOWN' } } });

      await expect.element(tester.root.getByRole('spinbutton', { name: 'Sinistres' })).toHaveValue(3);
    });

    it('« Valeur connue » sans nombre efface la réponse précédente (rien d’enregistrable)', async () => {
      tester.setInputs({ data: { 'insuranceHistory.claimsCount': { value: null, knowledge: 'DECLARED_UNKNOWN' } } });

      await claims().getByRole('radio', { name: 'Valeur connue' }).click();

      expect(tester.changes.at(-1)).toEqual({ path: 'insuranceHistory.claimsCount', value: null });
    });
  });

  describe('Champs obligatoires', () => {
    it('signale les champs obligatoires vides quand on le demande', async () => {
      await expect.element(tester.root.getByText('Ce champ est obligatoire').first()).not.toBeInTheDocument();

      tester.setInputs({ showMissing: true, data: { 'vehicle.registration': 'AB-123-CD' } });

      // Immatriculation renseignée, mais ni puissance, ni usage, ni assuré actuel, ni sinistres.
      await expect.element(tester.root.getByText('Ce champ est obligatoire').first()).toBeVisible();
      expect(tester.root.getByText('Ce champ est obligatoire').elements()).toHaveLength(4);
    });

    it('0 et « Non » comptent comme des réponses', async () => {
      tester.setInputs({
        showMissing: true,
        data: {
          'vehicle.registration': 'AB',
          'vehicle.fiscalPower': 0,
          'vehicle.usage': 'prive',
          'insuranceHistory.currentlyInsured': false,
          'insuranceHistory.claimsCount': { value: null, knowledge: 'DECLARED_UNKNOWN' },
        },
      });

      await expect.element(tester.root.getByText('Ce champ est obligatoire')).not.toBeInTheDocument();
    });
  });

  it('ne permet aucune saisie en lecture seule', async () => {
    tester.setInputs({ readonly: true, data: { 'vehicle.registration': 'AB-123-CD' } });

    await expect.element(tester.root.getByRole('textbox', { name: 'Immatriculation *' })).toHaveAttribute('readonly');
  });
});
