/** Outils de comparaison de textes (libellés de champs, options) : sans accents, sans casse, sans ponctuation. */

export function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const words = (text: string | null | undefined): string[] => normalize(text).split(' ').filter(Boolean);

/** `phrase` apparaît dans `text` comme suite de mots entiers (« nom » est dans « votre nom », pas dans « renommer »). */
export function containsPhrase(text: string, phrase: string): boolean {
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(phrase);
  return needle !== '' && haystack.includes(` ${needle} `);
}

/** Nettoie un libellé : astérisque, deux-points, mention « obligatoire », espaces. */
export function cleanLabel(text: string): string {
  return text
    .replace(/\(\s*(obligatoire|requis|facultatif|optionnel)\s*\)/gi, '')
    .replace(/[*:]+\s*$/g, '')
    .replace(/\s*\*\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Empreinte rapide et stable (cyrb53) : identifie la structure d'un formulaire sans en conserver le contenu. */
export function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
