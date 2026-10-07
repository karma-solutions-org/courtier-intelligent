export const CABINETS_MANAGEMENT_STRUCTURE = {
  title: 'Cabinets',
  newCabinet: 'Nouveau cabinet',
  search: 'Rechercher un cabinet ou un ORIAS',

  form: {
    title: 'Créer un cabinet',
    hint: "Si l'administrateur n'a pas de compte, il en recevra un par email avec un lien pour choisir son mot de passe.",
    name: 'Nom du cabinet',
    orias: 'Numéro ORIAS',
    oriasInvalid: 'Le numéro ORIAS comporte 8 chiffres',
    adminName: "Nom de l'administrateur",
    adminEmail: "Email de l'administrateur",
    required: 'Champ obligatoire',
    emailInvalid: "L'email n'est pas valide",
    submit: 'Créer le cabinet',
    cancel: 'Annuler',
  },

  list: {
    columns: { name: 'Cabinet', orias: 'ORIAS', createdAt: 'Créé le', status: 'Statut' },
    active: 'Actif',
    inactive: 'Désactivé',
    activate: 'Activer',
    deactivate: 'Désactiver',
    empty: 'Aucun cabinet.',
    confirmDeactivate: 'Désactiver ce cabinet ? Ses membres seront déconnectés et ne pourront plus accéder à leurs données.',
  },
} as const;
