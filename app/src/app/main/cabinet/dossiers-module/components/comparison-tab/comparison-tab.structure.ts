export const COMPARISON_STRUCTURE = {
  loading: 'Chargement des offres…',
  empty:
    "Aucune offre pour l'instant : lancez une tarification ou saisissez une offre dans l'onglet Tarification.",
  indicativeScore:
    "Score indicatif d'adéquation à la couverture souhaitée (sur 100), calculé à partir des écarts : il ne remplace pas l'avis du courtier.",
  noNeed: 'Aucune couverture souhaitée enregistrée : les écarts et le score ne sont pas calculés.',
  decided: 'Offre retenue',
  decisionSaved: 'Offre retenue : le dossier passe en « Décision ».',
  table: {
    insurer: 'Assureur',
    score: 'Score',
    premiumAnnual: 'Prime annuelle',
    premiumMonthly: 'Prime mensuelle',
    generalDeductible: 'Franchise générale',
    guarantees: 'Garanties',
    gaps: 'Écarts avec la demande',
    noGap: 'Aucun écart',
    choose: 'Choisir cette offre',
    chosen: 'Offre retenue',
    coverage: { included: 'Incluse', limited: 'Incluse avec plafond', absent: 'Absente' },
    mandatory: 'indispensable',
    niceToHave: 'souhaitée',
    limit: 'plafond',
    deductible: 'franchise',
  },
  dialog: {
    title: "Retenir l'offre",
    justification: 'Justification du choix',
    hint: "Pourquoi cette offre ? (10 caractères minimum, conservé dans l'historique)",
    cancel: 'Annuler',
    confirm: 'Retenir cette offre',
  },
} as const;
