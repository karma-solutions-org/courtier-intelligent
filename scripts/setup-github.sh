#!/usr/bin/env bash
# Configure le backlog GitHub de Courtier Intelligent : labels, milestones (sprints), epics et stories.
# Usage (Git Bash, depuis la racine du repo) : bash scripts/setup-github.sh
set -euo pipefail

REPO="dhiamockchahasg-coder/courtier-intelligent"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "== Labels"
LABELS=(
  "epic:5319e7" "story:0e8a16" "spike:fbca04" "bug:d73a4a"
  "P1:b60205" "P2:d93f0b" "P3:c5def5"
  "app:1d76db" "extension:0052cc" "functions:006b75" "firestore:5ebeff"
)
for i in $(seq 0 15); do LABELS+=("E$i:ededed"); done
for l in "${LABELS[@]}"; do
  gh label create "${l%%:*}" --color "${l##*:}" --repo "$REPO" --force >/dev/null
done

echo "== Milestones (sprints)"
SPRINTS=(
  "S1|Je me connecte dans un cabinet isolé"
  "S2|J'invite mon équipe, le catalogue Auto existe + spike extension"
  "S3|Je crée un assuré et je remplis un dossier"
  "S4|Mon dossier est complet et le besoin est validé"
  "S5|L'extension est connectée et analyse l'extranet A"
  "S6|L'extension remplit l'assureur A"
  "S7|J'obtiens le tarif de l'assureur A dans l'app"
  "S8|J'ai les 3 tarifs"
  "S9|Je compare et je choisis"
  "S10|J'envoie, je suis le dossier, je pilote"
  "S11|Pré-remplissage OCR + pilote"
)
EXISTING_MS="$(gh api "repos/$REPO/milestones?state=all&per_page=100" -q '.[].title')"
for s in "${SPRINTS[@]}"; do
  title="${s%%|*}"
  if ! grep -qx "$title" <<<"$EXISTING_MS"; then
    gh api "repos/$REPO/milestones" -f title="$title" -f description="${s#*|}" >/dev/null
  fi
done

echo "== Epics"
EPICS=(
  "E0|Fondations" "E1|Cabinets et utilisateurs" "E2|Catalogue" "E3|Assurés"
  "E4|Dossiers" "E5|Analyse du besoin" "E6|Connexion de l'extension"
  "E7|Mapping et remplissage (extension)" "E8|Mémoire partagée des formulaires"
  "E9|Tarification dans l'app" "E10|Capture du tarif (extension)"
  "E11|Les 3 assureurs réels" "E12|Documents et OCR"
  "E13|Comparatif et décision" "E14|Proposition et suivi" "E15|Tableau de bord"
)
EXISTING_ISSUES="$(gh issue list --repo "$REPO" --state all --limit 500 --json title -q '.[].title')"
for e in "${EPICS[@]}"; do
  title="${e%%|*} · ${e#*|}"
  if ! grep -qxF "$title" <<<"$EXISTING_ISSUES"; then
    gh issue create --repo "$REPO" --title "$title" --label "epic,${e%%|*}" \
      --body "Epic **${e#*|}** — les stories liées portent le label \`${e%%|*}\`." >/dev/null
    echo "  + $title"
  fi
done

echo "== Stories"
while IFS=$'\t' read -r title labels milestone points criteria; do
  [ -z "$title" ] && continue
  if grep -qxF "$title" <<<"$EXISTING_ISSUES"; then continue; fi
  body="$(printf '## Critères d'\''acceptation\n- [ ] %s\n\n**Estimation :** %s points\n\n## Definition of Done\n- [ ] Testé en local (emulators)\n- [ ] Code relu et compris\n- [ ] PR mergée dans develop' "$criteria" "$points")"
  gh issue create --repo "$REPO" --title "$title" --label "$labels" --milestone "$milestone" --body "$body" >/dev/null
  echo "  + $title"
done < "$DIR/backlog.tsv"

echo "== Terminé"
