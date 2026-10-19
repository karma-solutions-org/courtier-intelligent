# Extranet de démonstration « Maison Sûre (démo locale) »

Second faux extranet **habitation**, 100 % statique, servi sur <http://localhost:8092>. Il pose **les mêmes questions**
qu'Assureur Habitat (`demo-extranet-habitation/`, port 8091) mais renvoie un autre tarif et d'autres garanties :
avec les deux, un dossier Habitation a deux offres à **comparer**.

| Différence | Assureur Habitat (8091) | Maison Sûre (8092) |
| --- | --- | --- |
| Devis | HAB-DEMO-2026-0007 | MSH-DEMO-2026-0019 |
| Franchise générale | 150 € | 200 € |
| Vol et vandalisme | plafond 20 000 € | plafond 30 000 € |
| Bris de glace | incluse | non incluse |
| Objets de valeur | non incluse | incluse (8 000 €) |
| Rééquipement à neuf | — | incluse |

La lecture par le vrai moteur est vérifiée par `src/engine/demo-extranet-habitation-2.test.ts` (`npm test`).

## Pas à pas (après la démo Assureur Habitat)

1. **Extranet** : dans `extension/`, `npm run demo:extranet-habitation-2` (laisser le terminal ouvert).
2. **Assureur** : Paramètres → Assureurs et produits → **Ajouter un assureur** → nom `Maison Sûre (démo)`, adresse
   `http://localhost:8092/index.html`, produit tarifé **Habitation** → Ajouter.
3. **Tarifer** : sur le dossier Habitation, **Tarifer** sur la carte « Maison Sûre (démo) ».
4. **Extranet** : <http://localhost:8092/index.html> → **Accéder à l'espace courtier**, puis **Suivant** à chaque étape
   et **Calculer mon tarif**. Dans le panneau de l'extension : **Confirmer et enregistrer**.
5. **Comparatif** : avec les deux offres enregistrées, l'onglet **Comparatif** du dossier les met côte à côte.

Le domaine est enregistré avec son port (`localhost:8092`) : l'extension ne confond pas les trois démos locales.
