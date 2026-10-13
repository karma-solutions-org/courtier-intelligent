import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Cabinet, Dossier, Insurer, QuoteJob } from '@shared';
import { of, Subject, throwError } from 'rxjs';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { CabinetStatusStore } from '../../../commons/main-module/store/cabinet-status.store';
import { PricingService } from '../services/pricing.service';
import { DossierStore } from './dossier.store';
import { PricingStore } from './pricing.store';

const insurer = (id: string, productsSupported = ['auto']): Insurer => ({
  id,
  name: id,
  extranetUrl: `https://${id}.example`,
  extranetDomains: [`${id}.example`],
  productsSupported,
});

const validated = { validatedAt: { toMillis: () => 1 } } as Dossier['needAnalysis'];

describe('PricingStore', () => {
  let dossier: ReturnType<typeof signal<Partial<Dossier> | null>>;
  let cabinet: ReturnType<typeof signal<Partial<Cabinet> | null>>;
  let service: {
    watchJobs: ReturnType<typeof vi.fn>;
    watchOffers: ReturnType<typeof vi.fn>;
    launch: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
  };
  let store: InstanceType<typeof PricingStore>;

  const fakeWindow = () =>
    ({ location: { href: '' }, close: vi.fn() }) as unknown as Window & {
      close: ReturnType<typeof vi.fn>;
    };

  beforeEach(() => {
    dossier = signal<Partial<Dossier> | null>({
      id: 'd1',
      productId: 'auto',
      status: 'besoin_valide',
      needAnalysis: validated,
    });
    cabinet = signal<Partial<Cabinet> | null>({ enabledInsurers: [] });
    service = {
      watchJobs: vi.fn(() => of([{ id: 'a', status: 'failed' } as QuoteJob])),
      watchOffers: vi.fn(() => of([])),
      launch: vi.fn(() =>
        of({
          dossierStatus: 'tarification',
          attempts: 1,
          extranetUrl: 'https://a.example/connexion',
        }),
      ),
      complete: vi.fn(() => of({ success: true })),
    };
    TestBed.configureTestingModule({
      providers: [
        PricingStore,
        { provide: PricingService, useValue: service },
        { provide: AuthStore, useValue: { cabinetId: signal('c1') } },
        { provide: CabinetStatusStore, useValue: { cabinet } },
        {
          provide: DossierStore,
          useValue: {
            selectedId: signal('d1'),
            dossier,
            insurers: signal([
              insurer('a'),
              insurer('b'),
              insurer('habitation-seulement', ['habitation']),
            ]),
          },
        },
      ],
    });
    store = TestBed.inject(PricingStore);
    TestBed.tick();
  });

  it('une carte par assureur du produit, limitée aux assureurs activés par le cabinet, avec son job', () => {
    expect(store.cards().map((c) => c.insurer.id)).toEqual(['a', 'b']);
    expect(store.cards()[0].job?.status).toBe('failed');

    cabinet.set({ enabledInsurers: ['b'] });
    expect(store.cards().map((c) => c.insurer.id)).toEqual(['b']);
  });

  it('bloque la tarification tant que le besoin n’est pas validé', () => {
    expect(store.canPrice()).toBe(true);
    dossier.set({ id: 'd1', productId: 'auto', status: 'complet', needAnalysis: null });
    expect(store.canPrice()).toBe(false);
  });

  it('lance le job puis dirige l’onglet ouvert vers l’extranet', () => {
    const target = fakeWindow();
    store.launch('a', target);

    expect(service.launch).toHaveBeenCalledWith('d1', 'a');
    expect(target.location.href).toBe('https://a.example/connexion');
    expect(store.busy()).toEqual([]);
    expect(store.successMessage()).toContain('Tarification lancée');
  });

  it('en cas de refus du serveur, ferme l’onglet ouvert et affiche le message', () => {
    service.launch.mockReturnValue(
      throwError(() => ({ code: 'functions/failed-precondition', message: 'Validez le besoin.' })),
    );
    const target = fakeWindow();
    store.launch('a', target);

    expect(target.close).toHaveBeenCalled();
    expect(store.error()).toBe('Validez le besoin.');
  });

  it('ignore un second lancement pour un assureur déjà en cours (double clic)', () => {
    const pending = new Subject<{ dossierStatus: string; attempts: number; extranetUrl: string }>();
    service.launch.mockReturnValue(pending);
    store.launch('a', fakeWindow());
    store.launch('a', fakeWindow());

    expect(service.launch).toHaveBeenCalledOnce();
    expect(store.busy()).toEqual(['a']);

    pending.next({ dossierStatus: 'tarification', attempts: 1, extranetUrl: 'https://a.example' });
    pending.complete();
    expect(store.busy()).toEqual([]);
  });

  it('une erreur d’écoute est affichée et termine le chargement', () => {
    expect(store.loaded()).toBe(true);
    expect(store.error()).toBeNull();

    service.watchJobs.mockReturnValue(throwError(() => ({ message: 'Accès refusé.' })));
    const other = TestBed.inject(DossierStore).selectedId as ReturnType<typeof signal<string>>;
    other.set('d2');
    TestBed.tick();

    expect(store.error()).toBe('Accès refusé.');
    expect(store.loaded()).toBe(true);
  });
});
