import type { CanonicalPath, FormMemoryField } from '@shared';
import type { RunState } from '../../shared/messages';
import type { FormAnalysis } from '../analyzer';
import type { FillResult } from '../filler';
import type { Mapping } from '../mapping';
import { applyMemory, MemoryPort, toMemoryFields } from '../memory';

/** Part de champs mappés par la mémoire dont le remplissage échoue à partir de laquelle la mémoire est invalidée. */
const MEMORY_FAILURE_RATIO = 0.3;
const MEMORY_MAX_FIELDS = 300;

/** L'étape qui vient d'être remplie : apprise quand le courtier la quitte ou la valide. */
export interface StepSnapshot {
  fingerprint: string;
  fields: FormAnalysis['fields'];
  mappings: Mapping[];
  results: Map<string, FillResult>;
  usedMemory: boolean;
}

export type LoadedMemory = { key: string; fields: FormMemoryField[] };

/** Mémoire partagée des formulaires (E8) pendant un remplissage : lecture, contrôle après remplissage, apprentissage. */
export class MemorySession {
  status: RunState['memory'] = null;
  /** Champs de l'étape affichée mappés par la mémoire. */
  fromMemory = new Set<string>();
  /** Mémoire chargée par empreinte (null : formulaire inconnu). */
  private readonly loaded = new Map<string, LoadedMemory | null>();
  /** Empreintes dont la mémoire a échoué : on revient aux synonymes et à l'IA, puis on réapprend. */
  private readonly disabled = new Set<string>();
  private readonly touched = new Set<string>();
  private readonly learned = new Set<string>();

  constructor(
    private readonly port: MemoryPort | undefined,
    private readonly origin: () => string,
  ) {}

  /**
   * La mémoire du formulaire tranche ce que les synonymes n'ont pas tranché. Renvoie le mapping et la mémoire
   * utilisée (null : pas de mémoire valide pour ce formulaire).
   */
  async map(
    analysis: FormAnalysis,
    mappings: Mapping[],
    allowedPaths: CanonicalPath[],
  ): Promise<{ mappings: Mapping[]; memory: LoadedMemory | null }> {
    this.fromMemory = new Set();
    const memory = await this.forForm(analysis.fingerprint);
    if (!memory) return { mappings, memory };
    const applied = applyMemory(analysis.fields, mappings, memory.fields, allowedPaths);
    this.fromMemory = applied.fromMemory;
    if (applied.fromMemory.size > 0) this.status = 'used';
    return { mappings: applied.mappings, memory };
  }

  /** Mémoire valide du formulaire (une lecture par empreinte), sauf si elle a déjà échoué ici. Une panne n'empêche rien. */
  private async forForm(fingerprint: string): Promise<LoadedMemory | null> {
    if (!this.port || this.disabled.has(fingerprint)) return null;
    if (!this.loaded.has(fingerprint)) {
      this.loaded.set(fingerprint, await this.port.load(this.origin(), fingerprint).catch(() => null));
    }
    return this.loaded.get(fingerprint) ?? null;
  }

  /**
   * Après remplissage : la mémoire a-t-elle servi sans problème ? Si trop de champs qu'elle a mappés échouent, elle est
   * signalée comme invalide (`memoires-invalider`) et mise de côté pour ce formulaire. Renvoie vrai quand il faut
   * recommencer l'étape sans la mémoire.
   */
  async checkHealth(fingerprint: string, key: string, mappings: Mapping[], results: Map<string, FillResult>): Promise<boolean> {
    const used = mappings.filter(m => this.fromMemory.has(m.fieldKey) && m.canonicalPath !== null);
    if (used.length === 0) return false;
    const failed = used.filter(m => results.get(m.fieldKey)?.status === 'failed').length;
    if (failed > 0 && failed / used.length >= MEMORY_FAILURE_RATIO) {
      this.disabled.add(fingerprint);
      this.status = 'invalidated';
      await this.port?.invalidate(key).catch(() => undefined);
      return true;
    }
    if (failed === 0 && !this.touched.has(fingerprint)) {
      this.touched.add(fingerprint);
      await this.port?.touch(key).catch(() => undefined);
    }
    return false;
  }

  /**
   * Apprend la structure d'une étape (E8-3) : seulement après un remplissage RÉUSSI (aucun champ en échec) et VALIDÉ
   * (le courtier est passé à l'étape suivante, ou la dernière étape est remplie), et seulement si la mémoire ne la
   * connaissait pas déjà. Jamais de valeur : champs, types, libellés et chemins canoniques. Renvoie vrai si elle a été apprise.
   */
  async learn(snapshot: StepSnapshot | null): Promise<boolean> {
    if (!snapshot || !this.port || this.learned.has(snapshot.fingerprint) || snapshot.usedMemory) return false;
    const results = [...snapshot.results.values()];
    if (results.length === 0 || results.some(r => r.status === 'failed')) return false;
    const fields = toMemoryFields(snapshot.fields, snapshot.mappings);
    if (fields.length === 0 || fields.length > MEMORY_MAX_FIELDS || !fields.some(f => f.canonicalPath !== null)) return false;
    this.learned.add(snapshot.fingerprint);
    try {
      const outcome = await this.port.save(this.origin(), snapshot.fingerprint, fields);
      // `ignored` : le serveur n'a rien retenu. `pending` : retenu pour le cabinet (mémoire commune en attente).
      if (outcome !== 'ignored') this.status = 'learned';
    } catch {
      this.learned.delete(snapshot.fingerprint); // une panne réseau : on réessaiera
      return false;
    }
    return true;
  }
}
