import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { ExtranetReliabilityReport, Insurer, InsurerReliability, ReliabilityPeriod } from '@shared';
import { ReliabilityPanelPresentationComponent } from './reliability-panel-presentation.component';

const ALLIANZ: Insurer = {
  id: 'allianz',
  name: 'Allianz',
  logo: 'insurers/allianz.webp',
  extranetUrl: 'https://extranet.allianz.example',
  extranetDomains: ['extranet.allianz.example'],
  productsSupported: ['auto'],
};

const reliability = (insurerId: string, extra: Partial<InsurerReliability> = {}): InsurerReliability => ({
  insurerId,
  launched: 0,
  captured: 0,
  capturedAuto: 0,
  capturedManual: 0,
  failed: 0,
  needsInfo: 0,
  inProgress: 0,
  cancelled: 0,
  successRate: null,
  averageAttempts: null,
  medianMinutesToPrice: null,
  topMissingFields: [],
  platformIssues: [],
  platformIssuesTotal: 0,
  ...extra,
});

const report = (insurers: InsurerReliability[], extra: Partial<ExtranetReliabilityReport> = {}): ExtranetReliabilityReport => ({
  periodDays: 30,
  generatedAt: '2026-11-25T10:00:00.000Z',
  dossiersRead: 12,
  truncated: false,
  insurers,
  ...extra,
});

/** Texte sans espaces insécables, pour comparer « 86 % » quel que soit l'espace utilisé. */
const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function setup(inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
  const fixture = TestBed.createComponent(ReliabilityPanelPresentationComponent);
  fixture.componentRef.setInput('insurers', [ALLIANZ]);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('ReliabilityPanelPresentationComponent', () => {
  it('affiche une ligne par assureur, avec son nom et son logo (ou son identifiant et son initiale)', async () => {
    const { element } = await setup({
      report: report([reliability('allianz', { launched: 4 }), reliability('luxior', { launched: 2 })]),
    });

    const rows = element.querySelectorAll('tr.summary');
    expect(rows.length).toBe(2);
    expect(text(rows[0].querySelector('.name'))).toBe('Allianz');
    expect(rows[0].querySelector<HTMLImageElement>('img.logo')?.getAttribute('src')).toBe('insurers/allianz.webp');
    expect(text(rows[1].querySelector('.name'))).toBe('luxior');
    expect(text(rows[1].querySelector('.initial'))).toBe('L');
  });

  it('formate les chiffres en français : taux sans décimale, minutes et tentatives avec une décimale', async () => {
    const { element } = await setup({
      report: report([
        reliability('allianz', {
          launched: 8,
          captured: 6,
          capturedAuto: 4,
          capturedManual: 2,
          failed: 1,
          needsInfo: 1,
          successRate: 6 / 7,
          medianMinutesToPrice: 3.46,
          averageAttempts: 1.25,
        }),
      ]),
    });

    const cells = [...element.querySelectorAll('tr.summary td')].map(text);
    expect(cells[0]).toBe('8');
    expect(cells[1]).toContain('6 86 %');
    expect(cells[1]).toContain('dont 2 saisies à la main');
    expect(cells[2]).toBe('1');
    expect(cells[3]).toBe('1');
    expect(cells[4]).toBe('0');
    expect(cells[5]).toBe('3,5 min');
    expect(cells[6]).toBe('1,3');
  });

  it('affiche « — » sans délai ni tentative, et aucun taux sans tarification terminée', async () => {
    const { element } = await setup({ report: report([reliability('allianz', { launched: 1, inProgress: 1 })]) });

    const cells = [...element.querySelectorAll('tr.summary td')].map(text);
    expect(element.querySelector('.rate')).toBeNull();
    expect(cells[5]).toBe('—');
    expect(cells[6]).toBe('—');
  });

  it("signale un extranet fragile (moins de 50 % sur au moins 3 tarifications terminées) et un extranet fiable (80 % et plus)", async () => {
    const { element } = await setup({
      report: report([
        reliability('fragile', { launched: 4, captured: 1, failed: 3, successRate: 0.25 }),
        reliability('trop-peu', { launched: 2, captured: 0, failed: 2, successRate: 0 }),
        reliability('fiable', { launched: 5, captured: 4, failed: 1, successRate: 0.8 }),
      ]),
    });

    const groups = element.querySelectorAll('tbody.insurer-group');
    expect(groups[0].classList).toContain('weak');
    expect(groups[0].querySelector('.rate.weak')).not.toBeNull();
    expect(groups[1].classList).not.toContain('weak');
    expect(groups[2].classList).toContain('strong');
    expect(groups[2].querySelector('.rate.strong')).not.toBeNull();
  });

  it('déplie le détail : questions manquantes et incidents signalés, avec leurs libellés', async () => {
    const { fixture, element } = await setup({
      report: report([
        reliability('allianz', {
          launched: 3,
          topMissingFields: [{ key: 'Date du permis', count: 2 }],
          platformIssues: [{ step: 'extract', issue: 'premium_not_found', count: 4 }],
          platformIssuesTotal: 5,
        }),
      ]),
    });
    expect(element.querySelector('tr.detail')).toBeNull();

    const toggle = element.querySelector<HTMLButtonElement>('button.expand')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await fixture.whenStable();

    const detail = text(element.querySelector('tr.detail'));
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(detail).toContain('Date du permis × 2');
    expect(detail).toContain('Lecture du tarif — Prime introuvable sur la page de résultat × 4');
    expect(detail).toContain('5 incident(s) au total');
  });

  it('affiche le message vide sans assureur, et le bilan partiel quand la limite de dossiers est atteinte', async () => {
    const { element } = await setup({ report: report([], { truncated: true }) });

    expect(element.querySelector('table')).toBeNull();
    expect(text(element)).toContain('Aucune tarification ni incident sur la période.');
    expect(text(element)).toContain('Bilan partiel : les 500 dossiers les plus récents de la période');
  });

  it("affiche le chargement puis l'erreur", async () => {
    const { fixture, element } = await setup({ isPending: true });
    expect(text(element.querySelector('[role="status"]'))).toBe('Calcul du bilan…');

    fixture.componentRef.setInput('isPending', false);
    fixture.componentRef.setInput('error', 'Le service est momentanément indisponible. Réessayez.');
    await fixture.whenStable();
    expect(element.querySelector('[role="status"]')).toBeNull();
    expect(text(element.querySelector('[role="alert"]'))).toBe('Le service est momentanément indisponible. Réessayez.');
  });

  it('émet la période choisie et la demande d’actualisation', async () => {
    const { fixture, element } = await setup({ report: report([]) });
    const periods: ReliabilityPeriod[] = [];
    let refreshed = 0;
    fixture.componentInstance.periodChanged.subscribe((period) => periods.push(period));
    fixture.componentInstance.refresh.subscribe(() => refreshed++);

    const toggles = [...element.querySelectorAll<HTMLButtonElement>('mat-button-toggle button')];
    expect(toggles.map(text)).toEqual(['7 jours', '30 jours', '90 jours']);
    toggles[2].click();
    toggles[1].click(); // période déjà affichée : rien n'est émis
    element.querySelector<HTMLButtonElement>('button.refresh')!.click();

    expect(periods).toEqual([90]);
    expect(refreshed).toBe(1);
  });
});
