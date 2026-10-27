import type { DiscoveredFieldInput } from '@shared';
import type { JobContext, RunState } from '../../../shared/messages';
import { FormRunner } from '../../runner';
import type { ExtranetSimulator } from './simulator';

export interface JourneyResult {
  /** États publiés par l'extension (le dernier explique un arrêt). */
  states: RunState[];
  /** Tarif lu sur la dernière page (`capture_review`), ou null. */
  offer: NonNullable<RunState['capture']>['offer'] | null;
  /** Constat du parcours (champs vus, et question remplie dans chacun), tel qu'envoyé à `champs-constater`. */
  seen: DiscoveredFieldInput[];
}

/**
 * Lance l'extension (remplissage + « Suivant » automatique) sur le simulateur, jusqu'à la lecture du tarif sur
 * `finalPage`. En cas d'arrêt avant, l'erreur dit où et pourquoi (pages traversées, refus, dernier état publié).
 */
export async function runJourney(
  sim: ExtranetSimulator,
  job: JobContext,
  { origin, finalPage, timeoutMs = 20_000 }: { origin: string; finalPage: string; timeoutMs?: number },
): Promise<JourneyResult> {
  const states: RunState[] = [];
  const seen = new Map<string, DiscoveredFieldInput>();
  const runner = new FormRunner(job, {
    doc: document,
    report: async () => undefined,
    publish: state => void states.push(state),
    // Comme le service worker (addSeenFields) : un champ revu garde sa dernière description.
    fieldsSeen: fields => fields.forEach(field => seen.set(field.fieldKey, field)),
    askAi: async () => '{"mappings":[]}',
    origin,
    autoAdvance: true,
    quietMs: 40,
    settleTimeoutMs: 1000,
  });
  try {
    await runner.start();
    const done = () => sim.page() === finalPage && states.some(state => state.phase === 'capture_review');
    for (const started = Date.now(); !done(); await new Promise(resolve => setTimeout(resolve, 25))) {
      if (Date.now() - started > timeoutMs) {
        const last = states.at(-1);
        throw new Error(
          `Parcours arrêté sur « ${sim.page()} » : pages ${sim.visited.join(' > ')} ; refus [${sim.refused.join(', ')}] ; ` +
            `dernier état ${last?.phase ?? '—'} ${last?.message ?? ''} ; champs ${JSON.stringify(last?.fields?.map(f => [f.label, f.status]) ?? [])}`,
        );
      }
    }
    return { states, offer: states.find(state => state.phase === 'capture_review')?.capture?.offer ?? null, seen: [...seen.values()] };
  } finally {
    runner.stop();
  }
}

/** Réponse cochée d'un groupe de boutons bascule (`aria-pressed`) par le nom de ses boutons, ou null. */
export const pressedAnswer = (form: ParentNode, name: string): string | null =>
  form.querySelector<HTMLButtonElement>(`button[name="${name}"][aria-pressed="true"]`)?.textContent?.trim() ?? null;
