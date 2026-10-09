import { describeJob } from '../background/jobs';
import { CaptureView, describeRun, parseAmountInput, ProblemRow, RunView } from './run-view';
import { ActivePage, CaptureResponse, ExtensionMessage, PanelState, PortMessage, SIDE_PANEL_PORT, SignInResponse } from '../shared/messages';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const loginSection = $('login');
const loginNotice = $('login-notice');
const loginForm = $<HTMLFormElement>('login-form');
const loginError = $('login-error');
const loginSubmit = $<HTMLButtonElement>('login-submit');
const connectedSection = $('connected');

const setText = (el: HTMLElement, text: string | null) => {
  el.textContent = text ?? '';
  el.hidden = !text;
};

document.getElementById('version')!.textContent = `Version ${chrome.runtime.getManifest().version}`;

const send = <T>(message: ExtensionMessage): Promise<T> => chrome.runtime.sendMessage(message);

/** Affiche l'écran de connexion ou le courtier connecté, avec son dossier et son job en cours. */
function render(state: PanelState): void {
  const signedIn = state.auth.status === 'signed_in';
  renderRun(state);
  loginSection.hidden = signedIn;
  connectedSection.hidden = !signedIn;

  if (state.auth.status === 'signed_out') {
    // Session perdue (déconnexion de l'app, nouvelle connexion, compte désactivé) : on explique pourquoi.
    setText(loginNotice, state.auth.notice);
    return;
  }

  const { user } = state.auth;
  $('account-name').textContent = user.displayName || user.email || user.uid;
  $('account-meta').textContent = `${user.email ?? ''} · ${user.role === 'admin' ? 'Administrateur' : 'Courtier'}`;

  if (state.job) {
    const { title, status, progress } = describeJob(state.job);
    $('job-title').textContent = title;
    $('job-status').textContent = status;
    setText($('job-progress'), progress);
    setText($('job-error'), state.job.error);
  } else {
    $('job-title').textContent = 'Aucune tarification en cours';
    $('job-status').textContent = 'Lancez une tarification depuis un dossier dans l’application.';
    setText($('job-progress'), null);
    setText($('job-error'), null);
  }
}

