export const SETTINGS_STRUCTURE = {
  title: 'Paramètres du cabinet',
  tabs: { cabinet: 'Cabinet', members: 'Membres' },

  cabinet: {
    logoTitle: 'Logo',
    logoHint: 'PNG, JPG ou SVG, 2 Mo maximum. Il apparaîtra sur les propositions envoyées aux clients.',
    logoButton: 'Choisir un logo',
    logoTooBig: 'Le logo dépasse 2 Mo.',
    infoTitle: 'Informations',
    name: 'Nom du cabinet',
    nameRequired: 'Le nom est obligatoire',
    orias: 'Numéro ORIAS',
    oriasInvalid: 'Le numéro ORIAS comporte 8 chiffres',
    address: 'Adresse',
    phone: 'Téléphone',
    email: 'Email de contact',
    emailInvalid: "L'email n'est pas valide",
    save: 'Enregistrer',
  },

  members: {
    inviteTitle: 'Inviter un collaborateur',
    inviteHint: "Il recevra un email avec un lien pour rejoindre le cabinet (valable 7 jours).",
    email: 'Email',
    emailInvalid: "L'email n'est pas valide",
    role: 'Rôle',
    invite: 'Inviter',
    listTitle: 'Membres',
    columns: { member: 'Membre', role: 'Rôle', status: 'Statut' },
    you: 'vous',
    active: 'Actif',
    disabled: 'Désactivé',
    disable: 'Désactiver',
    enable: 'Réactiver',
    pendingTitle: 'Invitations en attente',
    expiresOn: 'expire le',
  },

  roles: [
    { value: 'courtier', label: 'Courtier' },
    { value: 'admin', label: 'Administrateur' },
  ],
} as const;
