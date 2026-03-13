// Firebase Configuration and Initialization
// NOTE: The Firebase web config below (apiKey, appId, etc.) is intentionally public.
// Per Firebase's design, the web API key is NOT a secret — it identifies the Firebase
// project to the SDK. All access control is enforced by Firebase Auth and RTDB Security Rules.
// See: https://firebase.google.com/docs/projects/api-keys
const firebaseConfig = {
    apiKey: "AIzaSyCkhTwa6sG7mCx-RW1E2FWhKqB--yDRUmk",
    authDomain: "abhishri-academy.firebaseapp.com",
    databaseURL: "https://abhishri-academy-default-rtdb.firebaseio.com",
    projectId: "abhishri-academy",
    storageBucket: "abhishri-academy.firebasestorage.app",
    messagingSenderId: "932495146860",
    appId: "1:932495146860:web:d29df524eeff27e874fd49",
    measurementId: "G-Z9NS127TPZ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
const functions = firebase.functions();
const storage = firebase.storage();

// Design Configuration Constants
const DOMAIN_GROUPS = {
    'fan': { label: 'Fans', icon: 'wind' },
    'switch': { label: 'Switches', icon: 'power' },
    'light': { label: 'Illumination', icon: 'lightbulb' },
    'sensor': { label: 'Sensors', icon: 'activity' },
    'binary_sensor': { label: 'Sensors', icon: 'circle-dot' },
    'other': { label: 'Other Systems', icon: 'box' }
};

const iconMap = {
    light: 'lightbulb',
    fan: 'fan',
    switch: 'power',
    sensor: 'activity',
    climate: 'thermometer',
    binary_sensor: 'circle-dot'
};

// Mapping for 6-speed fans to HA percentages
const SPEED_LEVELS = [0, 16, 33, 50, 66, 83, 100];
