import { TestBed } from '@angular/core/testing';
import { Dossier } from '@shared';
import { firstValueFrom } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { FakeBackendProvider } from '../../../../core/utils/unit-test-utils/mocks/fake-backend.provider';
import { FakeDatabaseProvider } from '../../../../core/utils/unit-test-utils/mocks/fake-database.provider';
import { DossiersService } from './dossiers.service';

const DOSSIERS = 'ci_cabinets/c1/ci_dossiers';
const dossier = (id: string, extra: Partial<Dossier> = {}) => ({ id, reference: id.toUpperCase(), ...extra }) as unknown as Dossier;

describe('DossiersService', () => {
  let service: DossiersService;
  let database: FakeDatabaseProvider;
  let backend: FakeBackendProvider;

  beforeEach(() => {
    database = new FakeDatabaseProvider();
    backend = new FakeBackendProvider();
    TestBed.configureTestingModule({
      providers: [
        { provide: DatabaseProvider, useValue: database },
        { provide: BackendProvider, useValue: backend },
      ],
    });
    service = TestBed.inject(DossiersService);
  });

  describe('lectures (entité → chemin → Firestore)', () => {
    it('lit un dossier dans la collection de son cabinet', async () => {
      database.givenDocument(`${DOSSIERS}/d1`, dossier('d1'));

      const result = await firstValueFrom(service.watchDossier('c1', 'd1'));

      expect(result?.id).toBe('d1');
      expect(database.calls).toEqual([{ method: 'watchDocument', path: `${DOSSIERS}/d1` }]);
    });

    it("rend null pour un dossier qui n'existe pas", async () => {
      expect(await firstValueFrom(service.watchDossier('c1', 'absent'))).toBeNull();
    });

    it('trie tous les dossiers du plus récent au plus ancien', async () => {
      await firstValueFrom(service.watchAllDossiers('c1'));

      expect(database.calls[0]).toEqual({
        method: 'watchCollection',
        path: DOSSIERS,
        query: { orderBy: [{ field: 'createdAt', direction: 'desc' }] },
      });
    });

    it('lit une tranche limitée, écarte la corbeille et signale qu’il en reste', async () => {
      database.givenDocuments(DOSSIERS, [dossier('d1'), dossier('d2', { deletedAt: {} as Dossier['deletedAt'] })]);

      const page = await firstValueFrom(service.watchDossiersPage('c1', 2));

      expect(database.calls[0].query).toEqual({ orderBy: [{ field: 'createdAt', direction: 'desc' }], limit: 2 });
      expect(page.dossiers.map((d) => d.id)).toEqual(['d1']);
      // La tranche est pleine (2 documents lus, corbeille comprise) : il peut y en avoir d'autres.
      expect(page.hasMore).toBe(true);
    });

    it('rend les dossiers trouvés dans l’ordre demandé, sans ceux de la corbeille', async () => {
      database.givenDocuments(DOSSIERS, [dossier('a'), dossier('b', { deletedAt: {} as Dossier['deletedAt'] }), dossier('c')]);

      const result = await firstValueFrom(service.watchDossiersByIds('c1', ['c', 'b', 'a']));

      expect(result.map((d) => d.id)).toEqual(['c', 'a']);
      expect(database.calls[0]).toEqual({ method: 'watchByIds', path: DOSSIERS, ids: ['c', 'b', 'a'] });
    });

    it("lit l'historique du dossier, du plus récent au plus ancien", async () => {
      database.givenDocuments(`${DOSSIERS}/d1/ci_events`, [{ id: 'e1' }]);

      const result = await firstValueFrom(service.watchEvents('c1', 'd1', 20));

      expect(database.calls[0]).toEqual({
        method: 'watchCollection',
        path: `${DOSSIERS}/d1/ci_events`,
        query: { orderBy: [{ field: 'at', direction: 'desc' }], limit: 20 },
      });
      expect(result).toEqual({ events: [{ id: 'e1' }], hasMore: false });
    });

    it('lit les produits du catalogue global seulement (les mêmes pour tous les cabinets)', async () => {
      database.givenDocuments('ci_products', [{ id: 'auto' }]).givenDocuments('ci_cabinets/c1/ci_products', [{ id: 'cab-moto' }]);

      const products = await firstValueFrom(service.watchProducts());

      expect(products.map((p) => p.id)).toEqual(['auto']);
    });

    it('lit les membres et le client dans le cabinet', async () => {
      await firstValueFrom(service.watchMembers('c1'));
      await firstValueFrom(service.watchAssure('c1', 'a1'));

      expect(database.calls.map((call) => call.path)).toEqual(['ci_cabinets/c1/ci_members', 'ci_cabinets/c1/ci_assures/a1']);
    });
  });

  describe('écritures (Cloud Functions)', () => {
    it('enregistre les réponses par dossiers-sauvegarder, avec la section', async () => {
      backend.givenResponse('dossiers-sauvegarder', { status: 'brouillon', completeness: { ok: false, missing: [] } });

      await firstValueFrom(service.save('d1', { 'client.lastName': 'Dupont' }, { sectionIndex: 2 }));

      expect(backend.calls).toEqual([
        { name: 'dossiers-sauvegarder', data: { dossierId: 'd1', patch: { 'client.lastName': 'Dupont' }, sectionIndex: 2 } },
      ]);
      expect(database.calls).toEqual([]);
    });

    it('change le statut, assigne et classe sans suite par leurs functions', async () => {
      await firstValueFrom(service.changeStatus('d1', 'complet'));
      await firstValueFrom(service.assign('d1', 'u2'));
      await firstValueFrom(service.classerSansSuite('d1', 'Client injoignable'));

      expect(backend.calls).toEqual([
        { name: 'dossiers-changerStatut', data: { dossierId: 'd1', status: 'complet' } },
        { name: 'dossiers-assigner', data: { dossierId: 'd1', uid: 'u2' } },
        { name: 'dossiers-classerSansSuite', data: { dossierId: 'd1', motif: 'Client injoignable' } },
      ]);
    });

    it('n’envoie pas les filtres vides à la recherche', async () => {
      backend.givenResponse('recherche-dossiers', { ids: ['d3', 'd1'] });

      const ids = await firstValueFrom(service.search({ q: 'dup', size: 20, status: '', productId: undefined }));

      expect(ids).toEqual(['d3', 'd1']);
      expect(backend.calls[0]).toEqual({ name: 'recherche-dossiers', data: { q: 'dup', size: 20 } });
    });
  });
});
