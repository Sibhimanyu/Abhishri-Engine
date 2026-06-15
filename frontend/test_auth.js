import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  projectId: "abhishri-academy",
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyB...", // I'll get this from .env if needed
};
// Wait, I should read the config from src/firebase.js
