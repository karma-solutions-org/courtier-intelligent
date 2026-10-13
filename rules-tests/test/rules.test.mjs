import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const A = 'cabA';
const B = 'cabB';
const APP_TIME = 1700000000; // auth_time of the app token (members/{uid}.session.authTime)
const EXT_TIME = 1700000500; // auth_time of the extension token (session.extensionAuthTime)
const D = 'dos1';

/** uid -> claims (ci_cabinet_id / ci_role, set by Cloud Functions) */
const USERS = {
  adminA: { cabinet: A, role: 'admin' },
  brokerA: { cabinet: A, role: 'courtier' },
  broker2A: { cabinet: A, role: 'courtier' },
  adminB: { cabinet: B, role: 'admin' },
};

let env;

function token(uid, authTime) {
  const u = USERS[uid];
  return { ci_cabinet_id: u.cabinet, ci_role: u.role, auth_time: authTime };
}
const app = uid => env.authenticatedContext(uid, token(uid, APP_TIME)).firestore();
const ext = uid => env.authenticatedContext(uid, token(uid, EXT_TIME)).firestore();
const anon = () => env.unauthenticatedContext().firestore();

/** Mirrors toAssureData (assure-form.model.ts). */
function assureData(overrides = {}) {
  return {
    type: 'particulier',
    civilite: 'M.',
    firstName: 'Jean',
    lastName: 'Dupont',
    companyName: null,
    siret: null,
    birthDate: '1980-01-01',
    email: 'jean@example.fr',
    phone: null,
    address: { street: '1 rue X', postalCode: '75001', city: 'Paris', country: 'FR' },
    ...overrides,
  };
}

/** Mirrors the offer written by writeCapturedOffer (extension/src/background/jobs-service.ts). */
function capturedOffer(overrides = {}) {
  return {
    quoteNumber: 'Q-123',
    premiumAnnual: 540,
    premiumMonthly: 45,
    deductibles: { general: 150 },
    guarantees: [{ code: null, label: 'RC', included: true, limit: 1000000, deductible: null }],
    exclusions: ['Guerre'],
    source: 'auto',
    capturedAt: serverTimestamp(),
    ...overrides,
  };
}

/** Mirrors updateJob (jobs-service.ts). */
function jobUpdate(status, extra = {}) {
  return { status, currentStep: 1, totalSteps: 4, missingFields: [], error: null, updatedAt: serverTimestamp(), ...extra };
}

async function seed() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const c of [A, B]) {
      await setDoc(doc(db, `ci_cabinets/${c}`), { name: `Cabinet ${c}`, active: true, ownerUid: 'x', planId: 'pro' });
      await setDoc(doc(db, `ci_cabinets/${c}/ci_dossiers/${D}`), { reference: 'D-1', status: 'en_cours', assureId: 'as1' });
      await setDoc(doc(db, `ci_cabinets/${c}/ci_assures/as1`), { ...assureData(), createdBy: 'seed' });
      await setDoc(doc(db, `ci_cabinets/${c}/ci_dossiers/${D}/ci_offers/manual`), { ...capturedOffer({ capturedAt: null }), source: 'manual', enteredBy: 'adminA' });
      await setDoc(doc(db, `ci_cabinets/${c}/ci_dossiers/${D}/ci_documents/doc1`), {
        type: 'devis', storagePath: `cabinets/${c}/dossiers/${D}/devis.pdf`, fileName: 'devis.pdf', ocrFields: [],
        status: 'ready', uploadedBy: 'brokerA',
      });
    }
    for (const [uid, u] of Object.entries(USERS)) {
      await setDoc(doc(db, `ci_cabinets/${u.cabinet}/ci_members/${uid}`), {
        email: `${uid}@x.fr`, displayName: uid, role: u.role, status: 'active',
        session: { authTime: APP_TIME, extensionAuthTime: EXT_TIME, deviceId: 'dev1', lastSeen: null },
      });
    }
    const job = { ownerUid: 'brokerA', quoteData: {}, missingFields: [], currentStep: null, totalSteps: null, error: null, attempts: 1 };
    for (const [id, status] of [['axa', 'requested'], ['allianz', 'captured'], ['maaf', 'failed'], ['manual', 'requested']]) {
      await setDoc(doc(db, `ci_cabinets/${A}/ci_dossiers/${D}/ci_quoteJobs/${id}`), { ...job, status });
    }
    await setDoc(doc(db, `ci_cabinets/${A}/ci_dossiers/${D}/ci_quoteJobs/other`), { ...job, status: 'requested', ownerUid: 'broker2A' });
    await setDoc(doc(db, `ci_cabinets/${B}/ci_dossiers/${D}/ci_quoteJobs/axa`), { ...job, status: 'requested', ownerUid: 'adminB' });
  });
}

