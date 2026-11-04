import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { demoMode, firebaseConfig, functionsRegion } from '../config';

/**
 * Production uses the real project with a persistent IndexedDB cache, so the
 * wall keeps working through Wi-Fi drops. Demo mode talks to the local
 * emulators (project demo-manwar) with a memory cache, so a restarted
 * emulator never shows stale cached data.
 */
const app = initializeApp(demoMode ? { ...firebaseConfig, projectId: 'demo-manwar', apiKey: 'demo-key' } : firebaseConfig);

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: demoMode ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const functions = getFunctions(app, functionsRegion);

if (demoMode) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}
