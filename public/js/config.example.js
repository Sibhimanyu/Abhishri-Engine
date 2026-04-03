// Firebase Configuration and Initialization - EXAMPLE FILE
// Copy this to config.js and fill in your real Firebase values.
// Per Firebase's design, the web API key identifies the project to the SDK.
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const firestore = firebase.firestore();
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