async function setJobStatus(id, status) {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `ci_cabinets/${A}/ci_dossiers/${D}/ci_quoteJobs/${id}`), { status }));
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ci-rules',
    firestore: { rules: readFileSync(new URL('../generated/firestore.rules', import.meta.url), 'utf8') },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe('unauthenticated', () => {
  it('cannot read or write anything', async () => {
    const db = anon();
    await assertFails(getDoc(doc(db, `ci_cabinets/${A}`)));
    await assertFails(getDoc(doc(db, `ci_cabinets/${A}/ci_dossiers/${D}`)));
    await assertFails(getDoc(doc(db, `ci_cabinets/${A}/ci_assures/as1`)));
    await assertFails(getDocs(collection(db, `ci_cabinets/${A}/ci_assures`)));
    await assertFails(addDoc(collection(db, `ci_cabinets/${A}/ci_assures`), { ...assureData(), createdBy: null }));
    await assertFails(getDoc(doc(db, 'ci_products/p1')));
    await assertFails(getDoc(doc(db, 'unrelated/x')));
  });
});

describe('session / device checks', () => {
  it('member with the app token reads own cabinet', async () => {
    await assertSucceeds(getDoc(doc(app('brokerA'), `ci_cabinets/${A}/ci_dossiers/${D}`)));
  });
  it('stale token (other auth_time) denied, but own member doc readable', async () => {
    const db = env.authenticatedContext('brokerA', token('brokerA', 1600000000)).firestore();
    await assertFails(getDoc(doc(db, `ci_cabinets/${A}/ci_dossiers/${D}`)));
    await assertSucceeds(getDoc(doc(db, `ci_cabinets/${A}/ci_members/brokerA`)));
  });
  it('extension token does not get app rights', async () => {
    await assertFails(getDoc(doc(ext('brokerA'), `ci_cabinets/${A}/ci_dossiers/${D}`)));
    await assertSucceeds(getDoc(doc(ext('brokerA'), `ci_cabinets/${A}/ci_members/brokerA`)));
  });
  it('disabled cabinet denied', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `ci_cabinets/${A}`), { active: false }));
    await assertFails(getDoc(doc(app('brokerA'), `ci_cabinets/${A}/ci_dossiers/${D}`)));
  });
  it('seat limit grace elapsed: courtier denied, admin allowed', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `ci_cabinets/${A}`), { graceEndsAt: new Date(0) }));
    await assertFails(getDoc(doc(app('brokerA'), `ci_cabinets/${A}/ci_dossiers/${D}`)));
    await assertSucceeds(getDoc(doc(app('adminA'), `ci_cabinets/${A}/ci_dossiers/${D}`)));
  });
});

