import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  DocumentSnapshot,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebase } from '../shared/firebase';
import { isExtraPath, questionsOf, type ExtensionReportIssue, type ExtensionReportStep, type QuestionnaireSection } from '@shared';
import type { CapturedOffer, ExtensionUser, JobContext, JobUpdate, ProductQuestion } from '../shared/messages';
import { catalogEntryPaths, insurerForOrigin, InsurerInfo, JobRecord, pickJobForOrigin, PickOptions } from './origin-match';

/** Les assureurs changent rarement : on les relit au plus toutes les 10 minutes. */
const INSURERS_TTL_MS = 10 * 60 * 1000;
/**
 * Fenêtre des jobs suivis : ceux mis à jour ces 7 derniers jours. Un job demandé plus tôt et jamais lancé est
 * périmé (le dossier a pu changer) ; la fenêtre borne la lecture sans écarter un job récent, ce que faisait
 * l'ancienne limite fixe des 10 derniers jobs quand le courtier lançait plusieurs dossiers à la fois.
 */
export const RECENT_JOBS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const INSURERS_CACHE_KEY = 'insurers';

const toInsurerInfo = (d: DocumentSnapshot): InsurerInfo => ({
  id: d.id,
  name: String(d.get('name') ?? d.id),
  extranetDomains: (d.get('extranetDomains') as string[] | undefined) ?? [],
  entryPaths: catalogEntryPaths(d.get('entryPaths')),
});

/**
 * Assureurs reconnus : le catalogue, le même pour tous les cabinets.
 * Gardés en mémoire de session : le service worker redémarre souvent et chaque page web ouverte lui demande
 * « est-ce un extranet ? » — on ne relit pas Firestore à chaque fois.
 */
export async function loadInsurers({ fresh = false }: { fresh?: boolean } = {}): Promise<InsurerInfo[]> {
  const cached = (await chrome.storage.session.get(INSURERS_CACHE_KEY))[INSURERS_CACHE_KEY] as
    | { at: number; value: InsurerInfo[] }
    | undefined;
  if (!fresh && cached && Date.now() - cached.at < INSURERS_TTL_MS) return cached.value;
  const snapshot = await getDocs(collection(getFirebase().firestore, 'ci_insurers'));
  const value = snapshot.docs.map(toInsurerInfo);
  await chrome.storage.session.set({ [INSURERS_CACHE_KEY]: { at: Date.now(), value } });
  return value;
}

/** Délai minimal entre deux relectures forcées du catalogue (une page inconnue ne relit pas Firestore à chaque chargement). */
const INSURERS_REFRESH_MIN_MS = 30 * 1000;
let lastForcedRefresh = 0;

/**
 * Assureurs, avec celui de `origin` s'il existe : un extranet publié au catalogue depuis la dernière lecture est
 * reconnu tout de suite, sans attendre la fin du cache (relecture forcée au plus toutes les 30 s).
 */
export async function loadInsurersFor(origin: string): Promise<InsurerInfo[]> {
  const insurers = await loadInsurers();
  if (insurerForOrigin(origin, insurers) || Date.now() - lastForcedRefresh < INSURERS_REFRESH_MIN_MS) return insurers;
  lastForcedRefresh = Date.now();
  return loadInsurers({ fresh: true });
}

/**
 * Les jobs récents du courtier, tous dossiers confondus (requête autorisée par les règles : `ownerUid` = soi).
 * Index existant (ownerUid ASC, updatedAt DESC) : le statut est filtré côté extension.
 */
function recentJobsQuery(user: ExtensionUser) {
  const since = Timestamp.fromMillis(Date.now() - RECENT_JOBS_WINDOW_MS);
  return query(
    collectionGroup(getFirebase().firestore, 'ci_quoteJobs'),
    where('ownerUid', '==', user.uid),
    where('updatedAt', '>=', since),
    orderBy('updatedAt', 'desc'),
  );
}

async function loadRecentJobs(user: ExtensionUser): Promise<JobRecord[]> {
  const snapshot = await getDocs(recentJobsQuery(user));
  return snapshot.docs.map(toRecord);
}

/**
 * Suit en continu les jobs récents du courtier (E7-1), même side panel fermé : badge et détection des tarifications
 * demandées depuis l'app. Le service worker peut être arrêté par Chrome : il rattache ce suivi à chaque réveil.
 * Renvoie la fonction qui arrête le suivi.
 */
export function watchRecentJobs(user: ExtensionUser, onJobs: (jobs: JobRecord[]) => void, onError: (error: unknown) => void): () => void {
  return onSnapshot(recentJobsQuery(user), snapshot => onJobs(snapshot.docs.map(toRecord)), onError);
}

const toRecord = (d: DocumentSnapshot): JobRecord => ({
  // …/dossiers/{dossierId}/quoteJobs/{insurerId}
  dossierId: d.ref.parent.parent?.id ?? '',
  insurerId: d.id,
  data: d.data() ?? {},
});

