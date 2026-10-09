import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { CanonicalData, Insurer, Offer, QuoteJob } from '@shared';
import { page } from 'vitest/browser';
import { PricingCard } from '../../store/pricing.store';
import { QuoteCardComponent } from './quote-card.component';

const INSURER: Insurer = {
  id: 'assureur-a',
  name: 'Assureur A',
  extranetUrl: 'https://extranet.assureur-a.example',
  extranetDomains: ['extranet.assureur-a.example'],
  productsSupported: ['auto'],
};

const job = (overrides: Partial<QuoteJob> = {}): QuoteJob => ({
  id: 'assureur-a',
  status: 'requested',
  ownerUid: 'u1',
  quoteData: {},
  missingFields: [],
  currentStep: null,
  totalSteps: null,
  error: null,
  attempts: 1,
  ...overrides,
});

const offer = (overrides: Partial<Offer> = {}): Offer => ({
  id: 'assureur-a',
  quoteNumber: 'DEV-1',
  premiumAnnual: 640,
  premiumMonthly: null,
  deductibles: {},
  guarantees: [],
  exclusions: [],
  source: 'manual',
  gaps: [],
  score: null,
  ...overrides,
});

/** La carte d'un assureur, telle que le courtier la voit. */
class QuoteCardTester {
  readonly fixture = TestBed.createComponent(QuoteCardComponent);
  readonly root = page.elementLocator(this.fixture.nativeElement);
  readonly launches: number[] = [];
  readonly answers: CanonicalData[] = [];
  manualEntries = 0;

  constructor(card: Partial<PricingCard>, canPrice = true) {
    const component = this.fixture.componentInstance;
    component.launch.subscribe(() => this.launches.push(1));
    component.answered.subscribe(answers => this.answers.push(answers));
    component.manualEntry.subscribe(() => (this.manualEntries += 1));
    this.fixture.componentRef.setInput('card', { insurer: INSURER, job: null, offer: null, ...card });
    this.fixture.componentRef.setInput('canPrice', canPrice);
  }

  button(name: string) {
    return this.root.getByRole('button', { name });
  }
}

describe('QuoteCardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
  });

  it('propose « Tarifer » quand aucun job n’existe, désactivé tant que le besoin n’est pas validé', async () => {
    const blocked = new QuoteCardTester({}, false);
    await expect.element(blocked.root.getByText(/Non lancée/)).toBeVisible();
    await expect.element(blocked.button('Tarifer')).toBeDisabled();
    await expect.element(blocked.button('Saisir l’offre')).toBeDisabled();

    const ready = new QuoteCardTester({});
    await ready.button('Tarifer').click();
    expect(ready.launches).toHaveLength(1);
  });

  it('suit le job en temps réel : étape en cours, et ouverture de l’extranet au lieu d’un nouveau lancement', async () => {
    const tester = new QuoteCardTester({ job: job({ status: 'filling', currentStep: 2, totalSteps: 3 }) });
    await expect.element(tester.root.getByText(/Remplissage en cours/)).toBeVisible();
    await expect.element(tester.root.getByText(/Étape 2 sur 3/)).toBeVisible();
    await expect.element(tester.button('Ouvrir l’extranet')).toBeVisible();
    await expect.element(tester.button('Tarifer')).not.toBeInTheDocument();
  });

  it('un job en échec affiche l’erreur et se relance', async () => {
    const tester = new QuoteCardTester({ job: job({ status: 'failed', error: 'Page inconnue.', attempts: 2 }) });
    await expect.element(tester.root.getByRole('alert').getByText(/Page inconnue./)).toBeVisible();
    await expect.element(tester.root.getByText(/2e tentative/)).toBeVisible();
    await tester.button('Relancer').click();
    expect(tester.launches).toHaveLength(1);
  });

  it('demande les champs manquants et envoie les réponses', async () => {
    const tester = new QuoteCardTester({
      job: job({ status: 'needs_info', missingFields: [{ canonicalPath: 'driver.profession', label: 'Profession', type: 'text' }] }),
    });
    await tester.button('Envoyer à l’extension').click();
    expect(tester.answers).toHaveLength(0);
    await expect.element(tester.root.getByText('Ce champ est obligatoire')).toBeVisible();

    await tester.root.getByRole('textbox', { name: 'Profession *' }).fill('Infirmière');
    await tester.button('Envoyer à l’extension').click();
    expect(tester.answers).toEqual([{ 'driver.profession': 'Infirmière' }]);
  });

  it('affiche l’offre obtenue, signale une saisie manuelle et permet de la corriger', async () => {
    const tester = new QuoteCardTester({ job: job({ status: 'captured' }), offer: offer() });
    await expect.element(tester.root.getByText(/Tarif obtenu/)).toBeVisible();
    await expect.element(tester.root.getByText(/640/)).toBeVisible();
    await expect.element(tester.root.getByText(/Saisie manuelle/)).toBeVisible();
    await tester.button('Corriger l’offre').click();
    expect(tester.manualEntries).toBe(1);
  });
});
