import { CanonicalPath, ExtensionReportIssue, ExtensionReportStep, FormMemoryField, MissingField } from '@shared';
import type { CapturedOffer, CaptureState, JobContext, JobUpdate, RunField, RunState } from '../shared/messages';
import { AskAi, resolveWithAi } from './ai-fallback';
import { analyzeForm, FormAnalysis } from './analyzer';
import { detectResultPage, extractFromDom, hasPremium, hasResultHeading, parseAmounts, visibleText } from './capture';
import { captureWithAi, mergeOffers } from './capture-ai';
import { PATH_EXPECTED } from './field-synonyms';
import { fillField, FillResult } from './filler';
import { asCanonicalPath, isCompatible, Mapping, mapFields } from './mapping';
import { applyMemory, MemoryPort, toMemoryFields } from './memory';
import { FillPlan, planFill } from './plan';
import { detectStepHint, isFinalStep, isNewStep, StepHint, waitForSettled } from './steps';

export interface RunnerPorts {
  doc: Document;
  /** Écrit l'avancement du job (statut, étape, champs manquants) : le service worker le transmet à Firestore. */
  report(update: JobUpdate): Promise<void>;
  /** Publie l'avancement détaillé pour le side panel. */
  publish(state: RunState): void;
  askAi: AskAi;
  /** Signale un échec du remplissage ou de la capture du tarif (E10-4) : un code, jamais de donnée client. */
  reportIssue?(step: ExtensionReportStep, issue: ExtensionReportIssue): Promise<void>;
  /** Mémoire partagée des formulaires (E8) : sans elle, tout se fait par synonymes puis IA. */
  memory?: MemoryPort;
  /** Origine de l'extranet, clé de la mémoire (par défaut : celle de la page). */
  origin?: string;
  quietMs?: number;
  settleTimeoutMs?: number;
}

/** Relances maximales dans une étape quand le remplissage révèle de nouveaux champs. */
const MAX_FOLLOW_UPS = 3;
/** Part de champs mappés par la mémoire dont le remplissage échoue à partir de laquelle la mémoire est invalidée. */
const MEMORY_FAILURE_RATIO = 0.3;
const MEMORY_MAX_FIELDS = 300;

/**
 * Remplit l'extranet d'un assureur pour un job de tarification, étape par étape.
 *
 * Règles : l'extension ne clique JAMAIS sur « Suivant » ni sur « Obtenir mon tarif » (le courtier avance et soumet
 * lui-même) ; elle remplit l'étape affichée, signale ce qui manque (`needs_info`), puis surveille la page : quand
 * le courtier passe à l'étape suivante, elle attend la fin du chargement et remplit à nouveau.
 */
export class FormRunner {
  private analysis: FormAnalysis | null = null;
  private mappings: Mapping[] = [];
  private lastStep: { keys: string[]; hint: StepHint } = { keys: [], hint: { current: null, total: null } };
  private stepCounter = 0;
  /** Corrections manuelles du courtier : clé du champ → chemin (ou null pour « ne pas remplir »). */
  private readonly manual = new Map<string, CanonicalPath | null>();
  /** Valeurs déjà écrites, pour ne pas réécrire un champ que le courtier a pu corriger. */
  private readonly written = new Map<string, string>();
  private readonly aiTried = new Set<string>();
  private aiUsed = false;
  // ── Mémoire partagée (E8) ──
  /** Mémoire chargée par empreinte (null : formulaire inconnu). */
  private readonly loadedMemory = new Map<string, { key: string; fields: FormMemoryField[] } | null>();
  /** Empreintes dont la mémoire a échoué : on revient aux synonymes et à l'IA, puis on réapprend. */
  private readonly memoryDisabled = new Set<string>();
  private readonly memoryTouched = new Set<string>();
  private readonly learned = new Set<string>();
  private memoryStatus: RunState['memory'] = null;
  private fromMemory = new Set<string>();
  /** L'étape qui vient d'être remplie : apprise quand le courtier la quitte ou la valide. */
  private snapshot: { fingerprint: string; fields: FormAnalysis['fields']; mappings: Mapping[]; results: Map<string, FillResult>; usedMemory: boolean } | null = null;
  private lastReported = '';
  private observer: MutationObserver | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> = Promise.resolve();
  private stopped = false;
  // ── Capture du tarif (E10) ──
  /** La page de résultat est en cours de lecture ou lue : le remplissage s'arrête. */
  private capturing = false;
  private readonly reportedIssues = new Set<string>();

