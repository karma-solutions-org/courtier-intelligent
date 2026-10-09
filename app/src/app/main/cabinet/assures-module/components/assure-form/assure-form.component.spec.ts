import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { Assure } from '@shared';
import { page } from 'vitest/browser';
import { AssureFormModel } from '../../models/assure-form.model';
import { DuplicateCandidate } from '../../util/assures.utils';
import { AssureFormComponent } from './assure-form.component';

/** Le formulaire assuré, tel que le courtier le remplit. */
class AssureFormTester {
  readonly fixture = TestBed.createComponent(AssureFormComponent);
  readonly root = page.elementLocator(this.fixture.nativeElement);

  readonly firstName = this.root.getByRole('textbox', { name: 'Prénom' });
  readonly lastName = this.root.getByRole('textbox', { name: 'Nom' });
  readonly email = this.root.getByRole('textbox', { name: 'Email' });
  readonly phone = this.root.getByRole('textbox', { name: 'Téléphone' });
  readonly postalCode = this.root.getByRole('textbox', { name: 'Code postal' });
  readonly submit = this.root.getByRole('button', { name: /^(Créer|Enregistrer)/ });

  readonly submitted: AssureFormModel[] = [];
  readonly candidates: DuplicateCandidate[] = [];

  constructor() {
    const component = this.fixture.componentInstance;
    component.submitted.subscribe(value => this.submitted.push(value));
    component.candidateChanged.subscribe(value => this.candidates.push(value));
  }

  setInputs(inputs: { duplicates?: Assure[]; assure?: Assure | null; mode?: 'create' | 'edit' }): void {
    for (const [name, value] of Object.entries(inputs)) {
      this.fixture.componentRef.setInput(name, value);
    }
  }

  async fillIdentity(): Promise<void> {
    await this.firstName.fill('Jean');
    await this.lastName.fill('Dupont');
  }
}

const existing: Assure = {
  id: 'a1',
  type: 'particulier',
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'jean@example.fr',
  createdBy: 'uid',
};

describe('AssureFormComponent', () => {
  let tester: AssureFormTester;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    tester = new AssureFormTester();
  });

  it("n'envoie rien tant que le prénom et le nom manquent", async () => {
    await tester.submit.click();

    await expect.element(tester.root.getByText('Ce champ est obligatoire').first()).toBeVisible();
    expect(tester.submitted).toEqual([]);
  });

  it('crée un particulier avec un email en minuscules', async () => {
    await tester.fillIdentity();
    await tester.email.fill('Jean@Example.FR');
    await tester.phone.fill('06 12 34 56 78');
    await tester.submit.click();

    expect(tester.submitted).toHaveLength(1);
    expect(tester.submitted[0]).toMatchObject({ type: 'particulier', firstName: 'Jean', lastName: 'Dupont', phone: '06 12 34 56 78' });
  });

  it.each([
    ['Email', 'pas-un-email', "L'email n'est pas valide"],
    ['Téléphone', '12345', /Numéro de téléphone français/],
    ['Code postal', '6900', 'Le code postal comporte 5 chiffres'],
  ])('refuse un champ « %s » mal formé', async (label, value, message) => {
    await tester.fillIdentity();
    await tester.root.getByRole('textbox', { name: label }).fill(value);
    await tester.submit.click();

    await expect.element(tester.root.getByText(message)).toBeVisible();
    expect(tester.submitted).toEqual([]);
  });

  it('exige une raison sociale pour un professionnel, et valide le SIRET', async () => {
    await tester.root.getByRole('radio', { name: 'Professionnel' }).click();
    await tester.fillIdentity();
    await tester.root.getByRole('textbox', { name: 'SIRET' }).fill('123');
    await tester.submit.click();

    await expect.element(tester.root.getByText('Ce champ est obligatoire')).toBeVisible();
    await expect.element(tester.root.getByText('Le SIRET comporte 14 chiffres')).toBeVisible();
    expect(tester.submitted).toEqual([]);

    await tester.root.getByRole('textbox', { name: 'Raison sociale' }).fill('Dupont SARL');
    await tester.root.getByRole('textbox', { name: 'SIRET' }).fill('123 456 789 01234');
    await tester.submit.click();

    expect(tester.submitted[0]).toMatchObject({ type: 'pro', companyName: 'Dupont SARL', siret: '123 456 789 01234' });
  });

  it('signale les doublons trouvés et propose de créer quand même', async () => {
    tester.setInputs({ duplicates: [existing] });

    await expect.element(tester.root.getByText('Cet assuré existe peut-être déjà')).toBeVisible();
    await expect.element(tester.root.getByRole('link', { name: 'Ouvrir la fiche' })).toBeVisible();

    await tester.fillIdentity();
    await tester.root.getByRole('button', { name: 'Créer quand même' }).click();
    expect(tester.submitted).toHaveLength(1);
  });

  it('transmet la saisie pour la recherche de doublons', async () => {
    await tester.fillIdentity();
    await tester.email.fill('jean@example.fr');

    await expect.poll(() => tester.candidates.at(-1)).toMatchObject({ email: 'jean@example.fr', firstName: 'Jean', lastName: 'Dupont' });
  });

  it('remplit le formulaire avec l’assuré à modifier', async () => {
    tester.setInputs({ assure: existing, mode: 'edit' });

    await expect.element(tester.firstName).toHaveValue('Jean');
    await expect.element(tester.email).toHaveValue('jean@example.fr');
    await expect.element(tester.root.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });
});
