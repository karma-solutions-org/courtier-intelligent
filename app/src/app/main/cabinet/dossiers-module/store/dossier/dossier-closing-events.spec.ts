import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dossier, Product } from '@shared';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { CabinetStatusStore } from '../../../../commons/main-module/store/cabinet-status.store';
import { DocumentsService } from '../../services/documents.service';
import { DossiersService } from '../../services/dossiers.service';
import { DossierStore } from '../dossier.store';

/** Tests des features `withDossierClosing` (sans suite, corbeille) et `withDossierEvents` (historique), avec un faux service. */
describe('DossierStore — sans suite, corbeille et historique', () => {
  let service: {
    classerSansSuite: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    watchEvents: ReturnType<typeof vi.fn>;
  };
  let store: InstanceType<typeof DossierStore>;

  beforeEach(() => {
    service = {
      classerSansSuite: vi.fn(() => of({ status: 'sans_suite', cancelledJobs: 0 })),
      remove: vi.fn(() => of({ ok: true })),
      watchEvents: vi.fn(() => of({ events: [], hasMore: false })),
    };
    TestBed.configureTestingModule({
      providers: [
        DossierStore,
        { provide: CabinetStatusStore, useValue: { cabinet: signal(null) } },
        {
          provide: DossiersService,
          useValue: {
            ...service,
            watchDossier: () => new BehaviorSubject<Dossier | null>({ id: 'd1', status: 'complet', data: {} } as unknown as Dossier),
            watchProducts: () => of([] as Product[]),
            watchInsurers: () => of([]),
            watchMembers: () => of([]),
            watchAssure: () => of(null),
          },
        },
        { provide: AuthStore, useValue: { cabinetId: signal('c1'), user: signal({ uid: 'u1' }) } },
        { provide: DocumentsService, useValue: {} },
      ],
    });
    store = TestBed.inject(DossierStore);
    store.select('d1');
    TestBed.tick();
  });

  describe('classement sans suite', () => {
    it('signale le classement en cours, puis le résultat avec les tarifications annulées', () => {
      const answer$ = new Subject<{ status: 'sans_suite'; cancelledJobs: number }>();
      service.classerSansSuite.mockReturnValueOnce(answer$);

      store.classerSansSuite({ dossierId: 'd1', motif: 'Client injoignable' });

      expect(service.classerSansSuite).toHaveBeenCalledWith('d1', 'Client injoignable');
      expect(store.closing()).toBe(true);

      answer$.next({ status: 'sans_suite', cancelledJobs: 2 });
      answer$.complete();

      expect(store.closing()).toBe(false);
      expect(store.notice()).toEqual({ text: 'Dossier classé sans suite. 2 tarification(s) annulée(s).', duration: 4000 });
    });

    it('affiche le refus du serveur et rend la main', () => {
      service.classerSansSuite.mockReturnValueOnce(throwError(() => ({ message: 'Dossier déjà clos.' })));

      store.classerSansSuite({ dossierId: 'd1', motif: 'Doublon' });

      expect(store.closing()).toBe(false);
      expect(store.notice()?.duration).toBe(5000);
      expect(store.notice()?.text).toContain('Dossier déjà clos.');
    });
  });

  describe('mise à la corbeille', () => {
    it('passe à « fait » avec un message, puis revient au repos', () => {
      store.remove('d1');

      expect(service.remove).toHaveBeenCalledWith('d1');
      expect(store.removeStatus()).toBe('done');
      expect(store.notice()).toEqual({ text: 'Dossier placé dans la corbeille.', duration: 3000 });

      store.resetRemoveStatus();
      store.clearNotice();
      expect(store.removeStatus()).toBe('idle');
      expect(store.notice()).toBeNull();
    });

    it('passe à « échec » et affiche le refus du serveur', () => {
      service.remove.mockReturnValueOnce(throwError(() => ({ message: 'Proposition déjà envoyée.' })));

      store.remove('d1');

      expect(store.removeStatus()).toBe('failed');
      expect(store.notice()?.text).toContain('Proposition déjà envoyée.');
    });
  });

  describe('historique', () => {
    it('lit la première tranche de 20 événements du dossier sélectionné', () => {
      expect(service.watchEvents).toHaveBeenLastCalledWith('c1', 'd1', 20);
    });

    it('demande la tranche suivante seulement quand il en reste', () => {
      service.watchEvents.mockReturnValue(of({ events: [], hasMore: true }));
      store.select('d2');
      TestBed.tick();
      expect(store.eventsHasMore()).toBe(true);

      store.loadMoreEvents();
      TestBed.tick();

      expect(service.watchEvents).toHaveBeenLastCalledWith('c1', 'd2', 40);
      expect(store.eventsLoadingMore()).toBe(false);

      service.watchEvents.mockReturnValue(of({ events: [], hasMore: false }));
      store.loadMoreEvents();
      TestBed.tick();
      const calls = service.watchEvents.mock.calls.length;
      store.loadMoreEvents();
      TestBed.tick();
      expect(service.watchEvents.mock.calls.length).toBe(calls);
    });
  });
});
