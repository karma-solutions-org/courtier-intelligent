/** Minuscules, sans accents ni espaces multiples (recherche). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minuit local il y a `days` jours (setDate : juste lors d'un changement d'heure, contrairement à 24 h fixes). */
export function daysAgo(days: number): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.getTime();
}
