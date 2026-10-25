import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth, type User } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { firebaseConfig } from './config'

let app: FirebaseApp | undefined
let db: Firestore | undefined
let auth: Auth | undefined

export function getFirebase(): { app: FirebaseApp; db: Firestore; auth: Auth } {
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig)
    // Offline cache so a phone that drops Wi-Fi keeps showing the game and
    // syncs its writes when it comes back.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
    auth = getAuth(app)
  }
  return { app, db: db!, auth: auth! }
}

/** Resolves with an anonymous user, signing in if needed. */
export function ensureAnonymousUser(): Promise<User> {
  const { auth } = getFirebase()
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          stop()
          resolve(user)
        } else {
          signInAnonymously(auth).catch((err) => {
            stop()
            reject(err)
          })
        }
      },
      (err) => {
        stop()
        reject(err)
      },
    )
  })
}
