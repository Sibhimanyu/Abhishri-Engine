import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, indexedDBLocalPersistence, onAuthStateChanged, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { isNative } from './utils/native';
import { installNativeBridge } from './utils/nativeBridge';

const firebaseConfig = {
    apiKey: "AIzaSyCkhTwa6sG7mCx-RW1E2FWhKqB--yDRUmk",
    authDomain: "abhishri-academy.firebaseapp.com",
    databaseURL: "https://abhishri-academy-default-rtdb.firebaseio.com",
    projectId: "abhishri-academy",
    storageBucket: "abhishri-academy.firebasestorage.app",
    messagingSenderId: "932495146860",
    appId: "1:932495146860:web:d29df524eeff27e874fd49"
};

const app = initializeApp(firebaseConfig);
// Inside the iOS app, skip getAuth()'s popup/redirect resolver: popups can't
// open there, and its authDomain iframe stalls when the app runs from the
// bundled copy (capacitor://). Native sign-in hands the JS SDK a credential
// instead (see Login.jsx).
export const auth = isNative
    ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
    : getAuth(app);
// Persistent IndexedDB cache: listeners (dashboard/reports pull whole collections)
// resume from local data and only sync the delta, instead of re-downloading the
// full transaction history on every page load.
export const firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const rtdb = getDatabase(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Signing out of Firebase must also drop the native Google session, or the
// next "Continue with Google" silently reuses the previous account. In the native
// iOS app, signing out here also ends the native screens' session (endNativeSession),
// so it must only follow a real sign-out (signed in -> signed out), never the null
// every cold start reports before the native app has handed its session over (see
// installNativeBridge). The native app's plugin ignores signOut calls that don't ask
// for endNativeSession, which is what keeps older deploys from signing it out.
if (isNative) {
    let hadUser = false;
    onAuthStateChanged(auth, (user) => {
        if (user) { hadUser = true; return; }
        if (!hadUser) return;
        hadUser = false;
        import('@capacitor-firebase/authentication')
            .then(({ FirebaseAuthentication }) => FirebaseAuthentication.signOut({ endNativeSession: true }))
            .catch(() => {});
    });
    installNativeBridge(auth);
}

// The iOS app is also served from "localhost", so it must never hit the emulators.
if (!isNative && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    // connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    // connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
}
