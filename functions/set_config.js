const admin = require("firebase-admin");
admin.initializeApp({ projectId: "abhishri-academy" });
const db = admin.firestore();

const apiKey = process.env.FAST2SMS_API_KEY;
const phoneNumber = process.env.WHATSAPP_PHONE_NUMBER;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const wabaId = process.env.WHATSAPP_WABA_ID;
if (!apiKey || !phoneNumber || !phoneNumberId || !wabaId) {
  throw new Error(
    "Set FAST2SMS_API_KEY, WHATSAPP_PHONE_NUMBER, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_WABA_ID " +
    "environment variables before running this script. Never hardcode secrets in this file — it is committed to git."
  );
}

db.collection("configs").doc("whatsapp_main").set({
  apiKey,
  phoneNumber,
  phoneNumberId,
  wabaId
}, { merge: true }).then(() => {
  console.log("Config saved successfully.");
  process.exit(0);
}).catch(console.error);
