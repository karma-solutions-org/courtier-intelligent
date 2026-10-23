import { Dossier, DossierStatus, PROPOSAL_DOSSIER_STATUSES } from '@shared';

export type Stage = 'infos' | 'need' | 'pricing' | 'comparison' | 'proposal';
export type StageState = 'done' | 'current' | 'todo';

/** Une étape de la frise du dossier, prête à afficher. */
export interface PipelineStep {
  key: Stage;
  label: string;
  state: StageState;
  enabled: boolean;
}

/** Les étapes du dossier : chacune ouvre son espace de travail (une seule navigation). */
export const DOSSIER_STAGES: readonly { key: Stage; label: string }[] = [
  { key: 'infos', label: 'Informations' },
  { key: 'need', label: 'Couverture' },
  { key: 'pricing', label: 'Tarification' },
  { key: 'comparison', label: 'Comparatif' },
  { key: 'proposal', label: 'Proposition' },
];

/** Étape de travail correspondant à chaque statut : c'est elle qui s'ouvre à l'arrivée sur le dossier. */
const STAGE_OF_STATUS: Record<DossierStatus, Stage> = {
  brouillon: 'infos',
  complet: 'need',
  besoin_valide: 'pricing',
  tarification: 'pricing',
  comparaison: 'comparison',
  decision: 'proposal',
  proposition_envoyee: 'proposal',
  souscrit: 'proposal',
  refuse: 'proposal',
  // Sans suite : l'étape réellement atteinte se déduit du dossier (voir currentStageOf).
  sans_suite: 'infos',
};

/** Le comparatif s'ouvre dès la tarification (les offres arrivent au fil de l'eau). */
const COMPARISON_STATUSES: readonly DossierStatus[] = ['tarification', 'comparaison', 'decision', 'proposition_envoyee', 'souscrit', 'refuse'];

/** Étape où se trouve le dossier, d'après son statut (sans suite : la dernière étape atteinte). */
export function currentStageOf(dossier: Dossier | null): Stage {
  if (!dossier) return 'infos';
  if (dossier.status === 'sans_suite') {
    if (dossier.decision || dossier.proposal) return 'proposal';
    if (dossier.needAnalysis?.validatedAt) return 'pricing';
    return dossier.completeness?.ok ? 'need' : 'infos';
  }
  return STAGE_OF_STATUS[dossier.status];
}

export function isStageEnabled(dossier: Dossier | null, stage: Stage): boolean {
  const status = dossier?.status;
  switch (stage) {
    case 'infos':
      return true;
    case 'need':
      return !!status && status !== 'brouillon';
    case 'pricing':
      return !!status && status !== 'brouillon' && status !== 'complet';
    case 'comparison':
      return !!status && (COMPARISON_STATUSES.includes(status) || (status === 'sans_suite' && !!dossier?.needAnalysis?.validatedAt));
    case 'proposal':
      // La proposition s'ouvre dès qu'une offre est retenue (sans suite : seulement si une décision existe).
      return !!dossier && (PROPOSAL_DOSSIER_STATUSES.includes(dossier.status) || dossier.status === 'sans_suite') && !!dossier.decision;
  }
}

/** La frise : chaque étape avec son état (faite, en cours, à faire) et si elle peut s'ouvrir. */
export function pipelineOf(dossier: Dossier | null): PipelineStep[] {
  const current = DOSSIER_STAGES.findIndex(stage => stage.key === currentStageOf(dossier));
  return DOSSIER_STAGES.map((stage, order) => ({
    ...stage,
    state: dossier?.status === 'souscrit' || order < current ? 'done' : order === current ? 'current' : 'todo',
    enabled: isStageEnabled(dossier, stage.key),
  }));
}

/** Dossier arrêté (refusé, sans suite) : la frise est grisée. */
export function isHaltedStatus(status: DossierStatus): boolean {
  return status === 'refuse' || status === 'sans_suite';
}