// ── Remplissage de l'extranet ───────────────────────────────────────────────
const el = (tag: string, text: string | null = null, className?: string): HTMLElement => {
  const node = document.createElement(tag);
  // textContent uniquement : les libellés viennent de pages tierces et ne doivent jamais être interprétés comme du HTML.
  if (text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
};

function problemItem(problem: ProblemRow, view: RunView): HTMLElement {
  const item = el('li');
  const name = el('span', problem.label, problem.required ? 'name required' : 'name');
  item.append(name, el('span', problem.required ? `${problem.kind} · obligatoire` : problem.kind, 'kind'));
  if (problem.reason) item.append(el('p', problem.reason, 'muted small'));

  if (problem.canAssign) {
    // Correction manuelle : le courtier associe le champ à une information du dossier.
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Associer « ${problem.label} » à une information du dossier`);
    select.append(new Option('Associer à…', ''), new Option('Ne pas remplir', '__none__'));
    view.assignable.forEach(({ path, label }) => select.append(new Option(label, path)));
    select.addEventListener('change', () => {
      if (!select.value) return;
      const canonicalPath = select.value === '__none__' ? null : (select.value as never);
      void send({ type: 'MANUAL_MAP', fieldKey: problem.key, canonicalPath });
    });
    item.append(select);
  }
  return item;
}

function renderRun(state: PanelState): void {
  const section = $('run');
  section.hidden = !state.run;
  if (!state.run) return;

  const view = describeRun(state.run);
  setText($('run-step'), view.step ?? 'Extranet détecté');
  $('run-phase').textContent = view.phase;
  $('run-summary').textContent = view.summary;
  setText($('run-message'), view.message);
  setText($('run-ai'), view.aiNote);
  setText($('run-memory'), view.memoryNote);

  $('run-missing-block').hidden = view.missing.length === 0;
  $('run-missing').replaceChildren(...view.missing.map(m => el('li', m.label)));
  $('run-problems-block').hidden = view.problems.length === 0;
  $('run-problems').replaceChildren(...view.problems.map(problem => problemItem(problem, view)));
  $('refill').hidden = view.capture !== null;
  $('capture-now').hidden = !view.canCapture;
  renderCapture(view.capture);
}

// ── Capture du tarif (page de résultat) ─────────────────────────────────────
const captureForm = $<HTMLFormElement>('capture-form');
const captureInputs = {
  premiumAnnual: $<HTMLInputElement>('capture-annual'),
  premiumMonthly: $<HTMLInputElement>('capture-monthly'),
  quoteNumber: $<HTMLInputElement>('capture-quote'),
};
/** Offre affichée dans le formulaire : on ne réécrit pas les champs (et la saisie du courtier) tant qu'elle ne change pas. */
let shownCaptureKey: string | null = null;

function renderCapture(capture: CaptureView | null): void {
  $('capture').hidden = capture === null;
  if (!capture) {
    shownCaptureKey = null;
    return;
  }
  if (capture.key !== shownCaptureKey) {
    shownCaptureKey = capture.key;
    captureInputs.premiumAnnual.value = capture.premiumAnnual;
    captureInputs.premiumMonthly.value = capture.premiumMonthly;
    captureInputs.quoteNumber.value = capture.quoteNumber;
    setText($('capture-error'), null);
  }
  captureForm.hidden = capture.key === 'null';
  Object.values(captureInputs).forEach(input => (input.readOnly = !capture.canConfirm));
  $<HTMLButtonElement>('capture-confirm').hidden = !capture.canConfirm;
  setText($('capture-deductible'), capture.deductible);
  $('capture-guarantees-block').hidden = capture.guarantees.length === 0;
  $('capture-guarantees').replaceChildren(...capture.guarantees.map(line => el('li', line)));
  $('capture-exclusions-block').hidden = capture.exclusions.length === 0;
  $('capture-exclusions').replaceChildren(...capture.exclusions.map(line => el('li', line)));
  setText($('capture-source'), capture.sourceNote);
  $('capture-retry').hidden = !capture.canRetry;
  setText($('capture-reject'), capture.rejectLabel);
}

captureForm.addEventListener('submit', async event => {
  event.preventDefault();
  const premiumAnnual = parseAmountInput(captureInputs.premiumAnnual.value);
  const premiumMonthly = parseAmountInput(captureInputs.premiumMonthly.value);
  if (premiumAnnual === undefined || premiumMonthly === undefined) {
    setText($('capture-error'), 'Montant invalide : saisissez un nombre, par exemple 640,50.');
    return;
  }
  if (premiumAnnual === null && premiumMonthly === null) {
    setText($('capture-error'), 'Indiquez au moins la prime annuelle ou la prime mensuelle.');
    return;
  }
  const confirm = $<HTMLButtonElement>('capture-confirm');
  confirm.disabled = true;
  const quoteNumber = captureInputs.quoteNumber.value.trim() || null;
  const response = await send<CaptureResponse>({ type: 'CONFIRM_CAPTURE', edits: { premiumAnnual, premiumMonthly, quoteNumber } });
  confirm.disabled = false;
  setText($('capture-error'), response.ok ? null : response.message);
});

$('capture-reject').addEventListener('click', async () => {
  const response = await send<CaptureResponse>({ type: 'REJECT_CAPTURE' });
  setText($('capture-error'), response.ok ? null : response.message);
});
$('capture-retry').addEventListener('click', () => void send({ type: 'CAPTURE_NOW' }));
$('capture-now').addEventListener('click', () => void send({ type: 'CAPTURE_NOW' }));
$('refill').addEventListener('click', () => void send({ type: 'REFILL' }));

// ── Connexion ───────────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const email = (loginForm.elements.namedItem('email') as HTMLInputElement).value;
  const password = (loginForm.elements.namedItem('password') as HTMLInputElement).value;
  if (!email.trim() || !password) {
    setText(loginError, 'Saisissez votre email et votre mot de passe.');
    return;
  }
  setText(loginError, null);
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'Connexion…';
  try {
    const response = await send<SignInResponse>({ type: 'SIGN_IN', email, password });
    if (response.ok) {
      loginForm.reset();
      setText(loginNotice, null);
      render(response.state);
    } else {
      setText(loginError, response.message);
    }
  } catch {
    setText(loginError, 'L’extension ne répond pas. Rechargez-la depuis chrome://extensions.');
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Se connecter';
  }
});

$('sign-out').addEventListener('click', async () => render(await send<PanelState>({ type: 'SIGN_OUT' })));

// ── Page active ─────────────────────────────────────────────────────────────
async function refreshActivePage(): Promise<void> {
  const page = (await send<ActivePage | null>({ type: 'GET_ACTIVE_PAGE' })) ?? null;
  $('page-origin').textContent = page ? page.origin : '—';
  $('page-fields').textContent = page
    ? `${page.fieldCount} champ${page.fieldCount > 1 ? 's' : ''} de formulaire détecté${page.fieldCount > 1 ? 's' : ''}`
    : 'Aucune page analysée sur cet onglet.';
}

// Mise à jour quand l'onglet actif change ou termine son chargement.
chrome.tabs.onActivated.addListener(() => void refreshActivePage());
chrome.tabs.onUpdated.addListener((_tabId, info) => {
  if (info.status === 'complete') setTimeout(() => void refreshActivePage(), 300);
});

// ── Suivi en direct (session et job) ────────────────────────────────────────
// Tant que ce port est ouvert, le service worker suit la session de l'appareil et le job en cours, et nous pousse
// l'état : la perte d'accès s'affiche aussitôt. Le signal régulier garde le service worker éveillé.
function connect(): void {
  const port = chrome.runtime.connect({ name: SIDE_PANEL_PORT });
  port.onMessage.addListener((message: PortMessage) => {
    if (message.type === 'STATE') render(message.state);
  });
  const keepAlive = setInterval(() => port.postMessage({ type: 'PING' }), 20_000);
  port.onDisconnect.addListener(() => {
    clearInterval(keepAlive);
    setTimeout(connect, 1_000); // le service worker a redémarré : on se reconnecte
  });
}

void send<PanelState>({ type: 'GET_STATE' }).then(render);
void refreshActivePage();
connect();
