const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Email ou mot de passe incorrect.',
  'auth/invalid-email': "L'adresse email n'est pas valide.",
  'auth/user-disabled': 'Ce compte a été désactivé.',
  // Message identique à un mauvais mot de passe : ne pas révéler si un compte existe.
  'auth/user-not-found': 'Email ou mot de passe incorrect.',
  'auth/wrong-password': 'Email ou mot de passe incorrect.',
  'auth/email-already-in-use': "Un compte existe déjà avec cet email.",
  'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
  'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
  'auth/network-request-failed': 'Problème de connexion réseau.',
};

/** Traduit une erreur Firebase Auth en message lisible pour le courtier. */
export function toAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  return AUTH_ERROR_MESSAGES[code] ?? 'Une erreur est survenue. Réessayez.';
}
