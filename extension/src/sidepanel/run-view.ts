import type { CanonicalPath } from '@shared';
import { FIELD_SYNONYMS } from '../engine/field-synonyms';
import type { CapturedOffer, RunField, RunState } from '../shared/messages';

/** Nom lisible d'un chemin canonique, pour la correction manuelle (« client.lastName » → « Nom »). */
export function pathLabel(path: CanonicalPath): string {
  const label = FIELD_SYNONYMS[path].labels[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const PHASE_LABELS: Record<RunState['phase'], string> = {
  analyzing: 'Analyse de la page…',
  filling: 'Étape remplie : vérifiez, puis passez vous-même à la suivante.',
  waiting_user: 'En attente d’informations : complétez le dossier dans l’application.',
  awaiting_submit: 'Dernière étape remplie : vérifiez, puis validez vous-même sur l’extranet.',
  error: 'Une erreur est survenue.',
  capturing: 'Lecture du tarif affiché…',
  capture_review: 'Tarif lu sur la page : vérifiez-le, corrigez-le si besoin, puis confirmez.',
  captured: 'Tarif enregistré dans le dossier.',
  capture_failed: 'Aucun tarif lu sur cette page.',
};

/** Phases du remplissage où le courtier peut demander de lire le tarif (la détection automatique l'a manqué). */
const CAN_CAPTURE: RunState['phase'][] = ['analyzing', 'filling', 'waiting_user', 'awaiting_submit'];

const MEMORY_NOTES: Record<NonNullable<RunState['memory']> | 'none', string | null> = {
  none: null,
  used: 'Formulaire déjà connu : champs reconnus grâce à la mémoire partagée, sans appel à l’IA.',
  learned: 'Formulaire appris : les prochains remplissages seront plus rapides (structure seulement, aucune donnée client).',
  invalidated: 'La mémoire de ce formulaire ne convenait plus : champs reconnus à nouveau, la mémoire sera corrigée.',
};

export interface ProblemRow {
  key: string;
  label: string;
  required: boolean;
  kind: 'Non trouvé' | 'Incertain' | 'Échec du remplissage' | 'Manquant dans le dossier';
  reason: string | null;
  /** Le courtier peut associer ce champ à une information du dossier. */
  canAssign: boolean;
}

export interface RunView {
  phase: string;
  step: string | null;
  summary: string;
  message: string | null;
  aiNote: string | null;
  /** Ce que la mémoire partagée des formulaires a apporté (null : rien à dire). */
  memoryNote: string | null;
  /** Informations obligatoires que le dossier ne contient pas. */
  missing: { path: CanonicalPath; label: string }[];
  /** Champs qui demandent l'attention du courtier : obligatoires d'abord. */
  problems: ProblemRow[];
  assignable: { path: CanonicalPath; label: string }[];
  /** Bouton « Lire le tarif de cette page ». */
  canCapture: boolean;
  /** Capture du tarif (page de résultat) : null pendant le remplissage. */
  capture: CaptureView | null;
}

/** Ce que le side panel affiche d'une capture : valeurs modifiables, détail de l'offre et actions possibles. */
export interface CaptureView {
  /** Texte des champs modifiables (« 640,50 »), vide quand l'information manque. */
  premiumAnnual: string;
  premiumMonthly: string;
  quoteNumber: string;
  deductible: string | null;
  guarantees: string[];
  exclusions: string[];
  sourceNote: string | null;
  /** Clé de l'offre lue : les champs ne sont réinitialisés que quand elle change (sinon on garderait la saisie). */
  key: string;
  canConfirm: boolean;
  canRetry: boolean;
  /** Libellé du bouton d'échec (« Ce n'est pas le bon tarif » / « Signaler l'échec »), null s'il n'y en a pas. */
  rejectLabel: string | null;
}

const euros = (value: number) => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
const amountField = (value: number | null) => (value === null ? '' : String(value).replace('.', ','));

/** Montant saisi par le courtier (« 640,50 », « 1 234 € ») : nombre, `null` si vide, `undefined` s'il est invalide. */
export function parseAmountInput(text: string): number | null | undefined {
  const cleaned = text.replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  return value <= 10_000_000 ? value : undefined;
}

function guaranteeLine(g: CapturedOffer['guarantees'][number]): string {
  const details = [g.included ? 'incluse' : 'non incluse'];
  if (g.limit !== null) details.push(`plafond ${euros(g.limit)}`);
  if (g.deductible !== null) details.push(`franchise ${euros(g.deductible)}`);
  return `${g.label} — ${details.join(' · ')}`;
}

export function describeCapture(run: RunState): CaptureView | null {
  if (!['capturing', 'capture_review', 'captured', 'capture_failed'].includes(run.phase)) return null;
  const offer = run.capture?.offer ?? null;
  const general = offer?.deductibles['general'];
  return {
    premiumAnnual: amountField(offer?.premiumAnnual ?? null),
    premiumMonthly: amountField(offer?.premiumMonthly ?? null),
    quoteNumber: offer?.quoteNumber ?? '',
    deductible: general !== undefined ? `Franchise générale : ${euros(general)}` : null,
    guarantees: (offer?.guarantees ?? []).map(guaranteeLine),
    exclusions: offer?.exclusions ?? [],
    sourceNote:
      run.capture?.source === 'ai'
        ? 'Lu avec l’aide de l’IA (texte de la page sans les données du client) : vérifiez chaque montant.'
        : offer
          ? 'Lu directement sur la page de l’extranet.'
          : null,
    key: JSON.stringify(offer),
    canConfirm: run.phase === 'capture_review',
    canRetry: run.phase === 'capture_review' || run.phase === 'capture_failed',
    rejectLabel: run.phase === 'capture_review' ? 'Ce n’est pas le bon tarif' : run.phase === 'capture_failed' ? 'Signaler l’échec' : null,
  };
}

const KIND: Partial<Record<RunField['status'], ProblemRow['kind']>> = {
  unmapped: 'Non trouvé',
  uncertain: 'Incertain',
  failed: 'Échec du remplissage',
  missing: 'Manquant dans le dossier',
};

/** Ce que le side panel affiche pour le remplissage en cours : progression, champs non trouvés, informations manquantes. */
export function describeRun(run: RunState): RunView {
  const filled = run.fields.filter(field => field.status === 'filled').length;
  const problems = run.fields
    .filter(field => KIND[field.status])
    .map(
      (field): ProblemRow => ({
        key: field.key,
        label: field.label || '(champ sans libellé)',
        required: field.required,
        kind: KIND[field.status]!,
        reason: field.reason,
        // Un champ absent du dossier se complète dans l'app ; les autres peuvent être associés à la main.
        canAssign: field.status !== 'missing',
      }),
    )
    .sort((a, b) => Number(b.required) - Number(a.required));

  const { current, total } = run.step;
  return {
    phase: PHASE_LABELS[run.phase],
    step: current === null ? null : total === null ? `Étape ${current}` : `Étape ${current} sur ${total}`,
    summary: `${filled} champ${filled > 1 ? 's' : ''} rempli${filled > 1 ? 's' : ''} sur ${run.fields.length}`,
    message: run.message,
    memoryNote: MEMORY_NOTES[run.memory ?? 'none'],
    aiNote: run.aiUsed ? 'L’IA a aidé à reconnaître certains champs (seule la structure du formulaire lui est envoyée).' : null,
    missing: run.missing.map(m => ({ path: m.canonicalPath, label: m.label })),
    problems,
    assignable: run.assignablePaths.map(path => ({ path, label: pathLabel(path) })).sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    canCapture: CAN_CAPTURE.includes(run.phase),
    capture: describeCapture(run),
  };
}
