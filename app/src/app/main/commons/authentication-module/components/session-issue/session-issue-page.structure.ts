export type SessionIssueKind = 'device_not_authorized' | 'session_replaced';

export const SESSION_ISSUE_PAGE_STRUCTURE: Record<
  SessionIssueKind,
  { title: string; explanation: string; steps: string[]; icon: string }
> = {
  device_not_authorized: {
    title: 'Appareil non autorisé',
    icon: 'devices_off',
    explanation:
      "Votre compte est lié à un autre appareil : pour la sécurité de votre cabinet, un compte ne peut être utilisé que depuis un seul poste.",
    steps: [
      "Reconnectez-vous depuis l'appareil que vous utilisez habituellement.",
      "Si vous avez changé de poste, demandez à l'administrateur de votre cabinet de réinitialiser votre appareil (Paramètres → Membres), puis reconnectez-vous ici.",
    ],
  },
  session_replaced: {
    title: 'Session ouverte ailleurs',
    icon: 'logout',
    explanation:
      'Vous avez été déconnecté : une nouvelle connexion à votre compte a été ouverte, ou un administrateur a réinitialisé votre appareil.',
    steps: ['Si vous êtes à l’origine de cette connexion, reconnectez-vous simplement.', "Sinon, changez votre mot de passe et prévenez l'administrateur de votre cabinet."],
  },
};

export const SESSION_ISSUE_ACTIONS = {
  backToSignin: 'Retour à la connexion',
  detail: 'Détail',
} as const;
