import { BlockedStepSnapshot, CanonicalData, CanonicalPath, ExtraCanonicalPath, isExtraPath, ExtensionReportIssue, ExtensionReportStep, MissingField, type DiscoveredFieldInput } from '@shared';
import type { CapturedOffer, CaptureState, JobContext, RunField, RunState } from '../shared/messages';
import { resolveWithAi } from './ai-fallback';
import { analyzeForm, FormAnalysis, isAuthPage } from './analyzer';
import { applyLayout, FormLayout, readLayoutWithAi } from './layout-ai';
import { detectResultPage, extractFromDom, hasPremium, hasResultHeading, parseAmounts, visibleText } from './capture';
import type { FillResult } from './filler';
import { asCanonicalPath, ExtraQuestion, isCompatible, Mapping, mapExtraPaths, mapFields } from './mapping';
import { toDiscoveredFields, toRequiredPaths, toSightedFields } from './memory';
import { FillPlan, planFill, valueOf } from './plan';
import { adapterFor, type ExtranetAdapter } from './extranets';
import { advanceButton, AdvanceGuard, leftTextPage, refusalMessage, stepKey } from './flow/advance';
import { completeWithAi, fillableCount, needsAiCompletion } from './flow/capture-page';
import { ClaimRows } from './flow/claim-rows';
import { blockedStepSnapshot } from './flow/step-report';
import { applyOverrides, fillPlan } from './flow/fill-step';
import { MemorySession, StepSnapshot } from './flow/memory-session';
import { panelFields, progressSignature, progressUpdate } from './flow/run-report';
import { JobUpdateError, RunnerPorts } from './runner-ports';
import { clickRow, detectStepHint, findResultRows, pickResultRow, isFinalStep, isNewStep, StepHint, waitForSettled } from './steps';

