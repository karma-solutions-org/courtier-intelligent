import { listRecentJobs, watchRecentJobs } from './jobs-service';
import { startLiveWatch } from './live';
import { countRequested } from './origin-match';
import { auth, broadcast, live, panels, signedInUser } from './worker-state';

/** Fréquence de la vérification de session en arrière-plan (le service worker est arrêté entre deux). */
export const SESSION_CHECK_ALARM = 'session-check';
const SESSION_CHECK_PERIOD_MINUTES = 1;

let stopLive: (() => void) | null = null;

async function setBadge(count: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#0b63ff' });
  } catch {
    // Le badge est un confort : une erreur ne doit rien casser.
  }
}

/**
 * Affiche sur l'icône le nombre de tarifications « requested » à lancer. Tant que le suivi en continu est actif,
 * il tient le badge à jour ; sinon (suivi coupé, réveil par l'alarme) on relit les jobs une fois.
 */
export async function refreshBadge(): Promise<void> {
  try {
    const user = await signedInUser();
    if (user && jobsWatch?.uid === user.uid && jobsWatch.received) return;
    await setBadge(user ? countRequested(await listRecentJobs(user)) : 0);
  } catch {
    // Le badge est un confort : une erreur réseau ne doit rien casser.
  }
}

// ── Suivi en continu des jobs du courtier (E7-1), side panel ouvert ou non ──
/** Suivi actif : pour quel courtier, et a-t-il déjà reçu un premier résultat. */
let jobsWatch: { uid: string; stop: () => void; received: boolean } | null = null;

function stopJobsWatch(): void {
  jobsWatch?.stop();
  jobsWatch = null;
}

/**
 * (Re)branche le suivi des jobs récents du courtier connecté, ou le coupe s'il est déconnecté. Appelé à chaque réveil
 * du service worker, à chaque changement de session et par l'alarme : l'écoute Firestore s'arrête avec le service
 * worker, l'alarme d'une minute la rattache (et relit le badge entre-temps).
 */
export async function syncJobsWatch(): Promise<void> {
  const user = await signedInUser();
  if (!user) {
    stopJobsWatch();
    await setBadge(0);
    return;
  }
  if (jobsWatch?.uid === user.uid) return;
  stopJobsWatch();
  const watch: NonNullable<typeof jobsWatch> = { uid: user.uid, stop: () => undefined, received: false };
  watch.stop = watchRecentJobs(
    user,
    jobs => {
      watch.received = true;
      void setBadge(countRequested(jobs));
    },
    () => {
      // Règles refusées (session coupée) ou réseau : on lâche l'écoute, la prochaine alarme la rattachera.
      if (jobsWatch === watch) jobsWatch = null;
      void verifySession();
    },
  );
  jobsWatch = watch;
}

/** Suit en direct la session et le job tant qu'un side panel est ouvert et que le courtier est connecté. */
export async function syncLiveWatch(): Promise<void> {
  const state = await auth.getState();
  stopLive?.();
  stopLive = null;
  if (panels.size === 0 || state.status !== 'signed_in') {
    live.job = null;
    return;
  }
  stopLive = startLiveWatch(state.user, {
    onSessionMaybeChanged: () => void verifySession(),
    onJob: job => {
      live.job = job;
      void broadcast();
      void refreshBadge();
    },
  });
}

/** Vérifie que la session de l'appareil est toujours ouverte ; sinon l'extension est déconnectée. */
export async function verifySession(): Promise<void> {
  const state = await auth.verify();
  if (state.status === 'signed_out') await syncLiveWatch();
  await broadcast(state);
}

// ── Vérification périodique : perte d'accès dès que la session de l'appareil est coupée ──
export async function ensureAlarm(): Promise<void> {
  if (!(await chrome.alarms.get(SESSION_CHECK_ALARM))) {
    chrome.alarms.create(SESSION_CHECK_ALARM, { periodInMinutes: SESSION_CHECK_PERIOD_MINUTES });
  }
}
