const admin = require("firebase-admin");
admin.initializeApp({ projectId: "abhishri-academy" });
const db = admin.firestore();
db.collection("configs").doc("whatsapp_main").get().then(snap => {
  console.log(snap.exists ? snap.data() : "No config");
  process.exit(0);
});
