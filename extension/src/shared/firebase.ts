import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, initializeFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, Functions, getFunctions } from 'firebase/functions';

/** Remplacé par esbuild : `npm run build:emulators` vise les emulators locaux. */
declare const __USE_EMULATORS__: boolean;

// Même projet Firebase que l'app (aibs-partenaire-testing, partagé avec d'autres applications).
// Ces valeurs ne sont pas secrètes : l'accès est protégé par les règles Firestore et les Cloud Functions.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDq9ewLvlEluB0AMN_PRHG-a1G7nRTxYOw',
  authDomain: 'aibs-partenaire-testing.firebaseapp.com',
  projectId: 'aibs-partenaire-testing',
  storageBucket: 'aibs-partenaire-testing.appspot.com',
  messagingSenderId: '244765868255',
  appId: '1:244765868255:web:45560f8ebd1b4b8787296a',
};

/** Région des Cloud Functions de courtier-intelligent-back. */
const FUNCTIONS_REGION = 'europe-west3';

export interface Firebase {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
}

let instance: Firebase | null = null;

/**
 * Initialise Firebase pour le service worker (une seule fois). L'authentification est conservée dans IndexedDB :
 * le service worker MV3 est arrêté après quelques secondes d'inactivité et retrouve sa connexion au réveil.
 * `initializeAuth` (et non `getAuth`) : pas de popup ni de redirection, inutilisables dans un service worker.
 */
export function getFirebase(): Firebase {
  if (instance) return instance;
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  const firestore = initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true });
  const functions = getFunctions(app, FUNCTIONS_REGION);

  if (typeof __USE_EMULATORS__ !== 'undefined' && __USE_EMULATORS__) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  instance = { app, auth, firestore, functions };
  return instance;
}
