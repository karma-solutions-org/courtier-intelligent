import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { page } from 'vitest/browser';
import { PricingSummary } from '../../../store/pricing.store';
import { PricingTabPresentationComponent } from './pricing-tab-presentation.component';

/** « Tarifer sur tous les extranets » (phase 3) : le bouton et le bandeau d'avancement. */
function render(inputs: { canPrice?: boolean; extensionMissing?: boolean; launchableCount?: number; launchingAll?: boolean; summary?: PricingSummary | null }) {
  TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
  const fixture = TestBed.createComponent(PricingTabPresentationComponent);
  fixture.componentRef.setInput('loaded', true);
  fixture.componentRef.setInput('canPrice', inputs.canPrice ?? true);
  fixture.componentRef.setInput('extensionMissing', inputs.extensionMissing ?? false);
  fixture.componentRef.setInput('launchableCount', inputs.launchableCount ?? 0);
  fixture.componentRef.setInput('launchingAll', inputs.launchingAll ?? false);
  fixture.componentRef.setInput('summary', inputs.summary ?? null);
  const launchAll = vi.fn();
  fixture.componentInstance.launchAll.subscribe(launchAll);
  fixture.detectChanges();
  return { root: page.elementLocator(fixture.nativeElement), launchAll };
}

const BUTTON = { name: /Tarifer sur tous les extranets/ };

describe('PricingTabPresentationComponent', () => {
  it('propose de tarifer partout dès 2 assureurs à lancer, avec leur nombre', async () => {
    const { root, launchAll } = render({ launchableCount: 3 });

    const button = root.getByRole('button', BUTTON);
    await expect.element(button).toBeVisible();
    expect(button.element().textContent).toContain('Tarifer sur tous les extranets (3)');
    await button.click();
    expect(launchAll).toHaveBeenCalledOnce();
  });

  it.each([
    ['un seul assureur à lancer', { launchableCount: 1 }],
    ['extension absente', { launchableCount: 3, extensionMissing: true }],
    ['couverture pas encore validée', { launchableCount: 3, canPrice: false }],
  ])('pas de bouton : %s', async (_case, inputs) => {
    const { root } = render(inputs);

    await expect.element(root.getByRole('button', BUTTON)).not.toBeInTheDocument();
  });

  it('bouton grisé pendant le lancement', async () => {
    const { root } = render({ launchableCount: 3, launchingAll: true });

    await expect.element(root.getByRole('button', BUTTON)).toBeDisabled();
  });

  it("affiche l'avancement : tarifs obtenus sur le total, et le détail non nul", async () => {
    const { root } = render({
      summary: { total: 3, obtained: 2, toReview: 2, inProgress: 1, needsAction: 0, failed: 0 },
    });

    const status = root.getByRole('status');
    await expect.element(status).toBeVisible();
    const text = status.element().textContent ?? '';
    expect(text).toContain('2/3 tarifs obtenus');
    expect(text).toContain('2 à vérifier · 1 en cours');
    expect(text).not.toContain('échec');
  });

  it("rien de lancé : pas de bandeau d'avancement", async () => {
    const { root } = render({ summary: null });

    await expect.element(root.getByText(/tarifs? obtenus?/)).not.toBeInTheDocument();
  });
});
