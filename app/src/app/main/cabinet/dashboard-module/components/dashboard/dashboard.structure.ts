export const DASHBOARD_STRUCTURE = {
  loading: 'Chargement du tableau de bord…',
  counters: { title: 'Dossiers du cabinet par statut', hint: 'Voir les dossiers' },
  toProcess: { title: 'Mes dossiers à traiter', empty: 'Aucun dossier ne vous attend. Bravo !' },
  followUp: {
    title: 'Propositions à relancer',
    hint: 'Envoyées depuis plus de 7 jours sans réponse.',
    empty: 'Aucune proposition à relancer.',
    sentOn: 'Envoyée le',
  },
  conversion: {
    title: 'Taux de conversion',
    hint: 'Souscrits / (souscrits + refusés + sans suite).',
    byCourtier: 'Par courtier',
    byProduct: 'Par produit',
    empty: 'Aucun dossier clos pour le moment.',
    columns: { name: 'Nom', closed: 'Dossiers clos', souscrit: 'Souscrits', rate: 'Taux' },
  },
};
