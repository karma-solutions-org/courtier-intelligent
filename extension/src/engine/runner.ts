import { CanonicalPath, isExtraPath, ExtensionReportIssue, ExtensionReportStep, FormMemoryField, MissingField, type DiscoveredFieldInput } from '@shared';
import type { CapturedOffer, CaptureState, JobContext, JobUpdate, RunField, RunState } from '../shared/messages';
import { AskAi, resolveWithAi } from './ai-fallback';
import { analyzeForm, FormAnalysis, isAuthPage } from './analyzer';
import { applyLayout, FormLayout, readLayoutWithAi } from './layout-ai';
import { detectResultPage, extractFromDom, hasPremium, hasResultHeading, parseAmounts, visibleText } from './capture';
import { captureWithAi, mergeOffers } from './capture-ai';
import { expectsDate } from './field-synonyms';
import { fillField, FillResult, parseRange, registrationFor } from './filler';
import { asCanonicalPath, isCompatible, Mapping, mapExtraPaths, mapFields } from './mapping';
import { applyMemory, MemoryPort, toDiscoveredFields, toMemoryFields, toRequiredPaths } from './memory';
import { FillPlan, FillValue, planFill, valueOf } from './plan';
import { detectStepHint, findNextButton, hasValidationErrors, isFinalStep, isNewStep, StepHint, waitForSettled } from './steps';

/** Champs d'adresse : les extranets y proposent souvent des suggestions à choisir (adresse normalisée, commune). */
const SUGGEST_PATHS: ReadonlySet<string> = new Set(['client.address.street', 'client.address.city', 'vehicle.parkingCity']);

