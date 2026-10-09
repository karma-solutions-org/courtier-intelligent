import { navigationFor } from './navigation.structure';

/** Les libellés visibles, section par section, pour un rôle. */
const labelsFor = (role: Parameters<typeof navigationFor>[0]) =>
  navigationFor(role).flatMap(section => section.items.map(item => item.label));

describe('navigationFor', () => {
  it('montre au courtier ses dossiers et assurés, sans les paramètres du cabinet', () => {
    expect(labelsFor('courtier')).toEqual(['Tableau de bord', 'Dossiers', 'Assurés']);
  });

  it("ajoute les paramètres du cabinet pour l'admin", () => {
    expect(labelsFor('admin')).toEqual(['Tableau de bord', 'Dossiers', 'Assurés', 'Paramètres']);
  });

  it('ne montre que le tableau de bord à un compte sans cabinet', () => {
    expect(labelsFor(null)).toEqual(['Tableau de bord']);
  });

  it('ne garde aucune section vide', () => {
    for (const role of ['courtier', 'admin', null] as const) {
      expect(navigationFor(role).every(section => section.items.length > 0)).toBe(true);
    }
  });
});
