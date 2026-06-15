const admin = require("firebase-admin");
admin.initializeApp({ projectId: "abhishri-academy" });
const db = admin.firestore();
db.collection("configs").doc("whatsapp_main").set({
  apiKey: "***REDACTED-ROTATE-THIS-API-KEY***",
  phoneNumber: "***REDACTED-ROTATE-THIS-CREDENTIAL***",
  phoneNumberId: "939830915889764",
  wabaId: "1880764306141101"
}, { merge: true }).then(() => {
  console.log("Config saved successfully.");
  process.exit(0);
}).catch(console.error);
