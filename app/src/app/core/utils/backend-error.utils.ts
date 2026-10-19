/**
 * Message d'une erreur renvoyée par une Cloud Function (HttpsError) : le backend
 * rédige déjà ses messages en français pour l'utilisateur.
 */
/** Messages des raisons métier récentes : toujours en français, même si le serveur n'en donne pas. */
export const BACKEND_REASON_MESSAGES: Record<string, string> = {
  email_not_verified: "Votre adresse email n'est pas encore vérifiée : ouvrez le lien reçu par email, puis réessayez.",
  already_member: 'Ce compte est déjà rattaché à un cabinet.',
  wrong_email: "Cette invitation a été envoyée à une autre adresse email. Connectez-vous avec l'adresse invitée.",
  need_incomplete: 'Choisissez un niveau de couverture et au moins une garantie avant de valider.',
  offer_stale:
    'Cette offre est périmée : les informations du dossier ont changé depuis le tarif. Relancez la tarification de cet assureur.',
  dossier_protected:
    'Un dossier dont la proposition a été envoyée ne peut pas être supprimé définitivement (un client qui en a un non plus).',
  use_sans_suite: 'Utilisez « Classer sans suite » et indiquez un motif.',
  job_not_active: "Cette tarification n'est plus en cours : elle ne peut pas être annulée.",
  search_unavailable: 'La recherche est momentanément indisponible. Réessayez.',
};

export function toBackendErrorMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  const reason = toBackendErrorReason(error);
  if (reason && BACKEND_REASON_MESSAGES[reason]) {
    return BACKEND_REASON_MESSAGES[reason];
  }
  if (code === 'functions/internal' || code === 'functions/unavailable' || !message) {
    return 'Le service est momentanément indisponible. Réessayez.';
  }
  // Envoi de fichier refusé par les règles Storage : jamais le message technique (chemin complet du fichier).
  if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
    return "L'envoi du fichier a été refusé. Si le problème persiste, contactez votre administrateur.";
  }
  if (code?.startsWith('storage/')) {
    return "L'envoi du fichier a échoué. Réessayez.";
  }
  // Erreurs Firestore (lecture/écriture directe) : jamais le message technique en anglais.
  // Les erreurs des functions (préfixe « functions/ ») portent déjà un message en français.
  if (!code?.startsWith('functions/')) {
    const bare = code?.replace(/^firestore\//, '');
    if (bare === 'permission-denied' || bare === 'unauthenticated') {
      return "Vous n'avez pas les droits pour cette action. Si le problème persiste, contactez votre administrateur.";
    }
    if (bare === 'unavailable' || bare === 'deadline-exceeded') {
      return 'Connexion au serveur impossible. Vérifiez votre réseau et réessayez.';
    }
    if (bare && /^[a-z-]+$/.test(bare)) {
      return "L'opération a échoué. Réessayez.";
    }
  }
  return message;
}

/** Raison métier d'une erreur (`details.reason` de l'HttpsError), ex. « device_not_authorized ». */
export function toBackendErrorReason(error: unknown): string | null {
  const reason = ((error ?? {}) as { details?: { reason?: unknown } }).details?.reason;
  return typeof reason === 'string' ? reason : null;
}
