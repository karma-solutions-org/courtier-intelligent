import { TestBed } from '@angular/core/testing';
import { ExtranetReliabilityReport } from '@shared';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { SettingsService } from '../services/settings.service';
import { ExtranetReliabilityStore } from './extranet-reliability.store';

const report = (periodDays: 7 | 30 | 90): ExtranetReliabilityReport => ({
  periodDays,
  generatedAt: '2026-11-25T10:00:00.000Z',
  dossiersRead: 3,
  truncated: false,
  insurers: [],
});

describe('ExtranetReliabilityStore', () => {
  let extranetReliability: ReturnType<typeof vi.fn>;

  const create = () => {
    TestBed.configureTestingModule({
      providers: [ExtranetReliabilityStore, { provide: SettingsService, useValue: { extranetReliability } }],
    });
    return TestBed.inject(ExtranetReliabilityStore);
  };

  beforeEach(() => {
    extranetReliability = vi.fn((days: 7 | 30 | 90): Observable<ExtranetReliabilityReport> => of(report(days)));
  });

  it('ne calcule rien avant le premier affichage de l’onglet', () => {
    const store = create();

    expect(extranetReliability).not.toHaveBeenCalled();
    expect(store.period()).toBe(30);
    expect(store.report()).toBeNull();
  });

  it('au premier affichage, calcule le bilan des 30 derniers jours, une seule fois', () => {
    const store = create();

    store.ensureLoaded();
    store.ensureLoaded();

    expect(extranetReliability).toHaveBeenCalledTimes(1);
    expect(extranetReliability).toHaveBeenCalledWith(30);
    expect(store.report()?.periodDays).toBe(30);
    expect(store.isPending()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('pendant le calcul, le bilan est en cours et un second affichage ne le relance pas', () => {
    extranetReliability = vi.fn(() => NEVER);
    const store = create();

    store.ensureLoaded();
    store.ensureLoaded();

    expect(store.isPending()).toBe(true);
    expect(extranetReliability).toHaveBeenCalledTimes(1);
  });

  it("un changement de période recalcule le bilan pour cette période et oublie l'ancien", () => {
    const store = create();
    store.ensureLoaded();

    extranetReliability.mockImplementation(() => NEVER);
    store.load(90);

    expect(extranetReliability).toHaveBeenLastCalledWith(90);
    expect(store.period()).toBe(90);
    expect(store.report()).toBeNull();
    expect(store.isPending()).toBe(true);
  });

  it('« Actualiser » recalcule la période en cours', () => {
    const store = create();
    store.load(7);

    store.load();

    expect(extranetReliability.mock.calls).toEqual([[7], [7]]);
    expect(store.report()?.periodDays).toBe(7);
  });

  it("affiche en français l'erreur renvoyée par le serveur", () => {
    extranetReliability = vi.fn(() =>
      throwError(() => ({ code: 'functions/permission-denied', message: 'Réservé aux administrateurs du cabinet.' })),
    );
    const store = create();

    store.ensureLoaded();

    expect(store.isPending()).toBe(false);
    expect(store.error()).toBe('Réservé aux administrateurs du cabinet.');
    expect(store.report()).toBeNull();
  });

  it('une erreur technique ou une function absente donne un message générique en français', () => {
    extranetReliability = vi.fn(() => throwError(() => ({ code: 'functions/internal', message: 'INTERNAL' })));
    const store = create();
    store.ensureLoaded();
    expect(store.error()).toBe('Le service est momentanément indisponible. Réessayez.');

    extranetReliability.mockImplementation(() => throwError(() => ({ code: 'functions/not-found', message: 'NOT FOUND' })));
    store.load();
    expect(store.error()).toBe("Le bilan de fiabilité n'est pas encore disponible. Réessayez plus tard.");
  });
});
