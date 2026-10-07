import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { faker } from '@faker-js/faker';
import { page } from 'vitest/browser';
import { CredentialsModel } from '../../../models/credentials.model';
import { SigninPresentationComponent } from './signin-presentation.component';

/**
 * La page de connexion vue par le courtier : on la manipule par les libellés
 * qu'il lit, comme il le ferait.
 */
class SigninTester {
  readonly fixture = TestBed.createComponent(SigninPresentationComponent);
  readonly root = page.elementLocator(this.fixture.nativeElement);

  readonly email = this.root.getByRole('textbox', { name: 'Email' });
  readonly password = this.root.getByLabelText('Mot de passe', { exact: true });
  readonly submit = this.root.getByRole('button', { name: 'Se connecter' });
  readonly showPassword = this.root.getByRole('button', { name: 'Afficher le mot de passe' });
  readonly alert = this.root.getByRole('alert');

  /** Les identifiants émis à chaque envoi du formulaire. */
  readonly submitted: CredentialsModel[] = [];

  constructor() {
    this.fixture.componentRef.setInput('forgotPasswordUrl', '/mot-de-passe-oublie');
    this.fixture.componentRef.setInput('signupUrl', '/inscription');
    this.fixture.componentInstance.submitted.subscribe(credentials => this.submitted.push(credentials));
  }

  setInputs(inputs: { isPending?: boolean; error?: string | null }): void {
    for (const [name, value] of Object.entries(inputs)) {
      this.fixture.componentRef.setInput(name, value);
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}

describe('SigninPresentationComponent', () => {
  let tester: SigninTester;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    tester = new SigninTester();
  });

  it('envoie les identifiants saisis', async () => {
    const email = faker.internet.email();
    const password = faker.internet.password();

    await tester.signIn(email, password);

    expect(tester.submitted).toEqual([{ email, password }]);
  });

  it("n'envoie rien et signale les champs obligatoires quand le formulaire est vide", async () => {
    await tester.submit.click();

    await expect.element(tester.root.getByText("L'email est obligatoire")).toBeVisible();
    await expect.element(tester.root.getByText('Le mot de passe est obligatoire')).toBeVisible();
    expect(tester.submitted).toEqual([]);
  });

  it("refuse un email mal formé", async () => {
    await tester.signIn('pas-un-email', faker.internet.password());

    await expect.element(tester.root.getByText("L'email n'est pas valide")).toBeVisible();
    expect(tester.submitted).toEqual([]);
  });

  it("affiche l'erreur renvoyée par le serveur", async () => {
    tester.setInputs({ error: 'Email ou mot de passe incorrect.' });

    await expect.element(tester.alert).toHaveTextContent('Email ou mot de passe incorrect.');
  });

  it('bloque le bouton pendant la connexion', async () => {
    tester.setInputs({ isPending: true });

    await expect.element(tester.root.getByRole('button', { name: 'Traitement en cours' })).toBeDisabled();
  });

  it('affiche le mot de passe à la demande', async () => {
    await tester.password.fill('secret123');
    await tester.showPassword.click();

    await expect.element(tester.password).toHaveAttribute('type', 'text');
  });

  it("propose le mot de passe oublié et l'inscription", async () => {
    await expect.element(tester.root.getByRole('link', { name: 'Mot de passe oublié ?' })).toHaveAttribute(
      'href',
      '/mot-de-passe-oublie',
    );
    await expect.element(tester.root.getByRole('link', { name: "Pas encore de compte ? S'inscrire" })).toHaveAttribute(
      'href',
      '/inscription',
    );
  });
});
