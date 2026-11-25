/** Textes de l'onglet Tarification. */
export const PRICING_TAB_STRUCTURE = {
  needNotValidated: 'Validez la couverture souhaitée (étape Couverture) pour lancer les tarifications.',
  closed: 'La tarification est terminée pour ce dossier : les offres reçues restent consultables.',
  noExtension:
    'Extension Chrome non détectée : installez-la et connectez-vous pour remplir les extranets automatiquement. La saisie manuelle reste possible.',
  loading: 'Chargement des tarifications…',
  noInsurer:
    'Aucun assureur ne tarifie ce produit pour votre cabinet. Un administrateur peut en activer dans Paramètres.',
  /** Ajout d'un assureur pendant la tarification (bouton, boîte de dialogue, messages du store). */
  addInsurer: {
    button: 'Ajouter un assureur',
    title: 'Ajouter un assureur',
    chooseIntro: 'Choisissez le ou les assureurs à ajouter à la tarification de ce dossier.',
    questionsIntro:
      'Ces assureurs demandent des informations absentes du dossier. Elles y seront enregistrées avec l’ajout.',
    noQuestion: 'Aucune question supplémentaire.',
    cancel: 'Annuler',
    next: 'Suivant',
    back: 'Retour',
    submit: 'Ajouter',
    added: 'Assureur ajouté : lancez sa tarification.',
    removeRefused: 'Un assureur choisi ne peut pas être retiré pendant la tarification.',
    incomplete: 'Renseignez les informations demandées par le nouvel assureur.',
  },
} as const;
