import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
  const snap = await getDocs(collection(firestore, 'staff'));
  console.log("Staff collection docs:");
  snap.forEach(doc => {
      console.log(`ID: ${doc.id}, Email: ${doc.data().email}, Name: ${doc.data().name}`);
  });
  
  const snap2 = await getDocs(collection(firestore, 'allowed_users'));
  console.log("\nallowed_users collection docs:");
  snap2.forEach(doc => {
      console.log(`ID: ${doc.id}, Email: ${doc.data().email}, Role: ${doc.data().role}`);
  });

  process.exit(0);
}
run();
