/**
 * Message d'une erreur renvoyée par une Cloud Function (HttpsError) : le backend
 * rédige déjà ses messages en français pour l'utilisateur.
 */
export function toBackendErrorMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
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