/** Le job à exécuter sur la page d'un extranet (ou `null` : rien à faire ici). `pick` : job épinglé à l'onglet, jobs des autres onglets. */
export async function findJobForOrigin(user: ExtensionUser, origin: string, pick: Pick<PickOptions, 'pinned' | 'exclude'> = {}): Promise<JobContext | null> {
  const insurers = await loadInsurersFor(origin);
  // Une page qui n'est l'extranet d'aucun assureur ne déclenche aucune requête de jobs.
  if (!insurerForOrigin(origin, insurers)) return null;
  const job = pickJobForOrigin(await loadRecentJobs(user), insurers, origin, pick);
  if (!job) return null;
  // Produit du dossier : il choisit le profil d'extranet (chemin d'accès au formulaire).
  const productId = await loadProductId(user, job.dossierId);
  if (!productId) return { ...job, productId };
  // Questions du produit (lues une fois, en cache) : chemins (si `tarification-lancer` ne les a pas copiés dans le job)
  // et libellés des questions ajoutées depuis les extranets.
  const product = await loadProductQuestions(productId);
  if (!product) return { ...job, productId };
  return {
    ...job,
    productId,
    productPaths: job.productPaths?.length ? job.productPaths : product.paths,
    productQuestions: product.extras,
  };
}

/** Produit de chaque dossier : il ne change pas une fois le dossier créé. */
const productIdCache = new Map<string, string>();

/** Produit du dossier, ou null s'il est illisible (règles, réseau). */
async function loadProductId(user: ExtensionUser, dossierId: string): Promise<string | null> {
  const path = `ci_cabinets/${user.cabinetId}/ci_dossiers/${dossierId}`;
  const cached = productIdCache.get(path);
  if (cached) return cached;
  try {
    const dossier = await getDoc(doc(getFirebase().firestore, path));
    const productId = dossier.get('productId');
    if (typeof productId !== 'string' || !productId) return null;
    productIdCache.set(path, productId);
    return productId;
  } catch {
    return null;
  }
}

/** Questions de chaque produit : un produit change rarement pendant un remplissage. */
const productCache = new Map<string, { paths: string[]; extras: ProductQuestion[] }>();

/**
 * Questions du produit : chemins de TOUTES ses questions (conditions comprises) et questions ajoutées depuis les
 * extranets avec leur libellé, ou null si le produit est illisible (règles, réseau) : l'appelant se rabat alors sur
 * les clés de quoteData.
 */
async function loadProductQuestions(productId: string): Promise<{ paths: string[]; extras: ProductQuestion[] } | null> {
  const cached = productCache.get(productId);
  if (cached) return cached;
  try {
    const { firestore } = getFirebase();
    const product = await getDoc(doc(firestore, `ci_products/${productId}`));
    const schema = product.get('questionnaireSchema') as QuestionnaireSection[] | undefined;
    if (!Array.isArray(schema)) return null;
    const questions = questionsOf(schema);
    const extras = questions
      .filter(question => isExtraPath(question.canonicalPath))
      .map(question => ({
        path: question.canonicalPath as string,
        label: question.label,
        type: question.type,
        ...(question.choices ? { choices: question.choices.map(choice => choice.label) } : {}),
      }));
    const loaded = { paths: [...new Set(questions.map(question => question.canonicalPath as string))], extras };
    productCache.set(productId, loaded);
    return loaded;
  } catch {
    return null;
  }
}

/** Jobs récents du courtier (pour le badge « n tarifications à lancer »). */
export async function listRecentJobs(user: ExtensionUser): Promise<JobRecord[]> {
  return loadRecentJobs(user);
}

/**
 * Écrit l'avancement d'un job. Les règles Firestore n'autorisent que le statut et la progression
 * (`status`, `currentStep`, `totalSteps`, `missingFields`, `error`, `attempts`, `updatedAt`).
 */
export async function updateJob(user: ExtensionUser, dossierId: string, insurerId: string, update: JobUpdate): Promise<void> {
  const { firestore } = getFirebase();
  await updateDoc(doc(firestore, `ci_cabinets/${user.cabinetId}/ci_dossiers/${dossierId}/ci_quoteJobs/${insurerId}`), {
    status: update.status,
    currentStep: update.currentStep ?? null,
    totalSteps: update.totalSteps ?? null,
    missingFields: update.missingFields ?? [],
    error: update.error ?? null,
    updatedAt: serverTimestamp(),
  });
}

export const JOB_MESSAGES = {
  cancelled: 'Tarification annulée : ce dossier n’attend plus de tarif de cet assureur.',
  notInPricing: 'Le dossier n’est plus en tarification ni en comparaison : rien ne peut y être enregistré.',
} as const;

/**
 * Raison d'un refus d'écriture (`permission-denied`) sur un job ou une offre : job annulé, dossier sorti de la
 * tarification, ou null si aucune des deux (autorisation réellement manquante).
 */
