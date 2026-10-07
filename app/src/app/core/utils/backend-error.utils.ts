/**
 * Message d'une erreur renvoyée par une Cloud Function (HttpsError) : le backend
 * rédige déjà ses messages en français pour l'utilisateur.
 */
export function toBackendErrorMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (code === 'functions/internal' || code === 'functions/unavailable' || !message) {
    return 'Le service est momentanément indisponible. Réessayez.';
  }
  return message;
}
