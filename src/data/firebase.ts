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
import { isPhone } from '../app/layout';
import { demoMode, firebaseConfig, functionsRegion } from '../config';

/**
 * Production uses the real project. The wall has a persistent IndexedDB
 * cache, so it keeps working through Wi-Fi drops and reboots; a phone keeps
 * the household's data in memory only, so a phone removed or unpaired
 * (lost, or offline at the time) has none of it on disk. Demo mode talks to
 * the local emulators (project demo-manwar) with a memory cache, so a
 * restarted emulator never shows stale cached data.
 */
const app = initializeApp(demoMode ? { ...firebaseConfig, projectId: 'demo-manwar', apiKey: 'demo-key' } : firebaseConfig);

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: demoMode || isPhone ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const functions = getFunctions(app, functionsRegion);

if (demoMode) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}