export async function explainJobDenied(user: ExtensionUser, dossierId: string, insurerId: string): Promise<{ message: string; cancelled: boolean } | null> {
  const { firestore } = getFirebase();
  const base = `ci_cabinets/${user.cabinetId}/ci_dossiers/${dossierId}`;
  try {
    const job = await getDoc(doc(firestore, `${base}/ci_quoteJobs/${insurerId}`));
    if (job.get('status') === 'cancelled') return { message: JOB_MESSAGES.cancelled, cancelled: true };
    const dossier = await getDoc(doc(firestore, base));
    const status = dossier.get('status');
    if (!dossier.exists() || !['tarification', 'comparaison'].includes(status)) return { message: JOB_MESSAGES.notInPricing, cancelled: false };
  } catch {
    // Lecture refusée elle aussi : autorisation manquante.
  }
  return null;
}

/**
 * Suit un job : appelle `onChange` quand le dossier a changé (le courtier a répondu aux champs manquants)
 * ou que le job est relancé. Renvoie la fonction qui arrête le suivi.
 */
export function watchJob(user: ExtensionUser, dossierId: string, insurerId: string, onChange: (job: JobContext) => void): () => void {
  const { firestore } = getFirebase();
  let lastQuoteData = '';
  return onSnapshot(doc(firestore, `ci_cabinets/${user.cabinetId}/ci_dossiers/${dossierId}/ci_quoteJobs/${insurerId}`), snapshot => {
    const data = snapshot.data();
    if (!data) return;
    // Nos propres écritures de statut ne relancent pas le remplissage : seul un changement des données le fait.
    const quoteData = JSON.stringify(data['quoteData'] ?? {});
    // Une annulation (corbeille, sans suite, tarification-annuler) est toujours transmise : le remplissage s'arrête.
    const cancelled = data['status'] === 'cancelled';
    if (cancelled || (lastQuoteData !== '' && quoteData !== lastQuoteData)) {
      onChange({
        dossierId,
        insurerId,
        insurerName: null,
        status: data['status'],
        quoteData: data['quoteData'] ?? {},
        missingFields: data['missingFields'] ?? [],
        ...(Array.isArray(data['productPaths']) && data['productPaths'].length ? { productPaths: data['productPaths'] } : {}),
      });
    }
    lastQuoteData = quoteData;
  });
}

/**
 * Enregistre l'offre capturée et passe le job à `captured`, en une seule écriture (tout ou rien). Les règles Firestore
 * n'acceptent qu'une offre `source: auto` aux champs attendus, sur un job du courtier. Le code de chaque garantie
 * (référentiel du produit) est posé ensuite côté serveur : l'extension écrit le libellé lu sur la page.
 * L'offre arrive « à vérifier » (`review: pending`) : le courtier la valide ou la corrige dans l'onglet Tarification.
 */
/**
 * Écrit le tarif lu. `again` : un tarif de cet onglet est déjà enregistré (le courtier sauvegarde une autre formule,
 * annuel ↔ mensuel) ; seule l'offre est réécrite, le job est déjà `captured` (règles : ciExtOfferRewrite).
 */
export async function writeCapturedOffer(user: ExtensionUser, dossierId: string, insurerId: string, offer: CapturedOffer, again = false): Promise<void> {
  const { firestore } = getFirebase();
  const base = `ci_cabinets/${user.cabinetId}/ci_dossiers/${dossierId}`;
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, `${base}/ci_offers/${insurerId}`), {
    quoteNumber: offer.quoteNumber,
    premiumAnnual: offer.premiumAnnual,
    premiumMonthly: offer.premiumMonthly,
    deductibles: offer.deductibles,
    guarantees: offer.guarantees.map(g => ({ code: null, label: g.label, included: g.included, limit: g.limit, deductible: g.deductible })),
    exclusions: offer.exclusions,
    source: 'auto',
    capturedAt: serverTimestamp(),
    review: 'pending',
  });
  if (!again) batch.update(doc(firestore, `${base}/ci_quoteJobs/${insurerId}`), {
    status: 'captured',
    missingFields: [],
    error: null,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

/** Signalement d'un échec (E10-4) : assureur, origine de l'extranet, étape et code. AUCUNE donnée client. */
export async function addExtensionReport(report: { insurerId: string; origin: string; step: ExtensionReportStep; issue: ExtensionReportIssue }): Promise<void> {
  await addDoc(collection(getFirebase().firestore, 'ci_extensionReports'), { ...report, at: serverTimestamp() });
}

/** Appel à `ia-proxy` : la clé d'IA et le prompt système (choisi d'après `purpose`) restent côté serveur. */
export async function askAi(request: { purpose: string; messages: { role: 'user'; content: string }[]; maxTokens: number }): Promise<string> {
  const body = { purpose: request.purpose, messages: request.messages, maxTokens: request.maxTokens };
  const result = await httpsCallable<typeof body, { text: string }>(getFirebase().functions, 'ia-proxy')(body);
  return result.data.text;
}
