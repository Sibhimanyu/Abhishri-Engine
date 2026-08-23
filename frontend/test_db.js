import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';

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
const auth = getAuth(app);
const firestore = getFirestore(app);

async function run() {
  try {
    const seedEmail = process.env.SEED_ADMIN_EMAIL;
    const seedPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!seedEmail || !seedPassword) {
      throw new Error(
        "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables before running this script. " +
        "Never hardcode credentials in this file — it is committed to git."
      );
    }
    const userCredential = await signInWithEmailAndPassword(auth, seedEmail, seedPassword);
    console.log("Logged in as:", userCredential.user.uid);
    
    // First let's just query everything without rule restrictions if possible
    // Wait, rules apply to client SDK! 
    
    const uidRef = doc(firestore, 'allowed_users', userCredential.user.uid);
    try {
        const uidSnap = await getDoc(uidRef);
        console.log("UID Doc exists:", uidSnap.exists());
    } catch(e) {
        console.error("UID Doc Error:", e.code);
    }
    
    const emailRef = doc(firestore, 'allowed_users', "info@abhishriacademy.in");
    try {
        const emailSnap = await getDoc(emailRef);
        console.log("Email Doc exists:", emailSnap.exists());
        if (emailSnap.exists()) {
           console.log("Email doc data:", emailSnap.data());
        }
    } catch(e) {
        console.error("Email Doc Error:", e.code);
    }
    
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
run();
