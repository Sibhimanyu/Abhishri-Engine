import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

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
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const rtdb = getDatabase(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Auto-connect to emulators if running locally (assuming standard ports)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    // connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
}
