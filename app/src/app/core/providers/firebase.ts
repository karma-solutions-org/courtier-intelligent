import { InjectionToken } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import type { FirebaseStorage } from 'firebase/storage';
import { environment } from '../../../environments/environment';

/** Service Firebase chargé à la première utilisation (SDK hors du bundle initial). */
export type LazyService<T> = () => Promise<T>;

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<LazyService<Auth>>('FIREBASE_AUTH');
export const FIRESTORE = new InjectionToken<LazyService<Firestore>>('FIRESTORE');
export const FIREBASE_FUNCTIONS = new InjectionToken<LazyService<Functions>>('FIREBASE_FUNCTIONS');
export const FIREBASE_STORAGE = new InjectionToken<LazyService<FirebaseStorage>>('FIREBASE_STORAGE');

/** Charge le service une seule fois (la même promesse sert tous les appels) ; un échec permet de réessayer. */
function once<T>(load: () => Promise<T>): LazyService<T> {
  let promise: Promise<T> | null = null;
  return () =>
    (promise ??= load().catch(error => {
      promise = null;
      throw error;
    }));
}

/**
 * Initialise le SDK Firebase une seule fois et expose chaque service via un token. Chaque service (Auth compris)
 * est importé à la première utilisation : le SDK reste hors du bundle initial. L'authentification est demandée
 * dès le démarrage (état de connexion des gardes de route), mais téléchargée en parallèle du reste.
 */
export function provideFirebase() {
  const app = initializeApp(environment.firebaseConfig);
  const auth = once(async () => {
    const { connectAuthEmulator, getAuth } = await import('firebase/auth');
    const instance = getAuth(app);
    if (environment.useEmulators) connectAuthEmulator(instance, 'http://127.0.0.1:9099', { disableWarnings: true });
    return instance;
  });

  const firestore = once(async () => {
    const { connectFirestoreEmulator, initializeFirestore } = await import('firebase/firestore');
    const instance = initializeFirestore(app, { ignoreUndefinedProperties: true });
    if (environment.useEmulators) connectFirestoreEmulator(instance, '127.0.0.1', 8080);
    return instance;
  });
  const functions = once(async () => {
    const { connectFunctionsEmulator, getFunctions } = await import('firebase/functions');
    // Même région que les Cloud Functions de courtier-intelligent-back.
    const instance = getFunctions(app, 'europe-west3');
    if (environment.useEmulators) connectFunctionsEmulator(instance, '127.0.0.1', 5001);
    return instance;
  });
  const storage = once(async () => {
    const { connectStorageEmulator, getStorage } = await import('firebase/storage');
    const instance = getStorage(app);
    if (environment.useEmulators) connectStorageEmulator(instance, '127.0.0.1', 9199);
    return instance;
  });

  return [
    { provide: FIREBASE_APP, useValue: app },
    { provide: FIREBASE_AUTH, useValue: auth },
    { provide: FIRESTORE, useValue: firestore },
    { provide: FIREBASE_FUNCTIONS, useValue: functions },
    { provide: FIREBASE_STORAGE, useValue: storage },
  ];
}
