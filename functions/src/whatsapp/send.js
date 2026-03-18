
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");

const sanitizeKey = (key) => key ? String(key).replace(/[.#$/[\]]/g, "_") : key;

function deepSanitize(obj, isInsideArray = false) {
  if (Array.isArray(obj)) {
    if (isInsideArray) {
      // Firestore doesn't allow nested arrays [[...]]. Stringify it to preserve data.
      return JSON.stringify(obj);
    }
    return obj.map(item => deepSanitize(item, true));
  }
  if (obj !== null && typeof obj === "object") {
    const newObj = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (val !== undefined) newObj[key] = deepSanitize(val, false);
      }
    }
    return newObj;
  }
  return obj;
}

async function verifyAdmin(auth) {
  if (!auth || !auth.uid || !auth.token.email) throw new HttpsError("unauthenticated", "User must be logged in.");
  const emailKey = auth.token.email.replace(/\./g, "_").replace(/@/g, "_");
  const snap = await admin.database().ref(`allowedUsers/${emailKey}`).once("value");
  if (!snap.exists() || (!snap.val().isAdmin && !snap.val().permissions?.whatsapp_sender)) {
    throw new HttpsError("permission-denied", "User does not have required permissions.");
  }
}

async function getWhatsAppConfig() {
  const snapshot = await admin.firestore().collection("modules").doc("whatsapp_sender").collection("config").doc("main").get();
  const config = snapshot.data();
  if (!config || !config.apiKey) throw new HttpsError("failed-precondition", "WhatsApp config missing.");
  return config;
}

exports.syncWhatsAppTemplates = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();
  try {
    const url = `https://www.fast2sms.com/dev/whatsapp/v24.0/${config.wabaId}/message_templates?authorization=${config.apiKey}`;
    const response = await axios.get(url, { headers: {"accept": "application/json"} });
    const templates = response.data?.data?.data || response.data?.data || response.data || [];
    if (templates.length > 0) {
        const fs = admin.firestore();
        const batch = fs.batch();
        const coll = fs.collection("modules").doc("whatsapp_sender").collection("templates");
        for (const t of templates) {
            if (t.name) {
                batch.set(coll.doc(t.name), {
                    ...deepSanitize(t),
                    lastSynced: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        await batch.commit();
    }
    return {success: true, count: templates.length};
  } catch (error) { throw new HttpsError("internal", error.message); }
});

exports.checkWhatsAppWallet = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();
  try {
    const response = await axios.get(`https://www.fast2sms.com/dev/wallet?authorization=${config.apiKey}`);
    return response.data;
  } catch (error) { throw new HttpsError("internal", error.message); }
});

exports.sendWhatsAppMessage = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();
  const {to, text} = request.data;
  try {
    const response = await axios.post(`https://www.fast2sms.com/dev/whatsapp/v24.0/${config.phoneNumberId}/messages`, {
      messaging_product: "whatsapp", to: String(to).replace("+", ""), type: "text", text: {body: text}
    }, { headers: {"Authorization": config.apiKey, "Content-Type": "application/json"} });
    const messageId = response.data.request_id || response.data.messages?.[0]?.id || response.data.id;
    if (messageId) {
        const ts = Date.now(), docId = sanitizeKey(messageId), recipientPhone = sanitizeKey(to), db = admin.database();
        await db.ref(`modules/whatsapp_sender/conversations/${recipientPhone}/messages/${docId}`).set({ messageId, from: "business", to, message: text, type: "text", timestamp: ts, direction: "outbound", status: "processing" });
        await db.ref(`modules/whatsapp_sender/conversations/${recipientPhone}/metadata`).update({ lastMessage: text, timestamp: ts, phoneNumber: to });
    }
    return response.data;
  } catch (error) { throw new HttpsError("internal", error.message); }
});

exports.sendWhatsAppBroadcast = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();
  const {templateName, recipients, variables, broadcastId, contactsCount, excludedNumbers} = request.data;
  const excludedSet = new Set((excludedNumbers || []).map(num => String(num).replace(/[^\d]/g, "")));
  const url = `https://www.fast2sms.com/dev/whatsapp/v24.0/${config.phoneNumberId}/messages`;
  const parameters = (variables || []).map((val) => ({ type: "text", text: String(val) }));
  
  let dispatchedCount = 0, failedCount = 0, excludedCount = 0;
  let processedContactsCount = 0, lastContactName = null;
  const db = admin.database(), fs = admin.firestore();

  const updateProgress = async (isFinal = false, statusOverride = null, currentName = null) => {
    if (!broadcastId) return;
    const update = { 
        dispatchedCount, 
        failedCount, 
        excludedCount,
        processedNumbersCount: dispatchedCount + failedCount + excludedCount, 
        processedContactsCount, 
        currentContactName: currentName || "" 
    };
    if (statusOverride) update.status = statusOverride;
    else if (isFinal) { update.status = "dispatched"; update.currentContactName = ""; }
    await fs.collection("modules").doc("whatsapp_sender").collection("history").doc(broadcastId).update(update);
  };

  for (const recipient of recipients) {
    if (recipient.name !== lastContactName) { processedContactsCount++; lastContactName = recipient.name; }
    const number = String(recipient.phone).replace(/[^\d]/g, ""), name = recipient.name || number;
    await updateProgress(false, null, name);

    if (excludedSet.has(number)) {
        const ts = Date.now();
        await db.ref(`modules/whatsapp_sender/broadcast_logs/excluded_${broadcastId}_${number}`).set({
          broadcastId, recipientId: recipient.phone, name, status: "excluded", timestamp: ts, sentAt: ts, message: "Skipped (Recent)"
        });
        excludedCount++; continue;
    }

    const stopSnap = await fs.collection("modules").doc("whatsapp_sender").collection("history").doc(broadcastId).get();
    if (stopSnap.exists && stopSnap.data().stopRequested) { await updateProgress(true, "stopped"); return {success: true, stopped: true}; }

    const payload = { messaging_product: "whatsapp", to: number, type: "template", template: { name: templateName, language: { code: "en" }, components: [] }};
    if (request.data.headerImageUrl) payload.template.components.push({ type: "header", parameters: [{ type: "image", image: { link: request.data.headerImageUrl } }] });
    if (parameters.length > 0) payload.template.components.push({ type: "body", parameters });

    try {
      const response = await axios.post(url, payload, { headers: {"Authorization": config.apiKey, "Content-Type": "application/json"} });
      const messageId = response.data.request_id || response.data.messages?.[0]?.id || response.data.id;
      if (messageId) {
        const ts = Date.now(), docId = sanitizeKey(messageId), rKey = sanitizeKey(recipient.phone);
        await db.ref(`modules/whatsapp_sender/conversations/${rKey}/messages/${docId}`).set({
          messageId, from: "business", to: recipient.phone, message: `[Broadcast]: ${templateName}`, type: "template", timestamp: ts, direction: "outbound", status: "processing", broadcastId
        });
        await db.ref(`modules/whatsapp_sender/broadcast_logs/${docId}`).set({
          broadcastId, recipientId: recipient.phone, name, status: "processing", timestamp: ts, messageId
        });
        dispatchedCount++;
      } else {
          failedCount++;
      }
    } catch (error) {
      const ts = Date.now();
      await db.ref(`modules/whatsapp_sender/broadcast_logs/fail_${broadcastId}_${number}`).set({
          broadcastId, recipientId: recipient.phone, name, status: "failed", timestamp: ts, error: error.message
      });
      failedCount++;
    }
  }
  await updateProgress(true);
  return {success: true, dispatchedCount};
});
