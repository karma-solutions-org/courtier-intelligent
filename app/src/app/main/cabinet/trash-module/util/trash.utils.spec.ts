import { Assure, Dossier } from '@shared';
import { NOT_LOADING, TrashSources, trashGroups, visibleTrashGroups } from './trash.utils';

const at = (millis: number) => ({ toMillis: () => millis });
const now = Date.now();
const assure = (overrides: Partial<Assure>): Assure =>
  ({ id: 'a1', type: 'particulier', firstName: 'Élodie', lastName: 'Martin', deletedAt: at(now), ...overrides }) as Assure;
const dossier = (overrides: Partial<Dossier>): Dossier =>
  ({ id: 'd1', reference: '2026-000001', assureId: 'a1', status: 'complet', deletedAt: at(now), deletedWith: null, ...overrides }) as Dossier;

const sources = (overrides: Partial<TrashSources>): TrashSources => ({
  deletedAssures: { items: [], hasMore: false, loaded: true },
  deletedDossiers: { items: [], hasMore: false, loaded: true },
  search: null,
  dossierAssures: [],
  loadingMore: NOT_LOADING,
  searchLoadingMore: NOT_LOADING,
  searching: false,
  ...overrides,
});

describe('trashGroups', () => {
  it('bloque un dossier dont le client est dans la corbeille', () => {
    const [, dossiers] = trashGroups(
      sources({ deletedAssures: { items: [assure({})], hasMore: false, loaded: true }, deletedDossiers: { items: [dossier({})], hasMore: false, loaded: true } }),
    );
    expect(dossiers.rows[0].blocked).toContain('restaurez le client');
  });

  it('range les dossiers partis avec leur client sur la ligne du client, protégée s’il a une proposition envoyée', () => {
    const [clients, dossiers] = trashGroups(
      sources({
        deletedAssures: { items: [assure({})], hasMore: false, loaded: true },
        deletedDossiers: { items: [dossier({ deletedWith: 'a1', status: 'proposition_envoyee' })], hasMore: false, loaded: true },
      }),
    );
    expect(dossiers.rows).toEqual([]);
    expect(clients.rows[0].protected).toBe(true);
  });

  it('affiche un chargement tant que la première réponse n’est pas arrivée', () => {
    const [clients] = trashGroups(sources({ deletedAssures: { items: [], hasMore: false, loaded: false } }));
    expect(clients.loading).toBe(true);
  });
});

describe('visibleTrashGroups', () => {
  const groups = trashGroups(
    sources({
      deletedAssures: { items: [assure({}), assure({ id: 'a2', firstName: 'Paul', lastName: 'Durand', deletedAt: at(now - 40 * 86_400_000) })], hasMore: false, loaded: true },
    }),
  );

  it('filtre sur le texte, sans tenir compte des accents', () => {
    const [clients] = visibleTrashGroups(groups, { query: 'elodie', kind: 'all', period: 0 }, false);
    expect(clients.rows.map((row) => row.id)).toEqual(['a1']);
  });

  it('filtre sur la période de suppression et le type', () => {
    expect(visibleTrashGroups(groups, { query: '', kind: 'all', period: 30 }, false)[0].rows.map((row) => row.id)).toEqual(['a1']);
    expect(visibleTrashGroups(groups, { query: '', kind: 'dossier', period: 0 }, false).map((group) => group.kind)).toEqual(['dossier']);
  });
});
