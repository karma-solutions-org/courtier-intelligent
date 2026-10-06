# Courtier Intelligent

SaaS back-office pour courtiers en assurance + extension Chrome **Courtier Intelligent – Remplissage auto** qui remplit les extranets des assureurs.

## Structure

| Dossier | Contenu |
|---|---|
| `app/` | Angular — back-office cabinet + console super-admin |
| `extension/` | Extension Chrome MV3 |
| `functions/` | Cloud Functions |
| `shared/` | Types partagés (modèle canonique, statuts…) |

## Branches

- `main` : production
- `develop` : intégration
- `feature/<Epic>-<description> (ex. feature/E0-fondations)` : un Epic = une branche = une PR vers `develop`

## Commits

`feat(E4): …`, `fix(E7): …`, `chore: …`, `docs: …`
