
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
  const email = auth.token.email.toLowerCase();
  const userDoc = await admin.firestore().collection("allowedUsers").doc(email).get();
  if (!userDoc.exists || (!userDoc.data().isAdmin && !userDoc.data().permissions?.whatsapp_sender)) {
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

exports.sendWhatsAppBroadcast = onCall({ timeoutSeconds: 540 }, async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();
  const {templateName, recipients, variables, broadcastId, contactsCount, excludedNumbers} = request.data;
  const excludedSet = new Set((excludedNumbers || []).map(num => String(num).replace(/[^\d]/g, "")));
  const url = `https://www.fast2sms.com/dev/whatsapp/v24.0/${config.phoneNumberId}/messages`;
  const parameters = (variables || []).map((val) => ({ type: "text", text: String(val) }));
  
  let dispatchedCount = 0, failedCount = 0, excludedCount = 0;
  let processedContactsCount = 0, excludedContactsCount = 0, lastContactName = null;
  const db = admin.database(), fs = admin.firestore();

  const updateProgress = async (isFinal = false, statusOverride = null, currentName = null) => {
    if (!broadcastId) return;
    const update = { 
        dispatchedCount, 
        failedCount, 
        excludedCount,
        processedNumbersCount: dispatchedCount + failedCount + excludedCount, 
        processedContactsCount: processedContactsCount + excludedContactsCount, 
        currentContactName: currentName || "" 
    };
    if (statusOverride) update.status = statusOverride;
    else if (isFinal) { update.status = "dispatched"; update.currentContactName = ""; }
    await fs.collection("modules").doc("whatsapp_sender").collection("history").doc(broadcastId).update(update);
  };

  // 1. Instant Initialization: Bulk log EVERY recipient as 'queued' or 'excluded'
  // This ensures the delivery report total is accurate from the very first second.
  const initialLogs = {};
  const activeRecipients = [];
  const ts = Date.now();

  // Track contacts that are entirely excluded
  const contactExclusionStatus = {}; // { name: { total: 0, excluded: 0 } }

  for (const recipient of recipients) {
    const rawPhone = String(recipient.phone).replace(/[^\d]/g, "");
    const last10 = rawPhone.slice(-10);
    const logId = `log_${broadcastId}_${rawPhone}`;
    const name = recipient.name || rawPhone;

    if (!contactExclusionStatus[name]) contactExclusionStatus[name] = { total: 0, excluded: 0 };
    contactExclusionStatus[name].total++;
    
    // Check if this number should be excluded (match full or last 10)
    let isExcluded = excludedSet.has(rawPhone);
    if (!isExcluded && last10.length === 10) {
        // Fallback: check if any excluded number ends with these same 10 digits
        for (const ex of excludedSet) {
            if (ex.endsWith(last10)) { isExcluded = true; break; }
        }
    }

    if (isExcluded) {
        initialLogs[logId] = {
            broadcastId, recipientId: recipient.phone, name: name, 
            status: "excluded", timestamp: ts, sentAt: ts, message: "Skipped (Recent)"
        };
        excludedCount++;
        contactExclusionStatus[name].excluded++;
    } else {
        initialLogs[logId] = {
            broadcastId, recipientId: recipient.phone, name: name, 
            status: "queued", timestamp: ts
        };
        activeRecipients.push(recipient);
    }
  }

  // Calculate how many contacts are ENTIRELY excluded
  for (const name in contactExclusionStatus) {
    if (contactExclusionStatus[name].excluded === contactExclusionStatus[name].total) {
        excludedContactsCount++;
    }
  }

  // High-speed batch write of ALL initial states
  if (Object.keys(initialLogs).length > 0) {
      await db.ref(`modules/whatsapp_sender/broadcast_logs`).update(initialLogs);
      await updateProgress(); 
  }

  // 2. Main Dispatch Loop (Only for Active Recipients)
  for (const recipient of activeRecipients) {
    if (recipient.name !== lastContactName) { processedContactsCount++; lastContactName = recipient.name; }
    const number = String(recipient.phone).replace(/[^\d]/g, ""), name = recipient.name || number;
    const currentLogId = `log_${broadcastId}_${number}`;
    
    await updateProgress(false, null, name);

    const stopSnap = await fs.collection("modules").doc("whatsapp_sender").collection("history").doc(broadcastId).get();
    if (stopSnap.exists && stopSnap.data().stopRequested) { await updateProgress(true, "stopped"); return {success: true, stopped: true}; }

    const payload = { messaging_product: "whatsapp", to: number, type: "template", template: { name: templateName, language: { code: "en" }, components: [] }};
    if (request.data.headerImageUrl) payload.template.components.push({ type: "header", parameters: [{ type: "image", image: { link: request.data.headerImageUrl } }] });
    if (parameters.length > 0) payload.template.components.push({ type: "body", parameters });

    try {
      // Mark as processing just before the API call
      await db.ref(`modules/whatsapp_sender/broadcast_logs/${currentLogId}`).update({ status: "processing" });

      const response = await axios.post(url, payload, { headers: {"Authorization": config.apiKey, "Content-Type": "application/json"} });
      const messageId = response.data.request_id || response.data.messages?.[0]?.id || response.data.id;
      if (messageId) {
        const ts2 = Date.now();
        await db.ref(`modules/whatsapp_sender/broadcast_logs/${currentLogId}`).update({
          status: "sent", sentAt: ts2, messageId
        });
        dispatchedCount++;
      } else {
        const ts2 = Date.now();
        await db.ref(`modules/whatsapp_sender/broadcast_logs/${currentLogId}`).update({
          status: "failed", timestamp: ts2, error: response.data?.message || "API returned success but no message ID"
        });
        failedCount++;
      }
    } catch (error) {
      const ts2 = Date.now();
      await db.ref(`modules/whatsapp_sender/broadcast_logs/${currentLogId}`).update({
          status: "failed", timestamp: ts2, error: error.message
      });
      failedCount++;
    }
  }
  await updateProgress(true);
  return {success: true, dispatchedCount};
});