  constructor(
    private job: JobContext,
    private readonly ports: RunnerPorts,
  ) {}

  /** Chemins du dossier : seuls ceux-ci peuvent être visés (par l'IA ou à la main). */
  private get allowedPaths(): CanonicalPath[] {
    return Object.keys(this.job.quoteData).filter(path => asCanonicalPath(path)) as CanonicalPath[];
  }

  /**
   * Analyse la page, remplit l'étape affichée, puis surveille les changements d'étape. Si la page est déjà celle du
   * résultat (le courtier a soumis le formulaire), lit le tarif au lieu de remplir.
   */
  async start(): Promise<void> {
    // La page peut encore se charger : on attend qu'elle soit stable avant de l'analyser.
    await waitForSettled(this.ports.doc, { quietMs: this.ports.quietMs, timeoutMs: this.ports.settleTimeoutMs });
    if (await this.tryCapture(false)) return;
    await this.ports.report({ status: 'analyzing' }).catch(() => this.reportIssue('analyze', 'job_update_failed'));
    await this.enqueue(() => this.runStep(false));
    if (this.stopped) return;
    this.observer = new MutationObserver(() => this.scheduleCheck());
    // Nouveaux éléments, mais aussi champs affichés ou masqués par l'extranet (attribut hidden, style, classe).
    this.observer.observe(this.ports.doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'style', 'class', 'disabled'],
    });
  }

  stop(): void {
    this.stopped = true;
    this.observer?.disconnect();
    if (this.pending) clearTimeout(this.pending);
  }

  /** Le dossier a changé (le courtier a répondu aux champs manquants) : on reprend le remplissage. */
  async updateJob(job: JobContext): Promise<void> {
    this.job = job;
    await this.enqueue(() => this.runStep(false));
  }

  /** Correction du courtier : associe un champ à un chemin (ou l'ignore avec `null`), puis le remplit. */
  async manualMap(fieldKey: string, path: CanonicalPath | null): Promise<void> {
    if (path !== null) {
      const field = this.analysis?.fields.find(f => f.key === fieldKey);
      if (!field || !asCanonicalPath(path) || !this.allowedPaths.includes(path) || !isCompatible(field, path)) {
        this.publishState('waiting_user', [], [], "Ce champ ne peut pas recevoir cette information.");
        return;
      }
    }
    this.manual.set(fieldKey, path);
    this.written.delete(fieldKey);
    await this.enqueue(() => this.runStep(false));
  }

  /** Lire le tarif de la page affichée, à la demande du courtier (détection manquée, ou nouvel essai après un échec). */
  async captureNow(): Promise<void> {
    await this.enqueue(async () => void (await this.tryCapture(true)));
  }

  /** Remplit à nouveau tous les champs reconnus (le courtier a vidé ou corrigé le formulaire). */
  async refill(): Promise<void> {
    this.written.clear();
    await this.enqueue(() => this.runStep(false));
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.running = this.running.then(task).catch(() => undefined);
    return this.running;
  }

  /** Après un changement de la page : attend qu'elle soit chargée, puis regarde si c'est une nouvelle étape. */
  private scheduleCheck(): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.pending = null;
      void this.enqueue(async () => {
        if (this.stopped || this.capturing) return;
        await waitForSettled(this.ports.doc, { quietMs: this.ports.quietMs, timeoutMs: this.ports.settleTimeoutMs });
        const analysis = analyzeForm(this.ports.doc);
        const next = { keys: analysis.fields.map(f => f.key), hint: detectStepHint(this.ports.doc) };
        const changed = analysis.fingerprint !== this.analysis?.fingerprint;
        if (changed || next.hint.current !== this.lastStep.hint.current) {
          await this.runStep(isNewStep(this.lastStep, next));
        }
      });
    }, this.ports.quietMs ?? 400);
  }

  /** `depth` borne les relances quand le remplissage fait apparaître d'autres champs (réponse « Oui » → champ en plus). */
  private async runStep(newStep: boolean, depth = 0): Promise<void> {
    if (this.stopped || this.capturing) return;
    const analysis = analyzeForm(this.ports.doc);
    // Le courtier a soumis le formulaire et l'extranet affiche le tarif sans recharger la page.
    if (await this.tryCapture(false, analysis)) return;
    const hint = detectStepHint(this.ports.doc);
    if (newStep) {
      // Le courtier a quitté l'étape précédente : l'extranet l'a acceptée, on peut en retenir la structure (E8-3).
      await this.maybeLearn(this.snapshot);
      this.stepCounter += 1;
      this.written.clear();
      this.aiTried.clear();
    } else if (this.stepCounter === 0) {
      this.stepCounter = 1;
    }
    this.analysis = analysis;
    this.lastStep = { keys: analysis.fields.map(f => f.key), hint };

    if (analysis.fields.length === 0) {
      // Seule la première page compte : en cours de parcours, une page sans champ (chargement, récapitulatif) est normale.
      if (!newStep && this.stepCounter <= 1) await this.reportIssue('analyze', 'no_fields');
      this.publishState('analyzing', [], [], 'Aucun champ à remplir sur cette page.');
      return;
    }

    // 1. Synonymes et scoring ; la mémoire partagée tranche ce qu'ils n'ont pas tranché, puis l'IA, pour le reste.
    let mappings = mapFields(analysis.fields);
    this.fromMemory = new Set();
    const memory = await this.memoryFor(analysis.fingerprint);
    if (memory) {
      const applied = applyMemory(analysis.fields, mappings, memory.fields, this.allowedPaths);
      mappings = applied.mappings;
      this.fromMemory = applied.fromMemory;
      if (applied.fromMemory.size > 0) this.memoryStatus = 'used';
    }
    if (!this.aiTried.has(analysis.fingerprint)) {
      this.aiTried.add(analysis.fingerprint);
      const resolved = await resolveWithAi(analysis.fields, this.applyManual(mappings), this.allowedPaths, this.ports.askAi);
      this.aiUsed ||= resolved.used;
      mappings = resolved.mappings;
      this.aiResults = new Map(mappings.filter(m => m.source === 'ai').map(m => [m.fieldKey, m]));
    } else {
      mappings = mappings.map(m => this.aiResults.get(m.fieldKey) ?? m);
    }
    this.mappings = this.applyManual(mappings);
    if (!this.mappings.some(m => m.status === 'mapped' && m.canonicalPath !== null)) await this.reportIssue('mapping', 'no_field_mapped');

    // 2. Plan : quoi remplir, quoi demander au courtier, quoi laisser.
    const plan = planFill(analysis.fields, this.mappings, this.job.quoteData);

    // 3. Remplissage (sans jamais cliquer sur un bouton).
    const results = await this.fill(plan, analysis);

    // La mémoire a-t-elle bien servi ? Sinon elle est invalidée et on réapprend (E8-4).
    if (memory && (await this.checkMemoryHealth(analysis.fingerprint, memory.key, results))) {
      await this.reportIssue('mapping', 'memory_invalidated');
      await this.runStep(false, depth);
      return;
    }
    if ([...results.values()].some(r => r.status === 'failed')) await this.reportIssue('fill', 'fill_failed');
    this.snapshot = { fingerprint: analysis.fingerprint, fields: analysis.fields, mappings: this.mappings, results, usedMemory: !!memory && this.fromMemory.size > 0 };

    // 4. Avancement du job : champs manquants, étape en cours ou prêt à soumettre.
    await this.reportProgress(plan, hint);
    // Dernière étape remplie sans échec : la structure est apprise (le courtier valide ensuite sur l'extranet).
    if (plan.missing.length === 0 && isFinalStep(this.ports.doc, hint)) await this.maybeLearn(this.snapshot);
    this.publishFromPlan(plan, results, hint);

    // Une réponse a pu faire apparaître d'autres champs dans la même étape : on les remplit aussi.
    if (depth < MAX_FOLLOW_UPS && analyzeForm(this.ports.doc).fingerprint !== analysis.fingerprint) {
      await waitForSettled(this.ports.doc, { quietMs: this.ports.quietMs, timeoutMs: this.ports.settleTimeoutMs });
      const next = analyzeForm(this.ports.doc);
      const kept = this.lastStep.keys.filter(key => next.fields.some(f => f.key === key)).length;
      if (this.lastStep.keys.length > 0 && kept / this.lastStep.keys.length >= 0.5) await this.runStep(false, depth + 1);
    }
  }

  private aiResults = new Map<string, Mapping>();

  /**
   * Capture du tarif (E10-1, E10-2) : si la page est celle du résultat (ou si le courtier le demande), lit l'offre dans
   * le DOM, puis demande à l'IA ce qui manque (prime introuvable, garanties absentes). L'offre est proposée au courtier
   * dans le side panel : rien n'est enregistré sans sa confirmation. Renvoie vrai quand la page est traitée comme un résultat.
   */
  private async tryCapture(force: boolean, analysis: FormAnalysis = analyzeForm(this.ports.doc)): Promise<boolean> {
    if (this.stopped) return true;
    // Ni montant en euros ni titre de résultat : ce n'est pas une page de résultat, inutile d'analyser toute la page.
    if (!force && parseAmounts(this.ports.doc.body.textContent ?? '').length === 0 && !hasResultHeading(this.ports.doc)) return false;
    const extraction = extractFromDom(this.ports.doc);
    const fillable = mapFields(analysis.fields).filter(m => m.status === 'mapped' && m.canonicalPath !== null).length;
    if (!force && detectResultPage(extraction, fillable) === 'none') return false;

    this.capturing = true;
    // Plus rien à remplir : on ne surveille plus la page (un nouvel essai passe par « Lire le tarif »).
    this.observer?.disconnect();
    if (this.pending) clearTimeout(this.pending);
    this.publishCapture('capturing', { offer: null, source: null }, null);

    let offer: CapturedOffer = extraction.offer;
    let source: CaptureState['source'] = 'dom';
    let aiFailure: ExtensionReportIssue | null = null;
    if (!hasPremium(offer) || offer.guarantees.length === 0) {
      this.aiUsed = true;
      const ai = await captureWithAi(visibleText(this.ports.doc.body), this.job.quoteData, this.ports.askAi);
      if (ai.offer) {
        const merged = mergeOffers(offer, ai.offer);
        if (JSON.stringify(merged) !== JSON.stringify(offer)) source = 'ai';
        offer = merged;
      }
      aiFailure = ai.failure;
    }
    if (this.stopped) return true;

    if (!hasPremium(offer)) {
      await this.reportIssue('extract', aiFailure === 'ai_unavailable' ? 'ai_unavailable' : 'premium_not_found');
      // Pas de tarif lisible : la page peut encore se compléter, le courtier pourra relancer la lecture.
      this.capturing = false;
      this.publishCapture(
        'capture_failed',
        { offer: null, source: null },
        'Aucun tarif n’a pu être lu sur cette page. Relancez la lecture une fois le tarif affiché, ou signalez l’échec pour saisir l’offre dans l’application.',
      );
      return true;
    }
    if (aiFailure) await this.reportIssue('extract', aiFailure);
    this.publishCapture('capture_review', { offer, source }, null);
    return true;
  }

  private async reportIssue(step: ExtensionReportStep, issue: ExtensionReportIssue): Promise<void> {
    const key = `${step}:${issue}`;
    if (this.reportedIssues.has(key) || !this.ports.reportIssue) return;
    this.reportedIssues.add(key);
    await this.ports.reportIssue(step, issue).catch(() => undefined);
  }

  private publishCapture(phase: RunState['phase'], capture: CaptureState, message: string | null): void {
    this.ports.publish({
      phase,
      insurerId: this.job.insurerId,
      dossierId: this.job.dossierId,
      step: { current: null, total: null },
      fields: [],
      missing: [],
      aiUsed: this.aiUsed,
      memory: this.memoryStatus,
      assignablePaths: [],
      message,
      capture,
    });
  }

  private get origin(): string {
    return this.ports.origin ?? new URL(this.ports.doc.URL).origin;
  }

  /** Mémoire valide du formulaire (une lecture par empreinte), sauf si elle a déjà échoué ici. Une panne n'empêche rien. */
  private async memoryFor(fingerprint: string): Promise<{ key: string; fields: FormMemoryField[] } | null> {
    if (!this.ports.memory || this.memoryDisabled.has(fingerprint)) return null;
    if (!this.loadedMemory.has(fingerprint)) {
      this.loadedMemory.set(fingerprint, await this.ports.memory.load(this.origin, fingerprint).catch(() => null));
    }
    return this.loadedMemory.get(fingerprint) ?? null;
  }

  /**
   * Après remplissage : la mémoire a-t-elle servi sans problème ? Si trop de champs qu'elle a mappés échouent, elle est
   * signalée comme invalide (`memoires-invalider`), mise de côté pour ce formulaire, et le mapping est refait sans elle.
   * Renvoie vrai quand il faut recommencer l'étape sans la mémoire.
   */
  private async checkMemoryHealth(fingerprint: string, key: string, results: Map<string, FillResult>): Promise<boolean> {
    const used = this.mappings.filter(m => this.fromMemory.has(m.fieldKey) && m.canonicalPath !== null);
    if (used.length === 0) return false;
    const failed = used.filter(m => results.get(m.fieldKey)?.status === 'failed').length;
    if (failed > 0 && failed / used.length >= MEMORY_FAILURE_RATIO) {
      this.memoryDisabled.add(fingerprint);
      this.aiTried.delete(fingerprint);
      this.written.clear();
      this.memoryStatus = 'invalidated';
      await this.ports.memory?.invalidate(key).catch(() => undefined);
      return true;
    }
    if (failed === 0 && !this.memoryTouched.has(fingerprint)) {
      this.memoryTouched.add(fingerprint);
      await this.ports.memory?.touch(key).catch(() => undefined);
    }
    return false;
  }

  /**
   * Apprend la structure d'une étape (E8-3) : seulement après un remplissage RÉUSSI (aucun champ en échec) et VALIDÉ
   * (le courtier est passé à l'étape suivante, ou la dernière étape est remplie), et seulement si la mémoire ne la
   * connaissait pas déjà. Jamais de valeur : champs, types, libellés et chemins canoniques.
   */
  private async maybeLearn(snapshot: FormRunner['snapshot']): Promise<void> {
    if (!snapshot || !this.ports.memory || this.learned.has(snapshot.fingerprint) || snapshot.usedMemory) return;
    const results = [...snapshot.results.values()];
    if (results.length === 0 || results.some(r => r.status === 'failed')) return;
    const fields = toMemoryFields(snapshot.fields, snapshot.mappings);
    if (fields.length === 0 || fields.length > MEMORY_MAX_FIELDS || !fields.some(f => f.canonicalPath !== null)) return;
    this.learned.add(snapshot.fingerprint);
    try {
      await this.ports.memory.save(this.origin, snapshot.fingerprint, fields);
      this.memoryStatus = 'learned';
    } catch {
      this.learned.delete(snapshot.fingerprint); // une panne réseau : on réessaiera
    }
  }

  private applyManual(mappings: Mapping[]): Mapping[] {
    return mappings.map(mapping =>
      this.manual.has(mapping.fieldKey)
        ? {
            ...mapping,
            canonicalPath: this.manual.get(mapping.fieldKey)!,
            confidence: this.manual.get(mapping.fieldKey) ? 1 : 0,
            status: this.manual.get(mapping.fieldKey) ? ('mapped' as const) : ('unmapped' as const),
            source: 'manual' as const,
          }
        : mapping,
    );
  }

  private async fill(plan: FillPlan, analysis: FormAnalysis): Promise<Map<string, FillResult>> {
    const results = new Map<string, FillResult>();
    for (const { field, value, path } of plan.instructions) {
      const signature = `${String(value)}`;
      if (this.written.get(field.key) === signature) {
        results.set(field.key, { fieldKey: field.key, status: 'filled' });
        continue;
      }
      const result = await fillField(field, analysis.elements.get(field.key) ?? [], value, { date: PATH_EXPECTED[path] === 'date' });
      results.set(field.key, result);
      if (result.status === 'filled') this.written.set(field.key, signature);
    }
    return results;
  }

  private async reportProgress(plan: FillPlan, hint: StepHint): Promise<void> {
    const current = hint.current ?? this.stepCounter;
    let update: JobUpdate;
    if (plan.missing.length > 0) {
      update = { status: 'needs_info', currentStep: current, totalSteps: hint.total, missingFields: plan.missing };
    } else if (isFinalStep(this.ports.doc, hint)) {
      update = { status: 'awaiting_submit', currentStep: current, totalSteps: hint.total ?? current, missingFields: [] };
    } else {
      update = { status: 'filling', currentStep: current, totalSteps: hint.total, missingFields: [] };
    }
    const signature = JSON.stringify([update.status, update.currentStep, update.totalSteps, (update.missingFields ?? []).map(m => m.canonicalPath)]);
    if (signature === this.lastReported) return;
    this.lastReported = signature;
    await this.ports.report(update).catch(() => this.reportIssue('fill', 'job_update_failed'));
  }

  private publishFromPlan(plan: FillPlan, results: Map<string, FillResult>, hint: StepHint): void {
    const missingPaths = new Set(plan.missing.map(m => m.canonicalPath));
    const fields: RunField[] = (this.analysis?.fields ?? []).map(field => {
      const mapping = this.mappings.find(m => m.fieldKey === field.key);
      const result = results.get(field.key);
      let status: RunField['status'] = 'unmapped';
      if (result) status = result.status;
      else if (mapping?.canonicalPath && missingPaths.has(mapping.canonicalPath)) status = 'missing';
      else if (mapping?.status === 'uncertain') status = 'uncertain';
      return {
        key: field.key,
        label: field.label,
        required: field.required,
        section: field.section,
        canonicalPath: mapping?.canonicalPath ?? null,
        confidence: mapping?.confidence ?? 0,
        source: mapping?.source ?? 'heuristic',
        status,
        reason: result?.reason ?? null,
      };
    });
    const phase = plan.missing.length > 0 ? 'waiting_user' : isFinalStep(this.ports.doc, hint) ? 'awaiting_submit' : 'filling';
    this.publishState(phase, fields, plan.missing, null, hint);
  }

  private publishState(phase: RunState['phase'], fields: RunField[], missing: MissingField[], message: string | null, hint?: StepHint): void {
    const step = hint ?? this.lastStep.hint;
    this.ports.publish({
      phase,
      insurerId: this.job.insurerId,
      dossierId: this.job.dossierId,
      step: { current: step.current ?? (this.stepCounter || null), total: step.total },
      fields,
      missing,
      aiUsed: this.aiUsed,
      memory: this.memoryStatus,
      assignablePaths: this.allowedPaths,
      message,
    });
  }
}
