import { CanonicalPath, FormMemoryField, isCanonicalPath } from '@shared';
import type { FormField } from './analyzer';
import { isCompatible, Mapping } from './mapping';

/** Mémoire partagée des formulaires, vue par l'extension (lecture directe, écriture par les functions `memoires-*`). */
export interface MemoryPort {
  /** Mémoire valide (non invalidée) de ce formulaire, ou null. */
  load(origin: string, fingerprint: string): Promise<LoadedMemory | null>;
  /** Apprend le formulaire : appelé APRÈS un remplissage réussi et validé par le courtier. */
  save(origin: string, fingerprint: string, fields: FormMemoryField[]): Promise<void>;
  /** La mémoire a servi sans problème. */
  touch(key: string): Promise<void>;
  /** La mémoire a servi et le remplissage a échoué : à invalider (réapprentissage). */
  invalidate(key: string): Promise<void>;
}

export interface LoadedMemory {
  key: string;
  fields: FormMemoryField[];
}

/**
 * Identifiant du document `formMemories` : sha256(`origin|empreinte`) en hexadécimal, 32 premiers caractères.
 * Doit rester identique au calcul de `memoires-enregistrer` côté serveur (vecteur de test commun).
 */
export async function memoryKeyFor(origin: string, fingerprint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${origin}|${fingerprint}`));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 32);
}

/** Part d'un mapping retenue grâce à la mémoire. */
export interface AppliedMemory {
  mappings: Mapping[];
  /** Champs dont le mapping vient de la mémoire (et non des synonymes). */
  fromMemory: Set<string>;
  /** Entrées de la mémoire écartées : chemin hors du dossier, incompatible avec le champ, ou démenti par les synonymes. */
  rejected: string[];
}

/**
 * Applique une mémoire au mapping des synonymes (E8-2) : les champs qu'ils n'ont pas tranchés reçoivent le chemin appris,
 * sans appel à l'IA. La mémoire est partagée par tous les cabinets, donc jamais crue sur parole :
 * - un chemin doit être dans la liste fermée, dans le dossier et compatible avec le type du champ ;
 * - un mapping des synonymes SÛR l'emporte sur la mémoire en cas de désaccord ;
 * - « aucun équivalent » (null) est appris aussi : ces champs ne repartent pas vers l'IA.
 */
export function applyMemory(
  fields: FormField[],
  heuristic: Mapping[],
  memoryFields: readonly FormMemoryField[],
  allowedPaths: readonly CanonicalPath[],
): AppliedMemory {
  const learned = new Map(memoryFields.map(entry => [entry.fieldKey, entry]));
  const fieldByKey = new Map(fields.map(field => [field.key, field]));
  const fromMemory = new Set<string>();
  const rejected: string[] = [];

  const mappings = heuristic.map((mapping): Mapping => {
    const entry = learned.get(mapping.fieldKey);
    const field = fieldByKey.get(mapping.fieldKey);
    if (!entry || !field || mapping.status === 'mapped') {
      if (entry && mapping.status === 'mapped' && entry.canonicalPath !== mapping.canonicalPath) rejected.push(mapping.fieldKey);
      return mapping;
    }
    if (entry.canonicalPath === null) {
      fromMemory.add(mapping.fieldKey);
      return { ...mapping, canonicalPath: null, status: 'unmapped', source: 'memory', confidence: 0 };
    }
    const path = entry.canonicalPath;
    if (!isCanonicalPath(path) || !allowedPaths.includes(path) || !isCompatible(field, path)) {
      rejected.push(mapping.fieldKey);
      return mapping;
    }
    fromMemory.add(mapping.fieldKey);
    return { ...mapping, canonicalPath: path, status: 'mapped', source: 'memory', confidence: Math.min(Math.max(entry.confidence, 0.75), 0.95) };
  });
  return { mappings, fromMemory, rejected };
}

const MAX_LABEL = 120;

/** Un libellé est un texte de formulaire : s'il ressemble à une donnée saisie (e-mail, numéro), il n'est pas conservé. */
export function safeLabel(label: string): string | null {
  const text = label.trim();
  if (!text || text.length > MAX_LABEL) return null;
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text) || /\d{6,}/.test(text.replace(/[\s.\-/]/g, ''))) return null;
  return text;
}

/**
 * Ce que l'extension retient d'un formulaire : sa STRUCTURE (champs, types, libellés) et le chemin associé, jamais une valeur.
 * Un champ sans équivalent est conservé avec un chemin `null`, pour ne pas le soumettre à l'IA à chaque fois.
 */
export function toMemoryFields(fields: FormField[], mappings: Mapping[]): FormMemoryField[] {
  const byKey = new Map(mappings.map(mapping => [mapping.fieldKey, mapping]));
  return fields.map(field => {
    const mapping = byKey.get(field.key);
    const mapped = mapping?.status === 'mapped' && mapping.canonicalPath !== null;
    return {
      fieldKey: field.key,
      label: safeLabel(field.label),
      type: field.kind,
      order: field.order,
      canonicalPath: mapped ? mapping.canonicalPath : null,
      confidence: mapped ? Math.round(mapping.confidence * 100) / 100 : 0,
    };
  });
}