/** Relances maximales dans une étape quand le remplissage révèle de nouveaux champs. */
const MAX_FOLLOW_UPS = 3;
/** Champs reliés au dossier à partir desquels la page est un formulaire de devis (pas une recherche ou une connexion). */
const FORM_MIN_MAPPED = 3;

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
  /**
   * Champs signalés que le serveur a rattachés à une question (créée ou existante) : le champ vise désormais ce
   * chemin ; sans réponse au dossier, il devient un champ manquant que le courtier renseigne dans la carte de l'assureur
   * (le dossier, en tarification, n'est plus modifiable ailleurs).
   */
  private readonly serverMapped = new Map<string, CanonicalPath>();
  /** Corrections manuelles du courtier : clé du champ → chemin (ou null pour « ne pas remplir »). */
  private readonly manual = new Map<string, CanonicalPath | null>();
  /** Valeurs déjà écrites, pour ne pas réécrire un champ que le courtier a pu corriger. */
  private readonly written = new Map<string, string>();
  private readonly aiTried = new Set<string>();
  private aiUsed = false;
  // ── Mémoire partagée (E8) ──
  private readonly memory: MemorySession;
  /** L'étape qui vient d'être remplie : apprise quand le courtier la quitte ou la valide. */
  private snapshot: StepSnapshot | null = null;
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
  /** Mis en pause par le courtier (barre flottante) : plus aucun remplissage ni clic tant qu'il ne reprend pas. */
  private paused = false;
  // ── Capture du tarif (E10) ──
  /** La page de résultat est en cours de lecture ou lue : le remplissage s'arrête. */
  private capturing = false;
  private readonly reportedIssues = new Set<string>();
  /** Plan de l'étape affichée, pour la photo d'une étape bloquée. */
  private lastPlan: FillPlan | null = null;
  /** Dernier problème à signaler au courtier dans le side panel (IA indisponible, session expirée…), ou null. */
  private notice: string | null = null;
  // ── Passage automatique à l'étape suivante ──
  /** L'étape affichée est remplie sans manque ni échec, et ce n'est pas la dernière. */
  private stepReady = false;
  private readonly advanceGuard = new AdvanceGuard();
  // ── Règles propres à l'extranet (extranets/) ──
  private readonly adapter: ExtranetAdapter;
  private readonly claimRows: ClaimRows;
  private lastState: RunState | null = null;
  private formReachedSent = false;

  constructor(
    private job: JobContext,
    private readonly ports: RunnerPorts,
  ) {
    this.adapter = adapterFor({ insurerId: job.insurerId, origin: ports.origin ?? ports.doc.location?.origin });
    this.claimRows = new ClaimRows(this.adapter);
    this.memory = new MemorySession(ports.memory, () => this.origin);
  }

  /** Analyse de la page affichée, avec les règles de l'extranet. */
  private analyze(): FormAnalysis {
    return analyzeForm(this.ports.doc, this.adapter);
  }

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

  /**
   * Questions ajoutées depuis les extranets que le dossier pose, avec leur libellé et leur forme de réponse quand le
   * produit est lisible (sinon leur code) : un champ posé autrement par cet extranet y est rattaché.
   */
  private get extraQuestions(): (ExtraCanonicalPath | ExtraQuestion)[] {
    const known = new Map((this.job.productQuestions ?? []).map(question => [question.path, question]));
    return this.allowedPaths.filter(isExtraPath).map(path => {
      const question = known.get(path);
      return question ? { path, label: question.label, shape: { type: question.type, choices: question.choices } } : path;
    });
  }

  /**
   * Données à remplir : une réponse à une question ajoutée depuis un extranet est un code de choix de cet extranet
   * (`M`) ; on remplit avec son libellé (« Marié(e) »), le seul qu'un autre extranet affiche.
   */
  private get fillData(): CanonicalData {
    const data: CanonicalData = { ...this.job.quoteData };
    for (const question of this.job.productQuestions ?? []) {
      const answer = data[question.path as CanonicalPath];
      const label = typeof answer === 'string' ? question.choiceLabels?.[answer] : undefined;
      if (label) data[question.path as CanonicalPath] = label;
    }
    return data;
  }

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
    // Le questionnaire du produit n'est pas relu à chaque mise à jour du dossier : on garde celui déjà connu.
    this.job = {
      ...job,
      productPaths: job.productPaths?.length ? job.productPaths : this.job.productPaths,
      productQuestions: job.productQuestions ?? this.job.productQuestions,
    };
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

  /**
   * Lire le tarif de la page affichée, à la demande du courtier (détection manquée, nouvel essai après un échec, ou
   * nouvelle formule affichée : annuel ↔ mensuel). Possible aussi après un premier tarif enregistré.
   */
  async captureNow(): Promise<void> {
    if (this.cancelled) return;
    this.stopped = false;
    this.capturing = false;
    await this.enqueue(async () => void (await this.tryCapture(true)));
  }

  /**
   * La page affiche-t-elle un tarif ? Même règle que la détection automatique de la page de résultat (montant en
   * euros, puis résultat reconnu) : le bouton « Sauvegarder le tarif » de la barre flottante n'apparaît qu'alors.
   */
  hasTariffOnPage(): boolean {
    const doc = this.ports.doc;
    const amounts = parseAmounts(doc.body?.textContent ?? '');
    if (amounts.length === 0 && !hasResultHeading(doc)) return false;
    // Mêmes montants, même nombre de champs : même réponse, sans réanalyser la page (appelé à chaque changement du DOM).
    const key = `${JSON.stringify(amounts)}#${doc.querySelectorAll('input, select, textarea').length}`;
    if (key !== this.tariffCheck.key) {
      const fillable = fillableCount(this.analyze().fields);
      this.tariffCheck = { key, found: detectResultPage(extractFromDom(doc), fillable) !== 'none' };
    }
    return this.tariffCheck.found;
  }
  private tariffCheck = { key: '', found: false };

  get isPaused(): boolean {
    return this.paused;
  }

  /** Pause : la page n'est plus remplie ni avancée (le courtier navigue lui-même, change de formule…). */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    if (this.pending) clearTimeout(this.pending);
    if (this.lastState) this.ports.publish({ ...this.lastState, phase: 'waiting_user', message: 'Extension en pause : reprenez depuis la barre flottante.' });
  }

  /** Reprise : la page affichée est relue et remplie. */
  async resume(): Promise<void> {
    if (!this.paused) return;
    this.paused = false;
    if (!this.stopped) await this.enqueue(() => this.runStep(false));
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
    if (this.paused) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      void this.enqueue(async () => {
        if (this.stopped || this.capturing) return;
        await waitForSettled(this.ports.doc, { quietMs: this.ports.quietMs, timeoutMs: this.ports.settleTimeoutMs });
        const analysis = this.analyze();
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
    if (this.stopped || this.capturing || this.paused) return;
    let analysis = this.analyze();
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
      this.claimRows.reset();
      this.advanceGuard.reset();
    } else if (this.stepCounter === 0) {
      this.stepCounter = 1;
    }
    // Suivi des étapes sur l'analyse brute (mêmes clés qu'à chaque vérification de la page).
    this.lastStep = { keys: analysis.fields.map(f => f.key), hint };
    // Formulaire mal lu par les règles : l'IA en lit la mise en page (une fois par formulaire), puis on remplit sur l'analyse corrigée.
    analysis = await this.refineLayout(analysis);
    this.analysis = analysis;
    if (analysis.fields.length) this.ports.fieldsSeen?.(toSightedFields(analysis.fields, this.job.quoteData));

    if (analysis.fields.length === 0) {
      // Seule la première page compte : en cours de parcours, une page sans champ (chargement, récapitulatif) est normale.
      if (!newStep && this.stepCounter <= 1) await this.reportIssue('analyze', 'no_fields');
      this.publishState('analyzing', [], [], 'Aucun champ à remplir sur cette page.');
      // Tableau des sinistres vide alors que le dossier en déclare : on ajoute une ligne, puis on la remplit.
      if (await this.maybeAddClaimRow(analysis)) return this.runStep(false, depth);
      // En cours de parcours, une page sans champ (récapitulatif, tableau des sinistres vide) se valide par « Suivant »,
      // sauf un tableau de sinistres alors que le dossier en déclare (ajout impossible) : le courtier les ajoute.
      if (this.formReachedSent && !this.claimRows.awaitsClaims(this.ports.doc, this.job.quoteData)) {
        this.stepReady = true;
        if (depth === 0) await this.maybeAdvance();
      }
      return;
    }

    // 1. Synonymes et scoring ; la mémoire partagée tranche ce qu'ils n'ont pas tranché, puis l'IA, pour le reste.
    let mappings = mapExtraPaths(analysis.fields, mapFields(analysis.fields), this.extraQuestions);
    const remembered = await this.memory.map(analysis, mappings, this.allowedPaths);
    const memory = remembered.memory;
    mappings = remembered.mappings;
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
    const mappedCount = this.mappings.filter(m => m.status === 'mapped' && m.canonicalPath !== null).length;
    // Pendant l'apprentissage du chemin, une page sans champ relié (tableau de bord, menu) est normale.
    if (mappedCount === 0 && !this.ports.waitForForm) await this.reportIssue('mapping', 'no_field_mapped');
    if (!this.formReachedSent && mappedCount >= FORM_MIN_MAPPED) {
      this.formReachedSent = true;
      this.ports.formReached?.();
    }
    // Pas encore le formulaire de devis (apprentissage du chemin) : aucun remplissage, aucun manque, aucune question.
    if (this.ports.waitForForm && !this.formReachedSent) {
      this.publishState('analyzing', [], [], 'Allez jusqu’au formulaire de devis : le remplissage commencera dès qu’il sera reconnu.');
      return;
    }

    // 2. Plan : quoi remplir, quoi demander au courtier, quoi laisser.
    const plan = planFill(analysis.fields, this.mappings, this.fillData);
    this.lastPlan = plan;

    // 3. Remplissage (sans jamais cliquer sur un bouton).
    const results = await fillPlan(plan, analysis, this.written, this.job.quoteData);

    // La mémoire a-t-elle bien servi ? Sinon elle est invalidée et on réapprend (E8-4).
    if (memory && (await this.memory.checkHealth(analysis.fingerprint, memory.key, this.mappings, results))) {
      this.aiTried.delete(analysis.fingerprint);
      this.written.clear();
      await this.reportIssue('mapping', 'memory_invalidated');
      await this.runStep(false, depth);
      return;
    }
    if ([...results.values()].some(r => r.status === 'failed')) await this.reportIssue('fill', 'fill_failed');
    this.snapshot = { fingerprint: analysis.fingerprint, fields: analysis.fields, mappings: this.mappings, results, usedMemory: !!memory && this.memory.fromMemory.size > 0 };
    // Exigences de l'extranet (champs obligatoires) : signalées dès l'analyse, même si la page bloque ensuite sur un manque.
    if (!this.requirementsReported.has(analysis.fingerprint)) {
      const requiredPaths = toRequiredPaths(analysis.fields, this.mappings);
      if (requiredPaths.length) {
        this.requirementsReported.add(analysis.fingerprint);
        void this.ports.reportDiscovered?.(analysis.fingerprint, [], requiredPaths).catch(() => this.requirementsReported.delete(analysis.fingerprint));
      }
    }

    // Champs sans équivalent dans le questionnaire : signalés dès que l'étape est remplie, même si un autre champ a
    // échoué (ce sont justement ces questions qui manquent pour avancer). Le serveur les
    // ajoute au questionnaire (obligatoires si l'extranet les exige). Indispensable sur les extranets qui rechargent la
    // page entre deux étapes : l'apprentissage « en quittant l'étape » n'y a jamais lieu pour les étapes intermédiaires.
    if (!this.discoveredReported.has(analysis.fingerprint)) {
      const discovered = toDiscoveredFields(analysis.fields, this.mappings, this.productPaths, this.job.quoteData);
      if (discovered.length) {
        this.discoveredReported.add(analysis.fingerprint);
        this.reportNewFields(analysis.fingerprint, discovered, () => this.discoveredReported.delete(analysis.fingerprint));
      }
    }

    // 4. Avancement du job : champs manquants, étape en cours ou prêt à soumettre.
    await this.reportProgress(plan, hint);
    // Dernière étape remplie sans échec : la structure est apprise (le courtier valide ensuite sur l'extranet).
    const finalStep = isFinalStep(this.ports.doc, hint);
    if (plan.missing.length === 0 && finalStep) await this.maybeLearn(this.snapshot);
    this.publishFromPlan(plan, results, hint);
    // Un champ facultatif pour l'extranet (Préfecture sur Zephir) qui n'a pas pu être rempli ne bloque pas l'étape.
    const required = new Set(analysis.fields.filter(f => f.required).map(f => f.key));
    this.stepReady =
      plan.missing.length === 0 && !finalStep && ![...results.values()].some(r => r.status === 'failed' && required.has(r.fieldKey));

    // Une réponse a pu faire apparaître d'autres champs dans la même étape : on les remplit aussi.
    if (depth < MAX_FOLLOW_UPS && this.analyze().fingerprint !== analysis.fingerprint) {
      await waitForSettled(this.ports.doc, { quietMs: this.ports.quietMs, timeoutMs: this.ports.settleTimeoutMs });
      const next = this.analyze();
      const kept = this.lastStep.keys.filter(key => next.fields.some(f => f.key === key)).length;
      if (this.lastStep.keys.length > 0 && kept / this.lastStep.keys.length >= 0.5) await this.runStep(false, depth + 1);
    }
    // Sinistre suivant du dossier : une ligne de plus dans le tableau, remplie à son tour.
    if (this.stepReady && (await this.maybeAddClaimRow(analysis))) return this.runStep(false, depth);
    // Étape qui ne peut pas avancer (manque du dossier, champ en échec ou non reconnu) : photo de l'étape, pour savoir
    // ce qui relève du dossier (`missing`) et ce qui relève de l'extension (`failed`, `unmapped`).
    if (depth === 0 && !this.stepReady && !finalStep && this.formReachedSent) {
      await this.reportBlocked('step_blocked', (this.analysis ?? analysis).fingerprint, this.blockedPhoto(this.analysis ?? analysis, hint));
    }
    // Toute l'étape est remplie (relances comprises) : on passe à la suivante.
    if (depth === 0) await this.maybeAdvance();
  }

  private blockedPhoto(analysis: FormAnalysis, hint: StepHint): BlockedStepSnapshot {
    // Résultats de la dernière étape remplie, par clé de champ : la page refusée peut avoir une autre empreinte
    // (champs obligatoires marqués après « Suivant ») mais garde les mêmes champs.
    const results = this.snapshot?.results ?? new Map<string, FillResult>();
    return blockedStepSnapshot(this.ports.doc, analysis.fields, this.mappings, this.lastPlan, results, hint, this.job.quoteData);
  }

  /** Signalement d'une étape bloquée, avec sa photo : une fois par étape (empreinte) et par code. */
  private async reportBlocked(issue: 'step_blocked' | 'advance_refused', fingerprint: string, photo: BlockedStepSnapshot): Promise<void> {
    const key = `${issue}:${fingerprint}`;
    if (this.reportedIssues.has(key) || !this.ports.reportIssue) return;
    this.reportedIssues.add(key);
    await this.ports.reportIssue('fill', issue, photo).catch(() => undefined);
  }

  /** Ajoute la ligne de sinistre suivante (voir ClaimRows). Renvoie `true` si une ligne a été demandée. */
  private async maybeAddClaimRow(analysis: FormAnalysis): Promise<boolean> {
    if (!this.ports.autoAdvance || this.stopped || this.capturing || this.paused) return false;
    const button = this.claimRows.nextAddButton(this.ports.doc, analysis.fields, this.job.quoteData);
    if (!button) return false;
    // `dispatchEvent` plutôt que `click()` : l'icône ⊕ peut être un `<svg>`, qui n'a pas de `click()`.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForSettled(this.ports.doc, { quietMs: this.ports.quietMs, timeoutMs: this.ports.settleTimeoutMs });
    return !this.stopped && !this.capturing;
  }

  /**
   * Clique sur « Suivant » quand l'étape est prête (une fois par étape), puis vérifie que l'extranet a bien changé
   * d'étape, et remplit la nouvelle. Sinon (erreur de saisie, page bloquée), le courtier corrige et avance lui-même.
   */
  private async maybeAdvance(): Promise<void> {
    if (!this.ports.autoAdvance || !this.stepReady || this.stopped || this.capturing || this.paused || !this.analysis) return;
    const key = stepKey(this.analysis, this.ports.doc);
    const found = advanceButton(this.ports.doc, this.filledElements());
    if (!found || !this.advanceGuard.firstTry(key)) return;
    const before = this.lastStep;
    found.button.click();
    await waitForSettled(this.ports.doc, { quietMs: this.ports.quietMs, timeoutMs: this.ports.settleTimeoutMs });
    if (this.stopped || this.capturing) return;
    if (found.search) {
      const results = findResultRows(this.ports.doc);
      if (results) {
        const value = valueOf(this.job.quoteData['vehicle.vehicleValue']);
        clickRow(pickResultRow(results, typeof value === 'number' ? value : null));
        await waitForSettled(this.ports.doc, { quietMs: this.ports.quietMs, timeoutMs: this.ports.settleTimeoutMs });
        if (this.stopped || this.capturing) return;
      }
    }
    const refused = this.analyze();
    const after = { keys: refused.fields.map(f => f.key), hint: detectStepHint(this.ports.doc) };
    // Nouvelle étape : remplie tout de suite (la surveillance de la page n'est pas encore active au démarrage).
    if (isNewStep(before, after) || (before.keys.length === 0 && leftTextPage(key, this.ports.doc))) return this.runStep(true);
    // Refus : l'extranet marque maintenant ses champs obligatoires (Zephir ne le fait qu'après « Suivant »). Ceux qui
    // n'ont pas d'équivalent sont signalés : ils deviennent des questions du dossier, et le prochain passage les remplira.
    const discovered = toDiscoveredFields(refused.fields, mapFields(refused.fields), this.productPaths, this.job.quoteData);
    if (discovered.length) this.reportNewFields(refused.fingerprint, discovered);
    // Les champs de la page refusée, avec l'état du remplissage de l'étape (mêmes clés de champ).
    await this.reportBlocked('advance_refused', refused.fingerprint, this.blockedPhoto(refused, after.hint));
    if (this.lastState) this.ports.publish({ ...this.lastState, phase: 'waiting_user', message: refusalMessage(this.ports.doc) });
  }

  /** Éléments des champs remplis à l'étape affichée (pour trouver le bouton « Rechercher » de leur bloc). */
  private filledElements(): HTMLElement[] {
    const results = this.snapshot?.results;
    if (!results || !this.analysis) return [];
    return [...results].filter(([, r]) => r.status === 'filled').flatMap(([key]) => this.analysis!.elements.get(key) ?? []);
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
   * le DOM, puis demande à l'IA ce qui manque (prime introuvable, garanties absentes). Le service worker enregistre
   * l'offre « à vérifier » : le courtier la valide ou la corrige dans l'app. Renvoie vrai quand la page est traitée comme un résultat.
   */
  private async tryCapture(force: boolean, analysis: FormAnalysis = this.analyze()): Promise<boolean> {
    if (this.stopped) return true;
    // Ni montant en euros ni titre de résultat : ce n'est pas une page de résultat, inutile d'analyser toute la page.
    if (!force && parseAmounts(this.ports.doc.body.textContent ?? '').length === 0 && !hasResultHeading(this.ports.doc)) return false;
    const extraction = extractFromDom(this.ports.doc);
    const fillable = fillableCount(analysis.fields);
    if (!force && detectResultPage(extraction, fillable) === 'none') return false;

    this.capturing = true;
    // Plus rien à remplir : on ne surveille plus la page (un nouvel essai passe par « Lire le tarif »).
    this.observer?.disconnect();
    if (this.pending) clearTimeout(this.pending);
    this.publishCapture('capturing', { offer: null, source: null }, null);

    let offer: CapturedOffer = extraction.offer;
    let source: CaptureState['source'] = 'dom';
    let aiFailure: ExtensionReportIssue | null = null;
    if (needsAiCompletion(offer)) {
      this.aiUsed = true;
      const ai = await completeWithAi(offer, visibleText(this.ports.doc.body), this.job.quoteData, this.askAi);
      offer = ai.offer;
      source = ai.source;
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
      memory: this.memory.status,
      assignablePaths: [],
      message,
      capture,
    });
  }

  private get origin(): string {
    return this.ports.origin ?? new URL(this.ports.doc.URL).origin;
  }

  /** Apprend la structure de l'étape (voir MemorySession.learn), puis signale ses champs restés sans équivalent. */
  private async maybeLearn(snapshot: StepSnapshot | null): Promise<void> {
    if (!snapshot || !(await this.memory.learn(snapshot))) return;
    // Après la mémoire (le serveur y rattache les nouvelles questions) : les champs restés sans équivalent.
    if (this.discoveredReported.has(snapshot.fingerprint)) return;
    const discovered = toDiscoveredFields(snapshot.fields, snapshot.mappings, this.productPaths, this.job.quoteData);
    if (discovered.length) await this.ports.reportDiscovered?.(snapshot.fingerprint, discovered).catch(() => undefined);
  }

  /** Signale des champs sans équivalent, puis vise les questions que le serveur leur a données. */
  private reportNewFields(fingerprint: string, fields: DiscoveredFieldInput[], onFailure?: () => void): void {
    void this.ports
      .reportDiscovered?.(fingerprint, fields)
      .then(mapping => this.adoptServerMapping(mapping ?? {}))
      .catch(() => onFailure?.());
  }

  /** Champs rattachés par le serveur : la page est relue pour les remplir ou les demander au courtier. */
  private adoptServerMapping(mapping: Record<string, string>): void {
    let changed = false;
    for (const [fieldKey, raw] of Object.entries(mapping)) {
      const path = asCanonicalPath(raw);
      if (!path || !isExtraPath(path) || this.manual.has(fieldKey) || this.serverMapped.get(fieldKey) === path) continue;
      this.serverMapped.set(fieldKey, path);
      changed = true;
    }
    if (changed && !this.stopped) void this.enqueue(() => this.runStep(false));
  }

  /** Corrections du courtier, puis rattachements du serveur, par-dessus le mapping calculé. */
  private applyManual(mappings: Mapping[]): Mapping[] {
    return applyOverrides(mappings, this.manual, this.serverMapped);
  }

  private async reportProgress(plan: FillPlan, hint: StepHint): Promise<void> {
    const update = progressUpdate(plan, hint, this.stepCounter, isFinalStep(this.ports.doc, hint));
    const signature = progressSignature(update);
    if (signature === this.lastReported) return;
    this.lastReported = signature;
    await this.ports.report(update).catch(error => this.jobUpdateFailed('fill', error));
  }

  private publishFromPlan(plan: FillPlan, results: Map<string, FillResult>, hint: StepHint): void {
    const fields = panelFields(this.analysis?.fields ?? [], this.mappings, plan, results);
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
      memory: this.memory.status,
      assignablePaths: this.allowedPaths,
      message,
    };
    this.ports.publish(this.lastState);
  }
}
