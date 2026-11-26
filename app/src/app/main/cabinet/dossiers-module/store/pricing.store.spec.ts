import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Cabinet, Dossier, Insurer, Offer, QuoteJob } from '@shared';
import { of, Subject, throwError } from 'rxjs';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { ExtensionService } from '../../../commons/extension-module/services/extension.service';
import { CabinetStatusStore } from '../../../commons/main-module/store/cabinet-status.store';
import { PricingService } from '../services/pricing.service';
import { DossierStore } from './dossier.store';
import { pricingSummary, PricingStore } from './pricing.store';

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
  let missing: ReturnType<typeof signal<string[]>>;
  let service: {
    watchJobs: ReturnType<typeof vi.fn>;
    watchOffers: ReturnType<typeof vi.fn>;
    launch: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
  };
  let extension: { openExtranets: ReturnType<typeof vi.fn> };
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
    missing = signal<string[]>([]);
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
    extension = { openExtranets: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PricingStore,
        { provide: PricingService, useValue: service },
        { provide: ExtensionService, useValue: extension },
        { provide: AuthStore, useValue: { cabinetId: signal('c1') } },
        { provide: CabinetStatusStore, useValue: { cabinet } },
        {
          provide: DossierStore,
          useValue: {
            selectedId: signal('d1'),
            dossier,
            missing,
            labels: signal(new Map([['vehicle.parkingPostalCode', 'Code postal du lieu de stationnement']])),
            product: signal(null),
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

  it("bloque la tarification tant que le besoin n'est pas validé", () => {
    expect(store.canPrice()).toBe(true);
    dossier.set({ id: 'd1', productId: 'auto', status: 'complet', needAnalysis: null });
    expect(store.canPrice()).toBe(false);
  });

  it("lance le job puis dirige l'onglet ouvert vers l'extranet", () => {
    const target = fakeWindow();
    store.launch('a', target);

    expect(service.launch).toHaveBeenCalledWith('d1', 'a');
    expect(target.location.href).toBe('https://a.example/connexion');
    expect(store.busy()).toEqual([]);
    expect(store.successMessage()).toContain('Tarification lancée');
  });

  it("en cas de refus du serveur, ferme l'onglet ouvert et affiche le message", () => {
    service.launch.mockReturnValue(
      throwError(() => ({ code: 'functions/failed-precondition', message: 'Validez le besoin.' })),
    );
    const target = fakeWindow();
    store.launch('a', target);

    expect(target.close).toHaveBeenCalled();
    expect(store.error()).toBe('Validez le besoin.');
  });

  it('refuse de lancer tant qu’une question obligatoire est sans réponse', () => {
    missing.set(['vehicle.parkingPostalCode']);
    const target = fakeWindow();
    store.launch('a', target);

    expect(service.launch).not.toHaveBeenCalled();
    expect(target.close).toHaveBeenCalled();
    expect(store.error()).toContain('Code postal du lieu de stationnement');
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

  describe('Tarifer sur tous les extranets', () => {
    beforeEach(() => {
      // Aucun job : les deux assureurs du produit sont à lancer.
      service.watchJobs.mockReturnValue(of([]));
      (TestBed.inject(DossierStore).selectedId as ReturnType<typeof signal<string>>).set('d1-bis');
      TestBed.tick();
      service.launch.mockImplementation((_dossierId: string, insurerId: string) =>
        of({ dossierStatus: 'tarification', attempts: 1, extranetUrl: `https://${insurerId}.example/connexion` }),
      );
    });

    it("écrit un job par assureur à lancer, l'un après l'autre, puis l'extension ouvre leurs extranets", () => {
      expect(store.launchable().map((card) => card.insurer.id)).toEqual(['a', 'b']);
      extension.openExtranets.mockReturnValue(of({ ok: true, opened: ['a', 'b'], refused: [] }));

      store.launchAll();

      expect(service.launch.mock.calls).toEqual([
        ['d1-bis', 'a'],
        ['d1-bis', 'b'],
      ]);
      expect(extension.openExtranets).toHaveBeenCalledWith('d1-bis', [
        { insurerId: 'a', url: 'https://a.example/connexion' },
        { insurerId: 'b', url: 'https://b.example/connexion' },
      ]);
      expect(store.successMessage()).toBe("Tarification lancée chez 2 assureurs : l'extension remplit leurs extranets.");
      expect(store.error()).toBeNull();
      expect(store.launchingAll()).toBe(false);
      expect(store.busy()).toEqual([]);
    });

    it("un refus du serveur pour un assureur n'empêche pas les autres", () => {
      service.launch.mockImplementation((_dossierId: string, insurerId: string) =>
        insurerId === 'a'
          ? throwError(() => ({ code: 'functions/failed-precondition', message: 'Déjà en cours.' }))
          : of({ dossierStatus: 'tarification', attempts: 1, extranetUrl: 'https://b.example' }),
      );
      extension.openExtranets.mockReturnValue(of({ ok: true, opened: ['b'], refused: [] }));

      store.launchAll();

      expect(extension.openExtranets).toHaveBeenCalledWith('d1-bis', [{ insurerId: 'b', url: 'https://b.example' }]);
      expect(store.error()).toBe('a : Déjà en cours.');
      expect(store.successMessage()).toContain('chez 1 assureur :');
    });

    it("l'extension n'ouvre pas les extranets : le message l'explique, les jobs restent lancés", () => {
      extension.openExtranets.mockReturnValue(of({ ok: false, message: "Connectez l'extension." }));

      store.launchAll();

      expect(service.launch).toHaveBeenCalledTimes(2);
      expect(store.error()).toBe("Connectez l'extension.");
    });

    it('refuse de lancer tant qu’une question obligatoire est sans réponse', () => {
      missing.set(['vehicle.parkingPostalCode']);

      store.launchAll();

      expect(service.launch).not.toHaveBeenCalled();
      expect(store.error()).toContain('Code postal du lieu de stationnement');
    });
  });

  describe('pricingSummary', () => {
    const offer = (extra: Partial<Offer> = {}) => ({ id: 'x', source: 'auto', review: 'validated', ...extra }) as Offer;
    const job = (status: QuoteJob['status']) => ({ id: 'x', status }) as QuoteJob;

    it('rien de lancé : pas de résumé', () => {
      expect(pricingSummary([{ job: null, offer: null }])).toBeNull();
    });

    it('compte les tarifs obtenus (à vérifier compris), en cours, en attente du courtier et en échec', () => {
      expect(
        pricingSummary([
          { job: job('captured'), offer: offer() },
          { job: job('captured'), offer: offer({ review: 'pending' }) },
          { job: job('filling'), offer: null },
          { job: job('awaiting_submit'), offer: null },
          { job: job('failed'), offer: null },
          { job: null, offer: null },
        ]),
      ).toEqual({ total: 6, obtained: 2, toReview: 1, inProgress: 1, needsAction: 1, failed: 1 });
    });

    it("un tarif périmé n'est plus obtenu ; relancé, il est en cours", () => {
      expect(
        pricingSummary([
          { job: job('captured'), offer: offer({ stale: true }) },
          { job: job('requested'), offer: offer({ stale: true }) },
        ]),
      ).toMatchObject({ obtained: 0, inProgress: 1 });
    });
  });

  it("une erreur d'écoute est affichée et termine le chargement", () => {
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
