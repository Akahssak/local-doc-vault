import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Firebase web config. These values are public identifiers (not secrets) — they
// are meant to ship in the client bundle. Lock the project down with Firebase
// Security Rules and API-key restrictions in the console, not by hiding these.
const firebaseConfig = {
  apiKey: 'AIzaSyCYnEB6oRme0fblYRLkIOgQX06M53ZrTq4',
  authDomain: 'filterme-cd1ec.firebaseapp.com',
  projectId: 'filterme-cd1ec',
  storageBucket: 'filterme-cd1ec.firebasestorage.app',
  messagingSenderId: '424000045531',
  appId: '1:424000045531:web:847a2ca350d1844c5927fe',
  measurementId: 'G-V0597V2WEC',
};

export const app = initializeApp(firebaseConfig);

/**
 * Initialise Analytics only when the runtime actually supports it. This is an
 * offline-first PWA, so `isSupported()` cleanly no-ops when the browser blocks
 * measurement (private mode, no cookies, offline, unsupported context) instead
 * of throwing at startup.
 */
export async function initAnalytics(): Promise<void> {
  try {
    if (await isSupported()) getAnalytics(app);
  } catch {
    /* Analytics is best-effort; never let it break the app. */
  }
}
