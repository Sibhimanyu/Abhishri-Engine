/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const admin = require("firebase-admin");

// Global Config
setGlobalOptions({maxInstances: 10});

// Initialize Firebase Admin globally
// Note: Submodules might also check/init, but doing it here ensures it's ready.
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// --- WhatsApp Module ---
const whatsappSend = require("./src/whatsapp/send");
const whatsappWebhook = require("./src/whatsapp/webhook");

exports.sendWhatsAppMessage = whatsappSend.sendWhatsAppMessage;
exports.sendWhatsAppBroadcast = whatsappSend.sendWhatsAppBroadcast;
exports.syncWhatsAppTemplates = whatsappSend.syncWhatsAppTemplates;
exports.checkWhatsAppWallet = whatsappSend.checkWhatsAppWallet;
exports.whatsappWebhook = whatsappWebhook.whatsappWebhook;

