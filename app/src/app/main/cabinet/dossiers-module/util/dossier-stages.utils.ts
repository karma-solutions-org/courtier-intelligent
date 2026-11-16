import { Dossier, DossierStatus, PROPOSAL_DOSSIER_STATUSES, TERMINAL_DOSSIER_STATUSES } from '@shared';

/** Étapes de travail d'un dossier (une seule navigation sur la fiche). */
export type DossierStage = 'infos' | 'need' | 'pricing' | 'comparison' | 'proposal';

/** Vue affichée sur la fiche : une étape, ou l'historique. */
export type DossierDetailView = DossierStage | 'history';

/** Les étapes du dossier, dans l'ordre : chacune ouvre son espace de travail. */
export const DOSSIER_STAGES: readonly { key: DossierStage; label: string }[] = [
  { key: 'infos', label: 'Informations' },
  { key: 'need', label: 'Couverture' },
  { key: 'pricing', label: 'Tarification' },
  { key: 'comparison', label: 'Comparatif' },
  { key: 'proposal', label: 'Proposition' },
];

/** Étape de travail correspondant à chaque statut : c'est elle qui s'ouvre à l'arrivée sur le dossier. */
const STAGE_OF_STATUS: Record<DossierStatus, DossierStage> = {
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

/** Étape où se trouve le dossier, d'après son statut (sans suite : la dernière étape atteinte). */
export function currentStageOf(dossier: Dossier | null): DossierStage {
  const status = dossier?.status;
  if (!dossier || !status) return 'infos';
  if (status === 'sans_suite') {
    if (dossier.decision || dossier.proposal) return 'proposal';
    if (dossier.needAnalysis?.validatedAt) return 'pricing';
    return dossier.completeness?.ok ? 'need' : 'infos';
  }
  return STAGE_OF_STATUS[status];
}

/** Le comparatif s'ouvre dès la tarification (les offres arrivent au fil de l'eau). */
export function comparisonEnabledFor(dossier: Dossier | null): boolean {
  return (
    ['tarification', 'comparaison', 'decision', 'proposition_envoyee', 'souscrit', 'refuse'].includes(dossier?.status ?? '') ||
    (dossier?.status === 'sans_suite' && !!dossier?.needAnalysis?.validatedAt)
  );
}

/** La proposition s'ouvre dès qu'une offre est retenue (sans suite : seulement si une décision existe). */
export function proposalEnabledFor(dossier: Dossier | null): boolean {
  return !!dossier && (PROPOSAL_DOSSIER_STATUSES.includes(dossier.status) || dossier.status === 'sans_suite') && !!dossier.decision;
}

/** L'étape peut-elle être ouverte ? */
export function stageEnabledFor(stage: DossierStage, dossier: Dossier | null): boolean {
  const status = dossier?.status;
  switch (stage) {
    case 'infos':
      return true;
    case 'need':
      return !!status && status !== 'brouillon';
    case 'pricing':
      return !!status && status !== 'brouillon' && status !== 'complet';
    case 'comparison':
      return comparisonEnabledFor(dossier);
    case 'proposal':
      return proposalEnabledFor(dossier);
  }
}

/** État d'une étape dans la frise : passée, en cours ou à venir (tout est fait une fois le contrat souscrit). */
export function stageStateFor(stage: DossierStage, dossier: Dossier | null): 'done' | 'current' | 'todo' {
  if (dossier?.status === 'souscrit') return 'done';
  const order = DOSSIER_STAGES.findIndex((s) => s.key === stage);
  const current = DOSSIER_STAGES.findIndex((s) => s.key === currentStageOf(dossier));
  return order < current ? 'done' : order === current ? 'current' : 'todo';
}

/** Dossier arrêté (refusé ou sans suite) : la frise s'affiche en retrait. */
export function isHaltedStatus(status: DossierStatus): boolean {
  return status === 'refuse' || status === 'sans_suite';
}

/** Un dossier se classe sans suite à toute étape, tant qu'il n'est pas clos. */
export function canCloseStatus(status: DossierStatus): boolean {
  return !TERMINAL_DOSSIER_STATUSES.includes(status);
}
