import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, indexedDBLocalPersistence, onAuthStateChanged, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { isNative } from './utils/native';

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

// Auto-connect to emulators if running locally (assuming standard ports)
// Signing out of Firebase must also drop the native Google session, or the
// next "Continue with Google" silently reuses the previous account.
if (isNative) {
    onAuthStateChanged(auth, (user) => {
        if (user) return;
        import('@capacitor-firebase/authentication')
            .then(({ FirebaseAuthentication }) => FirebaseAuthentication.signOut())
            .catch(() => {});
    });
}

// The iOS app is also served from "localhost", so it must never hit the emulators.
if (!isNative && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    // connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    // connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
}