/** Échec d'écriture de l'avancement, avec la cause exacte (`cancelled` : le job a été annulé). */
export class JobUpdateError extends Error {
  constructor(message: string, readonly cancelled = false) {
    super(message);
  }
}

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
  /** Champs sans équivalent d'un formulaire validé : le serveur les ajoute au questionnaire. */
  reportDiscovered?(fingerprint: string, fields: DiscoveredFieldInput[], requiredPaths?: string[]): Promise<void>;
  /** Lecture de la mise en page déjà faite par l'IA pour un formulaire (cache local du navigateur). */
  layoutCache?: { load(fingerprint: string): Promise<FormLayout | null>; save(fingerprint: string, layout: FormLayout): Promise<void> };
  /** Origine de l'extranet, clé de la mémoire (par défaut : celle de la page). */
  origin?: string;
  /** Une étape remplie sans manque ni échec : l'extension clique elle-même sur « Suivant » (jamais sur le bouton final). */
  autoAdvance?: boolean;
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
 * Règles : l'extension ne clique JAMAIS sur « Obtenir mon tarif » (le courtier soumet lui-même) ; elle remplit l'étape
 * affichée, signale ce qui manque (`needs_info`), puis surveille la page : quand l'étape change, elle attend la fin du
 * chargement et remplit à nouveau. Avec `autoAdvance`, une étape remplie sans manque ni échec est validée par un clic
 * sur « Suivant » (une fois par étape) ; si l'extranet la refuse, la main revient au courtier.
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
  /** Empreintes dont les champs obligatoires ont déjà été signalés. */
  private readonly requirementsReported = new Set<string>();
  /** Étapes dont les champs sans équivalent ont déjà été signalés (une fois par empreinte). */
  private readonly discoveredReported = new Set<string>();
  private observer: MutationObserver | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> = Promise.resolve();
  private stopped = false;
  private cancelled = false;
  // ── Capture du tarif (E10) ──
  /** La page de résultat est en cours de lecture ou lue : le remplissage s'arrête. */
  private capturing = false;
  private readonly reportedIssues = new Set<string>();
  /** Dernier problème à signaler au courtier dans le side panel (IA indisponible, session expirée…), ou null. */
  private notice: string | null = null;
  // ── Passage automatique à l'étape suivante ──
  /** L'étape affichée est remplie sans manque ni échec, et ce n'est pas la dernière. */
  private stepReady = false;
  /** Étapes (empreintes) où « Suivant » a déjà été cliqué : un seul essai, l'extranet peut la refuser. */
  private readonly advancedFrom = new Set<string>();
  private lastState: RunState | null = null;

  constructor(
    private job: JobContext,
    private readonly ports: RunnerPorts,
  ) {}

  /**
   * Questions du produit (toutes, conditions comprises) : un champ reconnu sur l'une d'elles n'est pas nouveau.
   * Sans questionnaire lisible, on se rabat sur les chemins du dossier.
   */
  private get productPaths(): readonly string[] {
    return this.job.productPaths?.length ? this.job.productPaths : this.allowedPaths;
  }

  /** IA appelée via le service worker : son échec est gardé pour l'afficher (le remplissage continue sans elle). */
  private readonly askAi: RunnerPorts['askAi'] = async request => {
    try {
      const text = await this.ports.askAi(request);
      // L'IA répond de nouveau : son ancien message d'échec ne vaut plus.
      if (this.aiNotice) {
        this.notice = null;
        this.aiNotice = false;
      }
      return text;
    } catch (error) {
      this.notice = error instanceof Error && error.message ? error.message : 'IA indisponible pour le moment.';
      this.aiNotice = true;
      throw error;
    }
  };
  /** `notice` vient d'un échec de l'IA (effacé quand elle répond de nouveau). */
  private aiNotice = false;

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
    if (this.job.status === 'cancelled') return this.cancel();
    if (await this.tryCapture(false)) return;
    await this.ports.report({ status: 'analyzing' }).catch(error => this.jobUpdateFailed('analyze', error));
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

  /** Job annulé (corbeille, sans suite, tarification-annuler) : statut final, le remplissage s'arrête pour de bon. */
  cancel(): void {
    if (this.stopped && this.cancelled) return;
    this.cancelled = true;
    this.stop();
    this.publishState('cancelled', [], [], 'Tarification annulée : ce dossier n’attend plus de tarif de cet assureur.');
  }

  stop(): void {
    this.stopped = true;
    this.observer?.disconnect();
    if (this.pending) clearTimeout(this.pending);
  }

  /** Le dossier a changé (le courtier a répondu aux champs manquants) : on reprend le remplissage. */
  async updateJob(job: JobContext): Promise<void> {
    if (job.status === 'cancelled') return this.cancel();
    this.job = job.productPaths?.length ? job : { ...job, productPaths: this.job.productPaths };
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
    this.stepReady = false;
    if (this.stopped || this.capturing) return;
    let analysis = analyzeForm(this.ports.doc);
    // Le courtier a soumis le formulaire et l'extranet affiche le tarif sans recharger la page.
    if (await this.tryCapture(false, analysis)) return;
    // Page de connexion de l'extranet : l'extension ne touche jamais aux identifiants du courtier.
    if (isAuthPage(this.ports.doc)) {
      this.publishState('analyzing', [], [], 'Page de connexion : connectez-vous vous-même à l’extranet, le remplissage reprendra ensuite.');
      return;
    }
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
    // Suivi des étapes sur l'analyse brute (mêmes clés qu'à chaque vérification de la page).
    this.lastStep = { keys: analysis.fields.map(f => f.key), hint };
    // Formulaire mal lu par les règles : l'IA en lit la mise en page (une fois par formulaire), puis on remplit sur l'analyse corrigée.
    analysis = await this.refineLayout(analysis);
    this.analysis = analysis;

    if (analysis.fields.length === 0) {
      // Seule la première page compte : en cours de parcours, une page sans champ (chargement, récapitulatif) est normale.
      if (!newStep && this.stepCounter <= 1) await this.reportIssue('analyze', 'no_fields');
      this.publishState('analyzing', [], [], 'Aucun champ à remplir sur cette page.');
      return;
    }

    // 1. Synonymes et scoring ; la mémoire partagée tranche ce qu'ils n'ont pas tranché, puis l'IA, pour le reste.
    let mappings = mapExtraPaths(analysis.fields, mapFields(analysis.fields), this.allowedPaths.filter(isExtraPath));
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
      const resolved = await resolveWithAi(analysis.fields, this.applyManual(mappings), this.allowedPaths, this.askAi);
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
    // Exigences de l'extranet (champs obligatoires) : signalées dès l'analyse, même si la page bloque ensuite sur un manque.
    if (!this.requirementsReported.has(analysis.fingerprint)) {
      const requiredPaths = toRequiredPaths(analysis.fields, this.mappings);
      if (requiredPaths.length) {
        this.requirementsReported.add(analysis.fingerprint);
        void this.ports.reportDiscovered?.(analysis.fingerprint, [], requiredPaths).catch(() => this.requirementsReported.delete(analysis.fingerprint));
      }
    }

    // Champs sans équivalent dans le questionnaire : signalés dès que l'étape est remplie sans échec. Le serveur les
    // ajoute au questionnaire (obligatoires si l'extranet les exige). Indispensable sur les extranets qui rechargent la
    // page entre deux étapes : l'apprentissage « en quittant l'étape » n'y a jamais lieu pour les étapes intermédiaires.
    if (!this.discoveredReported.has(analysis.fingerprint) && ![...results.values()].some(r => r.status === 'failed')) {
      const discovered = toDiscoveredFields(analysis.fields, this.mappings, this.productPaths, this.job.quoteData);
      if (discovered.length) {
        this.discoveredReported.add(analysis.fingerprint);
        void this.ports.reportDiscovered?.(analysis.fingerprint, discovered).catch(() => this.discoveredReported.delete(analysis.fingerprint));
      }
    }

    // 4. Avancement du job : champs manquants, étape en cours ou prêt à soumettre.
    await this.reportProgress(plan, hint);
    // Dernière étape remplie sans échec : la structure est apprise (le courtier valide ensuite sur l'extranet).
    const finalStep = isFinalStep(this.ports.doc, hint);
    if (plan.missing.length === 0 && finalStep) await this.maybeLearn(this.snapshot);
    this.publishFromPlan(plan, results, hint);
    this.stepReady = plan.missing.length === 0 && !finalStep && ![...results.values()].some(r => r.status === 'failed');

    // Une réponse a pu faire apparaître d'autres champs dans la même étape : on les remplit aussi.
    if (depth < MAX_FOLLOW_UPS && analyzeForm(this.ports.doc).fingerprint !== analysis.fingerprint) {
      await waitForSettled(this.ports.doc, { quietMs: this.ports.quietMs, timeoutMs: this.ports.settleTimeoutMs });
      const next = analyzeForm(this.ports.doc);
      const kept = this.lastStep.keys.filter(key => next.fields.some(f => f.key === key)).length;
      if (this.lastStep.keys.length > 0 && kept / this.lastStep.keys.length >= 0.5) await this.runStep(false, depth + 1);
    }
    // Toute l'étape est remplie (relances comprises) : on passe à la suivante.
    if (depth === 0) await this.maybeAdvance();
  }

  /**
   * Clique sur « Suivant » quand l'étape est prête (une fois par étape), puis vérifie que l'extranet a bien changé
   * d'étape, et remplit la nouvelle. Sinon (erreur de saisie, page bloquée), le courtier corrige et avance lui-même.
   */
  private async maybeAdvance(): Promise<void> {
    if (!this.ports.autoAdvance || !this.stepReady || this.stopped || this.capturing || !this.analysis) return;
    const fingerprint = this.analysis.fingerprint;
    if (this.advancedFrom.has(fingerprint)) return;
    const button = findNextButton(this.ports.doc);
    if (!button) return;
    this.advancedFrom.add(fingerprint);
    const before = this.lastStep;
    button.click();
    await waitForSettled(this.ports.doc, { quietMs: this.ports.quietMs, timeoutMs: this.ports.settleTimeoutMs });
    if (this.stopped || this.capturing) return;
    const after = { keys: analyzeForm(this.ports.doc).fields.map(f => f.key), hint: detectStepHint(this.ports.doc) };
    // Nouvelle étape : remplie tout de suite (la surveillance de la page n'est pas encore active au démarrage).
    if (isNewStep(before, after)) return this.runStep(true);
    const message = hasValidationErrors(this.ports.doc)
      ? 'L’extranet a refusé cette étape : corrigez les champs signalés, puis cliquez vous-même sur « Suivant ».'
      : 'L’extranet n’est pas passé à l’étape suivante : vérifiez la page, puis cliquez vous-même sur « Suivant ».';
    if (this.lastState) this.ports.publish({ ...this.lastState, phase: 'waiting_user', message });
  }

  private aiResults = new Map<string, Mapping>();
  /** Lecture de la mise en page par formulaire (empreinte) : demandée à l'IA une seule fois, gardée par le cache. */
  private readonly layouts = new Map<string, FormLayout>();

  private async refineLayout(analysis: FormAnalysis): Promise<FormAnalysis> {
    let layout = this.layouts.get(analysis.fingerprint);
    if (!layout) {
      layout = (await this.ports.layoutCache?.load(analysis.fingerprint).catch(() => null)) ?? undefined;
      if (!layout) {
        const read = await readLayoutWithAi(analysis, this.askAi, this.job.quoteData);
        this.aiUsed ||= read.used;
        layout = read.layout;
        if (read.used) void this.ports.layoutCache?.save(analysis.fingerprint, layout).catch(() => undefined);
      }
      this.layouts.set(analysis.fingerprint, layout);
    }
    return applyLayout(analysis, layout);
  }

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
      const ai = await captureWithAi(visibleText(this.ports.doc.body), this.job.quoteData, this.askAi);
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
      const outcome = await this.ports.memory.save(this.origin, snapshot.fingerprint, fields);
      // `ignored` : le serveur n'a rien retenu. `pending` : retenu pour le cabinet (mémoire commune en attente).
      if (outcome !== 'ignored') this.memoryStatus = 'learned';
    } catch {
      this.learned.delete(snapshot.fingerprint); // une panne réseau : on réessaiera
      return;
    }
    // Après la mémoire (le serveur y rattache les nouvelles questions) : les champs restés sans équivalent.
    if (this.discoveredReported.has(snapshot.fingerprint)) return;
    const discovered = toDiscoveredFields(snapshot.fields, snapshot.mappings, this.productPaths, this.job.quoteData);
    if (discovered.length) await this.ports.reportDiscovered?.(snapshot.fingerprint, discovered).catch(() => undefined);
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
    for (const { field, value: planned, path } of plan.instructions) {
      const elements = analysis.elements.get(field.key) ?? [];
      const value = path === 'vehicle.registration' ? registrationFor(field, elements[0], planned) : this.withSeniority(path, field, planned);
      const signature = `${String(value)}`;
      if (this.written.get(field.key) === signature) {
        results.set(field.key, { fieldKey: field.key, status: 'filled' });
        continue;
      }
      const result = await fillField(field, elements, value, {
        date: expectsDate(path, value),
        version: path === 'vehicle.version',
        suggest: SUGGEST_PATHS.has(path),
      });
      results.set(field.key, result);
      if (result.status === 'filled') this.written.set(field.key, signature);
    }
    return results;
  }

  /**
   * « Avez-vous été assuré ? » proposé en durées (« moins de 9 mois », « 24 mois et plus ») : un simple « oui » ne
   * choisit pas, l'ancienneté du dossier (en mois) le fait.
   */
  private withSeniority(path: CanonicalPath, field: FormAnalysis['fields'][number], planned: FillValue): FillValue {
    if (path !== 'insuranceHistory.currentlyInsured' || planned !== true) return planned;
    if (!field.options.some(option => parseRange(option.label) !== null)) return planned;
    const months = valueOf(this.job.quoteData['insuranceHistory.seniority']);
    return typeof months === 'number' ? months : planned;
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
    await this.ports.report(update).catch(error => this.jobUpdateFailed('fill', error));
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
    this.publishState(phase, fields, plan.missing, this.notice, hint);
  }

  /** L'avancement n'a pas pu être écrit (session expirée, autorisation refusée, réseau) : signalé et affiché. */
  private async jobUpdateFailed(step: ExtensionReportStep, error?: unknown): Promise<void> {
    if (error instanceof JobUpdateError && error.cancelled) return this.cancel();
    // Cause exacte renvoyée par le service worker (session, dossier hors tarification, réseau…).
    this.notice =
      error instanceof JobUpdateError
        ? error.message
        : 'Avancement non enregistré dans l’application : session expirée ou autorisation manquante. Reconnectez-vous à l’extension.';
    this.aiNotice = false;
    await this.reportIssue(step, 'job_update_failed');
  }

  private publishState(phase: RunState['phase'], fields: RunField[], missing: MissingField[], message: string | null, hint?: StepHint): void {
    const step = hint ?? this.lastStep.hint;
    this.lastState = {
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
    };
    this.ports.publish(this.lastState);
  }
}
