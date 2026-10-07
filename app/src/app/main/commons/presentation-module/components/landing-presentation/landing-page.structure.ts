export const LANDING_PAGE_STRUCTURE = {
  brand: 'Courtier Intelligent',
  nav: [
    { label: 'Fonctionnalités', fragment: 'fonctionnalites' },
    { label: 'Comment ça marche', fragment: 'fonctionnement' },
    { label: 'Extension', fragment: 'extension' },
    { label: 'Conformité', fragment: 'conformite' },
  ],
  signin: 'Connexion',
  signup: "S'inscrire",
  mySpace: 'Mon espace',

  hero: {
    eyebrow: 'Le back-office des cabinets de courtage',
    title: 'Trois tarifs, un comparatif, un conseil justifié.',
    highlight: 'Sans ressaisir.',
    subtitle:
      "Saisissez le dossier une seule fois. Notre extension remplit les extranets des assureurs à votre place, rapatrie les offres et les compare au besoin de votre client.",
    primaryCta: 'Se connecter',
    secondaryCta: 'Découvrir le fonctionnement',
  },

  mock: {
    title: 'Comparatif — Dossier 2026-000123',
    subtitle: 'Auto · Tous risques · Budget 900 €/an',
    offers: [
      { insurer: 'Assureur A', premium: '842 €', deductible: '300 €', status: 'ok', label: 'Conforme au besoin' },
      { insurer: 'Assureur B', premium: '799 €', deductible: '600 €', status: 'warn', label: 'Franchise au-dessus du seuil' },
      { insurer: 'Assureur C', premium: '965 €', deductible: '250 €', status: 'ko', label: 'Hors budget' },
    ],
    premiumLabel: 'Prime / an',
    deductibleLabel: 'Franchise',
    chosen: 'Offre retenue',
  },

  stats: [
    { value: '3', label: 'tarifs obtenus par dossier' },
    { value: '1', label: 'seule saisie du dossier' },
    { value: '100 %', label: 'des choix justifiés et tracés' },
  ],

  steps: {
    eyebrow: 'Comment ça marche',
    title: 'Du premier contact à la souscription',
    items: [
      { icon: 'folder_open', title: 'Saisir le dossier', text: "Identité de l'assuré, produit et questionnaire, dans un formulaire guidé qui signale ce qui manque." },
      { icon: 'psychology', title: 'Analyser le besoin', text: 'Niveau de couverture, budget, franchise acceptable et garanties indispensables.' },
      { icon: 'bolt', title: 'Obtenir 3 tarifs', text: "L'extension remplit les extranets des assureurs étape par étape. Vous vérifiez et validez." },
      { icon: 'compare_arrows', title: 'Comparer et choisir', text: "Les offres côte à côte, avec les écarts au besoin mis en évidence. Vous justifiez votre choix." },
      { icon: 'send', title: 'Proposer et suivre', text: "Envoi de la proposition au client et suivi du dossier jusqu'à la souscription." },
    ],
  },

  features: {
    eyebrow: 'Fonctionnalités',
    title: 'Tout le cycle du dossier, au même endroit',
    items: [
      { icon: 'dashboard', title: 'Tableau de bord', text: 'Vos dossiers par statut, ceux à traiter et les propositions à relancer.' },
      { icon: 'dynamic_form', title: 'Questionnaires dynamiques', text: "Un formulaire adapté à chaque produit, qui n'affiche que les questions utiles." },
      { icon: 'fact_check', title: 'Écarts au besoin', text: 'Hors budget, franchise trop élevée, garantie manquante : chaque écart est signalé.' },
      { icon: 'history', title: 'Historique complet', text: "Chaque action est tracée : qui a fait quoi, et quand." },
      { icon: 'groups', title: 'Travail en équipe', text: "Invitez vos collaborateurs, attribuez les dossiers, gérez les rôles." },
      { icon: 'document_scanner', title: 'Lecture de documents', text: 'Carte grise, permis, relevé d\'information : les champs sont pré-remplis.' },
    ],
  },

  extension: {
    eyebrow: 'Extension Chrome',
    title: "Les extranets se remplissent tout seuls",
    text: "L'extension reconnaît les formulaires des assureurs, y reporte les informations du dossier et vous signale ce qui manque. Une fois un extranet appris, il l'est pour tous.",
    points: [
      'Remplissage étape par étape, sur vos propres accès',
      "Vous gardez la main : c'est vous qui validez sur l'extranet",
      "Tarif rapatrié automatiquement dans le dossier",
      "Saisie manuelle toujours possible en secours",
    ],
    panelTitle: 'Remplissage en cours',
    panelSteps: [
      { label: 'Souscripteur', done: true },
      { label: 'Véhicule', done: true },
      { label: 'Conducteur', done: true },
      { label: 'Antécédents', done: false },
      { label: 'Tarif', done: false },
    ],
    panelMissing: '1 information manquante : date du permis',
  },

  compliance: {
    eyebrow: 'Conformité',
    title: 'Le devoir de conseil, intégré au parcours',
    text: "L'analyse du besoin, les offres étudiées et la justification de votre choix sont conservées dans le dossier. Vous démontrez votre conseil à tout moment.",
    items: [
      { icon: 'verified_user', title: 'Besoin formalisé', text: 'Couverture, budget, franchise et garanties exigées, validés avant la tarification.' },
      { icon: 'gavel', title: 'Choix justifié', text: "Impossible de retenir une offre sans motiver ce choix." },
      { icon: 'lock', title: 'Données cloisonnées', text: 'Chaque cabinet ne voit que ses propres données.' },
    ],
  },

  cta: {
    title: 'Prêt à gagner du temps sur chaque dossier ?',
    text: 'Connectez-vous à votre espace cabinet.',
    button: 'Se connecter',
  },

  footer: {
    tagline: 'Le back-office des cabinets de courtage en assurance.',
    copyright: `© ${new Date().getFullYear()} Courtier Intelligent`,
  },
} as const;