describe('cross-cabinet isolation', () => {
  const paths = [`ci_cabinets/${B}`, `ci_cabinets/${B}/ci_dossiers/${D}`, `ci_cabinets/${B}/ci_assures/as1`,
    `ci_cabinets/${B}/ci_dossiers/${D}/ci_documents/doc1`, `ci_cabinets/${B}/ci_dossiers/${D}/ci_offers/manual`,
    `ci_cabinets/${B}/ci_dossiers/${D}/ci_quoteJobs/axa`, `ci_cabinets/${B}/ci_members/adminB`];
  it('member of A cannot read B docs', async () => {
    for (const p of paths) await assertFails(getDoc(doc(app('adminA'), p)));
    await assertFails(getDocs(collection(app('adminA'), `ci_cabinets/${B}/ci_assures`)));
    await assertFails(getDocs(collection(app('adminA'), `ci_cabinets/${B}/ci_dossiers`)));
  });
  it('member of A cannot write B docs', async () => {
    const db = app('adminA');
    await assertFails(addDoc(collection(db, `ci_cabinets/${B}/ci_assures`), { ...assureData(), createdBy: 'adminA', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, `ci_cabinets/${B}/ci_assures/as1`), { firstName: 'X' }));
    await assertFails(deleteDoc(doc(db, `ci_cabinets/${B}/ci_assures/as1`)));
    await assertFails(deleteDoc(doc(db, `ci_cabinets/${B}/ci_dossiers/${D}/ci_documents/doc1`)));
    await assertFails(setDoc(doc(db, `ci_cabinets/${B}/ci_dossiers/${D}/ci_documents/new`), {
      type: 'devis', storagePath: `cabinets/${B}/x.pdf`, uploadedBy: 'adminA', ocrFields: [], status: 'ready' }));
    await assertFails(setDoc(doc(db, `ci_cabinets/${B}/ci_dossiers/${D}/ci_offers/axa`), capturedOffer()));
    await assertFails(addDoc(collection(db, `ci_cabinets/${B}/ci_dossiers/${D}/ci_events`), { type: 'note', by: 'adminA', at: serverTimestamp(), data: { text: 'x' } }));
  });
  it('extension of A cannot read/write B jobs/offers', async () => {
    await assertFails(getDoc(doc(ext('adminA'), `ci_cabinets/${B}/ci_dossiers/${D}/ci_quoteJobs/axa`)));
    await assertFails(updateDoc(doc(ext('adminA'), `ci_cabinets/${B}/ci_dossiers/${D}/ci_quoteJobs/axa`), jobUpdate('analyzing')));
    await assertFails(setDoc(doc(ext('adminA'), `ci_cabinets/${B}/ci_dossiers/${D}/ci_offers/axa`), capturedOffer()));
  });
});

describe('members', () => {
  const me = () => doc(app('brokerA'), `ci_cabinets/${A}/ci_members/brokerA`);
  it('session.lastSeen self-update allowed (session.service)', async () => {
    await assertSucceeds(updateDoc(me(), { 'session.lastSeen': serverTimestamp() }));
  });
  it('cannot change own role / status / session.authTime', async () => {
    await assertFails(updateDoc(me(), { role: 'admin' }));
    await assertFails(updateDoc(me(), { status: 'disabled' }));
    await assertFails(updateDoc(me(), { 'session.authTime': 1 }));
    await assertFails(updateDoc(me(), { 'session.lastSeen': new Date(0) }));
    await assertFails(updateDoc(me(), { 'session.lastSeen': serverTimestamp(), role: 'admin' }));
  });
  it('cannot update another member, create or delete members', async () => {
    await assertFails(updateDoc(doc(app('brokerA'), `ci_cabinets/${A}/ci_members/broker2A`), { 'session.lastSeen': serverTimestamp() }));
    await assertFails(setDoc(doc(app('adminA'), `ci_cabinets/${A}/ci_members/newbie`), { role: 'admin', status: 'active' }));
    await assertFails(deleteDoc(doc(app('adminA'), `ci_cabinets/${A}/ci_members/brokerA`)));
  });
  it('cannot change own cabinet or cabinet server fields', async () => {
    await assertFails(setDoc(doc(app('brokerA'), `ci_cabinets/${B}/ci_members/brokerA`), { role: 'admin', status: 'active' }));
    await assertFails(updateDoc(doc(app('adminA'), `ci_cabinets/${A}`), { ownerUid: 'adminA' }));
    await assertFails(updateDoc(doc(app('adminA'), `ci_cabinets/${A}`), { planId: 'max' }));
    await assertFails(updateDoc(doc(app('brokerA'), `ci_cabinets/${A}`), { name: 'Nouveau nom' }));
    await assertSucceeds(updateDoc(doc(app('adminA'), `ci_cabinets/${A}`), { name: 'Nouveau nom' }));
  });
});

