/**
 * ──────────────────────────────────────────────────────────────────────────
 *  PASTE YOUR FIREBASE WEB APP CONFIG HERE
 *
 *  Firebase console → Project settings (gear icon) → General → "Your apps"
 *  → select your Web app (</>) → "SDK setup and configuration" → Config.
 *  Copy the values from the `firebaseConfig` object it shows into the
 *  matching fields below. Every value is a plain string.
 *
 *  These values are NOT secrets: they identify your project and are meant to
 *  ship in the browser bundle. Access is controlled by the Firestore security
 *  rules in firestore.rules, not by hiding this config.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyB1BuQ0zrSLUgY3Atap5wom6CUk0PxIPbo',
  authDomain: 'rook-scores-36244.firebaseapp.com',
  projectId: 'rook-scores-36244',
  storageBucket: 'rook-scores-36244.firebasestorage.app',
  messagingSenderId: '396167366301',
  appId: '1:396167366301:web:6d80610dee857fb1553674',
}

/** True once the placeholders above have been replaced. */
export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every((v) => typeof v === 'string' && v.length > 0 && !v.startsWith('PASTE_'))
}
