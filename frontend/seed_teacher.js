import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

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
const firestore = getFirestore(app);

async function run() {
  try {
    const emailKey = "info@abhishriacademy.in";
    
    // Create Login Access
    await setDoc(doc(firestore, 'allowed_users', emailKey), {
      email: emailKey,
      displayName: "Sathya (Teacher)",
      role: 'teacher',
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Create Staff Profile
    await setDoc(doc(firestore, 'staff', emailKey), {
      email: emailKey,
      name: "Sathya (Teacher)",
      designation: 'Teacher',
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log("Successfully seeded allowed_users and staff for", emailKey);
  } catch (err) {
    console.error("Error seeding:", err);
  }
  process.exit(0);
}
run();