describe('dossiers', () => {
  const d = () => doc(app('adminA'), `ci_cabinets/${A}/ci_dossiers/${D}`);
  it('client update denied entirely (incl. outcome/proposal/decision)', async () => {
    for (const patch of [{ status: 'gagne' }, { outcome: 'won' }, { proposal: { insurerId: 'axa' } },
      { decision: { by: 'adminA' } }, { reference: 'D-2' }]) {
      await assertFails(updateDoc(d(), patch));
    }
  });
  it('create and delete denied', async () => {
    await assertFails(setDoc(doc(app('adminA'), `ci_cabinets/${A}/ci_dossiers/new`), { reference: 'X' }));
    await assertFails(deleteDoc(d()));
  });
});

describe('assures', () => {
  const col = () => collection(app('brokerA'), `ci_cabinets/${A}/ci_assures`);
  const as1 = () => doc(app('brokerA'), `ci_cabinets/${A}/ci_assures/as1`);
  const created = (o = {}, extra = {}) => ({ ...assureData(o), createdBy: 'brokerA', createdAt: serverTimestamp(), ...extra });
  it('create with legitimate payloads (AssuresService.create)', async () => {
    await assertSucceeds(addDoc(col(), created()));
    await assertSucceeds(addDoc(col(), created({ type: 'pro', civilite: null, birthDate: null, companyName: 'ACME', siret: '12345678901234' })));
  });
  it('create denied with createdBy of someone else', async () => {
    await assertFails(addDoc(col(), created({}, { createdBy: 'broker2A' })));
  });
  it('create denied with unknown keys / oversized names', async () => {
    await assertFails(addDoc(col(), created({}, { isAdmin: true })));
    await assertFails(addDoc(col(), created({ lastName: 'x'.repeat(201) })));
    await assertFails(addDoc(col(), created({ firstName: 'x'.repeat(201) })));
  });
  it('update with legitimate payload (AssuresService.update)', async () => {
    await assertSucceeds(updateDoc(as1(), { ...assureData({ firstName: 'Paul', email: null }), updatedAt: serverTimestamp() }));
  });
  it('update denied: createdBy change, unknown keys, oversized names, big address', async () => {
    await assertFails(updateDoc(as1(), { ...assureData(), createdBy: 'brokerA', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(as1(), { ...assureData(), updatedAt: serverTimestamp(), foo: 1 }));
    await assertFails(updateDoc(as1(), { ...assureData({ firstName: 'x'.repeat(201) }), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(as1(), { ...assureData({ lastName: 'x'.repeat(201) }), updatedAt: serverTimestamp() }));
    const address = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, 'v']));
    await assertFails(updateDoc(as1(), { ...assureData({ address }), updatedAt: serverTimestamp() }));
  });
  it('delete: admin only', async () => {
    await assertFails(deleteDoc(as1()));
    await assertSucceeds(deleteDoc(doc(app('adminA'), `ci_cabinets/${A}/ci_assures/as1`)));
  });
});

describe('quoteJobs (extension)', () => {
  const job = (id = 'axa', uid = 'brokerA') => doc(ext(uid), `ci_cabinets/${A}/ci_dossiers/${D}/ci_quoteJobs/${id}`);
  it('owner reads own job and side panel collection-group query', async () => {
    await assertSucceeds(getDoc(job()));
    await assertSucceeds(getDocs(query(collectionGroup(ext('brokerA'), 'ci_quoteJobs'), where('ownerUid', '==', 'brokerA'))));
    await assertFails(getDoc(job('other')));
  });
  it('valid chain requested -> analyzing -> filling -> awaiting_submit -> captured', async () => {
    for (const s of ['analyzing', 'filling', 'awaiting_submit', 'captured']) {
      await assertSucceeds(updateDoc(job(), jobUpdate(s)));
    }
  });
  it('needs_info with missingFields, then failed with error', async () => {
    await assertSucceeds(updateDoc(job(), jobUpdate('needs_info', { missingFields: [{ key: 'birthDate', label: 'Date' }] })));
    await assertSucceeds(updateDoc(job(), jobUpdate('failed', { error: 'boom' })));
  });
  it('terminal statuses: captured -> filling and failed -> captured denied', async () => {
    await assertFails(updateDoc(job('allianz'), jobUpdate('filling')));
    await assertFails(updateDoc(job('maaf'), jobUpdate('captured')));
  });
  it('non-owner denied, app token denied', async () => {
    await assertFails(updateDoc(job('axa', 'broker2A'), jobUpdate('analyzing')));
    await assertFails(updateDoc(doc(app('brokerA'), `ci_cabinets/${A}/ci_dossiers/${D}/ci_quoteJobs/axa`), jobUpdate('analyzing')));
  });
  it('oversized missingFields / error, forbidden keys, back to requested denied', async () => {
    await assertFails(updateDoc(job(), jobUpdate('needs_info', { missingFields: Array.from({ length: 201 }, (_, i) => ({ key: `f${i}` })) })));
    await assertFails(updateDoc(job(), jobUpdate('failed', { error: 'x'.repeat(2001) })));
    await assertFails(updateDoc(job(), jobUpdate('analyzing', { ownerUid: 'broker2A' })));
    await assertFails(updateDoc(job(), jobUpdate('analyzing', { quoteData: { a: 1 } })));
    await assertFails(updateDoc(job(), jobUpdate('requested')));
  });
});

describe('offers (extension writeCapturedOffer batch)', () => {
  function capture(id, offer = capturedOffer(), uid = 'brokerA') {
    const db = ext(uid);
    const base = `ci_cabinets/${A}/ci_dossiers/${D}`;
    const batch = writeBatch(db);
    batch.set(doc(db, `${base}/ci_offers/${id}`), offer);
    batch.update(doc(db, `${base}/ci_quoteJobs/${id}`), { status: 'captured', missingFields: [], error: null, updatedAt: serverTimestamp() });
    return batch.commit();
  }
  it('owner writes auto offer + job captured in one batch', async () => {
    await assertSucceeds(capture('axa'));
  });
  it('re-capture over an existing auto offer while job runnable', async () => {
    await assertSucceeds(capture('axa'));
    await setJobStatus('axa', 'awaiting_submit');
    await assertSucceeds(capture('axa', capturedOffer({ premiumAnnual: 600 })));
  });
  it('monthly-only premium and null quote number allowed', async () => {
    await assertSucceeds(capture('axa', capturedOffer({ premiumAnnual: null, quoteNumber: null })));
  });
  it('denied over a manual offer', async () => {
    await assertFails(capture('manual'));
  });
  it('denied after job captured / failed', async () => {
    await assertFails(capture('allianz'));
    await assertFails(capture('maaf'));
  });
  it('denied for non-owner, app token and invalid offers', async () => {
    await assertFails(capture('other'));
    await assertFails(setDoc(doc(app('brokerA'), `ci_cabinets/${A}/ci_dossiers/${D}/ci_offers/axa`), capturedOffer()));
    await assertFails(capture('axa', capturedOffer({ source: 'manual' })));
    await assertFails(capture('axa', capturedOffer({ score: 99 })));
    await assertFails(capture('axa', capturedOffer({ premiumAnnual: null, premiumMonthly: null })));
    await assertFails(capture('axa', capturedOffer({ premiumAnnual: -1 })));
    await assertFails(capture('axa', capturedOffer({ quoteNumber: 'x'.repeat(61) })));
    await assertFails(capture('axa', capturedOffer({ capturedAt: new Date(0) })));
    await assertFails(capture('axa', capturedOffer({ guarantees: Array.from({ length: 61 }, () => ({ label: 'g' })) })));
  });
});

describe('documents', () => {
  const docRef = (uid, id = 'doc1') => doc(app(uid), `ci_cabinets/${A}/ci_dossiers/${D}/ci_documents/${id}`);
  it('delete by uploader allowed', async () => {
    await assertSucceeds(deleteDoc(docRef('brokerA')));
  });
  it('delete by admin allowed', async () => {
    await assertSucceeds(deleteDoc(docRef('adminA')));
  });
  it('delete by other member denied', async () => {
    await assertFails(deleteDoc(docRef('broker2A')));
  });
  it('create and update: functions only', async () => {
    const base = { type: 'devis', fileName: 'a.pdf', ocrFields: [], status: 'pending', uploadedBy: 'brokerA' };
    await assertFails(setDoc(docRef('brokerA', 'n1'), { ...base, storagePath: `cabinets/${A}/dossiers/${D}/a.pdf` }));
    await assertFails(updateDoc(docRef('brokerA'), { fileName: 'renamed.pdf' }));
    await assertFails(updateDoc(docRef('brokerA'), { status: 'analysed' }));
  });
  it('client documents: readable by members, written by functions only', async () => {
    const ref = uid => doc(app(uid), `ci_cabinets/${A}/ci_assures/a1/ci_documents/p1`);
    await assertSucceeds(getDoc(ref('brokerA')));
    await assertFails(getDoc(doc(app('adminB'), `ci_cabinets/${A}/ci_assures/a1/ci_documents/p1`)));
    await assertFails(setDoc(ref('brokerA'), { type: 'cni' }));
  });
});

describe('note events', () => {
  const col = uid => collection(app(uid), `ci_cabinets/${A}/ci_dossiers/${D}/ci_events`);
  it('note by self with server time allowed', async () => {
    await assertSucceeds(addDoc(col('brokerA'), { type: 'note', by: 'brokerA', at: serverTimestamp(), data: { text: 'Appel client' } }));
    await assertSucceeds(addDoc(col('brokerA'), { type: 'note', by: 'brokerA', at: serverTimestamp() }));
  });
  it('constraints enforced', async () => {
    await assertFails(addDoc(col('brokerA'), { type: 'status_changed', by: 'brokerA', at: serverTimestamp() }));
    await assertFails(addDoc(col('brokerA'), { type: 'note', by: 'broker2A', at: serverTimestamp() }));
    await assertFails(addDoc(col('brokerA'), { type: 'note', by: 'brokerA', at: new Date(0) }));
    await assertFails(addDoc(col('brokerA'), { type: 'note', by: 'brokerA', at: serverTimestamp(), extra: 1 }));
    await assertFails(addDoc(col('brokerA'), { type: 'note', by: 'brokerA', at: serverTimestamp(), data: 'text' }));
    await assertFails(addDoc(col('brokerA'), { type: 'note', by: 'brokerA', at: serverTimestamp(), data: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 } }));
  });
  it('events are immutable', async () => {
    await env.withSecurityRulesDisabled(ctx =>
      setDoc(doc(ctx.firestore(), `ci_cabinets/${A}/ci_dossiers/${D}/ci_events/e1`), { type: 'note', by: 'brokerA', at: new Date() }));
    const e1 = doc(app('brokerA'), `ci_cabinets/${A}/ci_dossiers/${D}/ci_events/e1`);
    await assertFails(updateDoc(e1, { data: { text: 'edit' } }));
    await assertFails(deleteDoc(e1));
  });
});

describe('global resources', () => {
  it('extension reports: closed codes, origin only', async () => {
    const db = ext('brokerA');
    const report = { insurerId: 'axa', origin: 'https://extranet.axa.fr', step: 'extract', issue: 'premium_not_found', at: serverTimestamp() };
    await assertSucceeds(addDoc(collection(db, 'ci_extensionReports'), report));
    await assertFails(addDoc(collection(db, 'ci_extensionReports'), { ...report, origin: 'https://extranet.axa.fr/client?id=1' }));
    await assertFails(addDoc(collection(app('brokerA'), 'ci_extensionReports'), report));
  });
  it('catalogue read by active member, write denied', async () => {
    await assertSucceeds(getDoc(doc(app('brokerA'), 'ci_products/p1')));
    await assertFails(setDoc(doc(app('adminA'), 'ci_products/p1'), { name: 'x' }));
  });
});
