// À copier dans le back-end : functions/src/champs/champs.callable.ts, à côté de `signaler`
// (exporté dans le groupe `champs`, d'où le nom « champs-constater » appelé par l'extension).
//
// Constat d'un parcours mené jusqu'au tarif : tous les champs vus sur l'extranet. Met à jour les questions découvertes
// (libellé, choix) et compte celles dont le champ a disparu ; après ABSENT_AFTER_RUNS parcours, la question n'est plus
// posée pour cet extranet. Rien n'est supprimé. Règles et tests : shared/discovered-fields.ts (applySighting).
//
// Les 3 points marqués « COMME champs-signaler » doivent reprendre EXACTEMENT le code de `signaler` (mêmes gardes,
// même façon de trouver le produit) : ce fichier ne les devine pas.
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { applySighting, SIGHTING_MAX_FIELDS, type Product } from '@shared';

interface SightedField {
  fieldKey: string;
  label: string;
  options: { value: string; label: string }[];
}

/** Champs reçus de l'extension : structure seulement, tronquée comme le reste des signalements. */
function readFields(raw: unknown): SightedField[] {
  if (!Array.isArray(raw)) throw new HttpsError('invalid-argument', 'fields doit être une liste.');
  return raw
    .slice(0, SIGHTING_MAX_FIELDS)
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .filter(f => typeof f.fieldKey === 'string' && typeof f.label === 'string')
    .map(f => ({
      fieldKey: (f.fieldKey as string).slice(0, 200),
      label: (f.label as string).slice(0, 250),
      options: Array.isArray(f.options)
        ? f.options
            .filter((o): o is { value: string; label: string } => typeof o?.value === 'string' && typeof o?.label === 'string')
            .slice(0, 40)
        : [],
    }));
}

export const constater = onCall({ region: 'europe-west1' }, async request => {
  // 1. COMME champs-signaler : utilisateur connecté, cabinet actif, droits de l'extension.
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');

  const { insurerId, origin } = request.data ?? {};
  if (typeof insurerId !== 'string' || typeof origin !== 'string' || !/^https:\/\/[^/]+$/.test(origin)) {
    throw new HttpsError('invalid-argument', 'insurerId et origin (origine seule) sont requis.');
  }
  const fields = readFields(request.data.fields);

  // 2. COMME champs-signaler : l'origine doit appartenir à cet assureur (domaines du catalogue).

  // 3. COMME champs-signaler : produit concerné (même façon de le trouver que `signaler`).
  const productId: string = await productIdFor(request);

  const db = getFirestore();
  const ref = db.collection('ci_products').doc(productId);
  // Transaction : deux parcours finis en même temps ne doivent pas s'écraser (compteurs d'absence).
  const changed = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Produit inconnu.');
    const product = snap.data() as Product;
    const result = applySighting(product.questionnaireSchema ?? [], fields, origin);
    if (result.changed) tx.update(ref, { questionnaireSchema: result.schema });
    return result.changed;
  });
  return { changed };
});

/** À remplacer par le code de `signaler` qui trouve le produit. */
async function productIdFor(_request: unknown): Promise<string> {
  throw new HttpsError('unimplemented', 'Reprendre la recherche du produit de champs-signaler.');
}
