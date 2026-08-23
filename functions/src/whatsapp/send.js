
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
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
        // Sanitize the key itself for Firestore (no . # $ / [ ])
        const cleanKey = key.replace(/[.#$/[\]]/g, "_");
        const val = obj[key];
        if (val !== undefined) newObj[cleanKey] = deepSanitize(val, false);
      }
    }
    return newObj;
  }
  return obj;
}

async function getAllowedUser(auth) {
  if (!auth?.uid) return null;
  const db = admin.firestore();
  const uidDoc = await db.collection("allowed_users").doc(auth.uid).get();
  if (uidDoc.exists) return uidDoc.data();
  const email = auth.token?.email?.toLowerCase();
  if (email) {
    const emailDoc = await db.collection("allowed_users").doc(email).get();
    if (emailDoc.exists) return emailDoc.data();
  }
  return null;
}

function hasWhatsAppAccess(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  const wa = user.permissions?.whatsapp_sender;
  if (wa?.access || wa?.manage || wa?.broadcast) return true;
  return false;
}

async function verifyAdmin(auth) {
  if (!auth || !auth.uid || !auth.token.email) throw new HttpsError("unauthenticated", "User must be logged in.");
  const user = await getAllowedUser(auth);
  if (!hasWhatsAppAccess(user)) {
    const role = user?.role || "staff";
    const roleDoc = await admin.firestore().collection("permission_groups").doc(role).get();
    const roleWa = roleDoc.data()?.permissions?.whatsapp_sender;
    if (!roleWa?.access && !roleWa?.manage && !roleWa?.broadcast) {
      throw new HttpsError("permission-denied", "User does not have required permissions.");
    }
  }
}

async function getWhatsAppConfig() {
  const snapshot = await admin.firestore().collection("configs").doc("whatsapp_main").get();
  const config = snapshot.data();
  if (!config.apiKey || !config.wabaId || !config.phoneNumberId) {
    throw new HttpsError("failed-precondition", "WhatsApp config is incomplete");
  }
  
  // Sanitize to prevent accidental whitespace or quotes from copy-pasting
  config.apiKey = String(config.apiKey).trim().replace(/^["']|["']$/g, '');
  config.wabaId = String(config.wabaId).trim().replace(/^["']|["']$/g, '');
  config.phoneNumberId = String(config.phoneNumberId).trim().replace(/^["']|["']$/g, '');
  
  return config;
}

exports.syncWhatsAppTemplates = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();
  try {
    // New dlt_manager endpoint for reliable message_id
    const url = `https://www.fast2sms.com/dev/dlt_manager/whatsapp?authorization=${encodeURIComponent(config.apiKey)}&type=template`;
    const response = await axios.get(url, { headers: { authorization: config.apiKey } });
    if (!response.data || (!response.data.return && !response.data.success)) {
      throw new Error(response.data?.message || "Failed to fetch templates from Fast2SMS");
    }

    const fs = admin.firestore();
    const batch = fs.batch();
    const coll = fs.collection("configs").doc("whatsapp_main").collection("templates");
    let count = 0;

    for (const item of response.data.data) {
      if (item.templates && Array.isArray(item.templates)) {
        for (const t of item.templates) {
          const name = t.template_name || t.name;
          if (name) {
            batch.set(coll.doc(name), {
              ...deepSanitize(t),
              lastSynced: admin.firestore.FieldValue.serverTimestamp()
            });
            count++;
          }
        }
      }
    }

    if (count > 0) await batch.commit();
    return { success: true, count };
  } catch (error) {
    logger.error("Sync Error:", error.response ? error.response.data : error.message);
    const msg = error.response?.data?.message || error.message;
    throw new HttpsError("unknown", msg);
  }
});

exports.checkWhatsAppWallet = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();
  try {
    const response = await axios.post('https://www.fast2sms.com/dev/wallet', null, {
      headers: { 'authorization': config.apiKey }
    });
    return response.data;
  } catch (error) { 
    throw new HttpsError("unknown", error.response?.data?.message || error.message); 
  }
});

exports.sendWhatsAppMessage = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();
  const { to, text } = request.data;
  try {
    // Single message still uses v24.0 API
    const response = await axios.post(`https://www.fast2sms.com/dev/whatsapp/v24.0/${config.phoneNumberId}/messages`, {
      messaging_product: "whatsapp", to: String(to).replace("+", ""), type: "text", text: { body: text }
    }, { headers: { "Authorization": config.apiKey, "Content-Type": "application/json" } });
    const messageId = response.data.request_id || response.data.messages?.[0]?.id || response.data.id;
    if (messageId) {
      const ts = Date.now(), docId = sanitizeKey(messageId), recipientPhone = String(to).replace(/[^\d]/g, ""), db = admin.database();
      await db.ref(`whatsapp_conversations/${recipientPhone}/messages/${docId}`).set({ messageId, from: "business", to, message: text, type: "text", timestamp: ts, direction: "outbound", status: "processing" });
      await db.ref(`whatsapp_conversations/${recipientPhone}/metadata`).update({ lastMessage: text, timestamp: ts, phoneNumber: to });
    }
    return response.data;
  } catch (error) { throw new HttpsError("internal", error.message); }
});

exports.sendWhatsAppBroadcast = onCall({ timeoutSeconds: 540 }, async (request) => {
  try {
    await verifyAdmin(request.auth);
    const config = await getWhatsAppConfig();

    // Debug log to see exactly what the frontend is sending
    logger.info("sendWhatsAppBroadcast Request Data:", request.data);

    const { templateName, recipients, variables, broadcastId, contactsCount, excludedNumbers, headerImageUrl } = request.data;
    const excludedSet = new Set((excludedNumbers || []).map(num => String(num).replace(/[^\d]/g, "")));

    const db = admin.database(), fs = admin.firestore();

    // Guard against dispatching the same broadcast twice — a client retry on this callable
    // (it can run up to 540s) or a double-click before the confirm button disables would
    // otherwise resend the entire recipient list, doubling the WhatsApp API cost and spamming
    // every real recipient twice. This claim is server-side because client-side button
    // disabling alone can be bypassed (direct SDK call, race between click and re-render).
    if (broadcastId) {
      const historyRef = fs.collection("whatsapp_history").doc(broadcastId);
      const claimed = await fs.runTransaction(async (transaction) => {
        const snap = await transaction.get(historyRef);
        if (snap.exists && snap.data().dispatchStarted) return false;
        transaction.set(historyRef, {
          dispatchStarted: true,
          dispatchStartedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
      });
      if (!claimed) {
        throw new HttpsError("already-exists", "This broadcast has already been dispatched or is currently dispatching.");
      }
    }

    // 1. Fetch Template Data
    let tData = {};
    if (templateName) {
      // Try exact document ID match first
      const templateSnap = await fs.collection("configs").doc("whatsapp_main").collection("templates").doc(templateName).get();
      if (templateSnap.exists) {
        tData = templateSnap.data();
      } else {
        // Fallback: search for a template with this name in its 'name' or 'template_name' field
        const querySnap = await fs.collection("configs").doc("whatsapp_main").collection("templates")
          .where("template_name", "==", templateName).limit(1).get();
        if (!querySnap.empty) {
          tData = querySnap.docs[0].data();
        } else {
          const querySnap2 = await fs.collection("configs").doc("whatsapp_main").collection("templates")
            .where("name", "==", templateName).limit(1).get();
          if (!querySnap2.empty) tData = querySnap2.docs[0].data();
        }
      }
    }

  // 2. Extract Numeric ID (MUST be numeric for the GET API)
  const templateId = tData.message_id || tData.numericId || tData.id || tData.template_id;

  if (!templateId || isNaN(templateId) || String(templateId).length > 15) {
    logger.error(`Template ID for "${templateName}" is invalid or missing: ${templateId}. Data:`, tData);
    throw new HttpsError("failed-precondition", `Numeric Template ID not found for "${templateName || "Unknown"}". Please click "Sync Templates" in the Admin panel.`);
  }

  let dispatchedCount = 0, failedCount = 0, excludedCount = 0;
  let processedContactsCount = 0, excludedContactsCount = 0, lastContactName = null;
  let initialWalletBalance = null;
  let finalWalletBalance = null;

  try {
    const wRes = await axios.post('https://www.fast2sms.com/dev/wallet', null, { headers: { 'authorization': config.apiKey } });
    if (wRes.data && wRes.data.wallet !== undefined) initialWalletBalance = parseFloat(wRes.data.wallet);
  } catch (e) { logger.warn("Failed to fetch initial wallet balance:", e.message); }

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
    if (initialWalletBalance !== null) update.initialWalletBalance = initialWalletBalance;
    if (finalWalletBalance !== null) update.finalWalletBalance = finalWalletBalance;
    if (initialWalletBalance !== null && finalWalletBalance !== null) update.actualCost = initialWalletBalance - finalWalletBalance;

    if (statusOverride) update.status = statusOverride;
    else if (isFinal) { update.status = "dispatched"; update.currentContactName = ""; }
    await fs.collection("whatsapp_history").doc(broadcastId).update(update);
  };

  // 1. Instant Initialization
  const initialLogs = {};
  const activeRecipients = [];
  const ts = Date.now();
  const contactExclusionStatus = {};

  for (const recipient of recipients) {
    const rawPhone = String(recipient.phone).replace(/[^\d]/g, "");
    const last10 = rawPhone.slice(-10);
    const logId = rawPhone; // Using rawPhone as the ID within the broadcast group
    const name = recipient.name || rawPhone;

    if (!contactExclusionStatus[name]) contactExclusionStatus[name] = { total: 0, excluded: 0 };
    contactExclusionStatus[name].total++;

    let isExcluded = excludedSet.has(rawPhone);
    if (!isExcluded && last10.length === 10) {
      for (const ex of excludedSet) {
        if (ex.endsWith(last10)) { isExcluded = true; break; }
      }
    }

    if (isExcluded) {
      initialLogs[`${broadcastId}/${logId}`] = {
        broadcastId: broadcastId,
        recipientId: recipient.phone,
        name: name,
        status: "excluded",
        timestamp: ts,
        sentAt: ts,
        message: "Skipped (Recent)"
      };
      excludedCount++;
      contactExclusionStatus[name].excluded++;
    } else {
      initialLogs[`${broadcastId}/${logId}`] = {
        broadcastId: broadcastId,
        recipientId: recipient.phone,
        name: name,
        status: "queued",
        timestamp: ts
      };
      activeRecipients.push(recipient);
    }
  }

  for (const name in contactExclusionStatus) {
    if (contactExclusionStatus[name].excluded === contactExclusionStatus[name].total) {
      excludedContactsCount++;
    }
  }

  if (Object.keys(initialLogs).length > 0) {
    await db.ref(`whatsapp_broadcast_logs`).update(initialLogs);
    await updateProgress();
  }

  // 2. Main Dispatch Loop (BATCHED)
  const BATCH_SIZE = 200;
  const variablesValues = (variables || []).join("|");

  for (let i = 0; i < activeRecipients.length; i += BATCH_SIZE) {
    const chunk = activeRecipients.slice(i, i + BATCH_SIZE);

    const stopSnap = await fs.collection("whatsapp_history").doc(broadcastId).get();
    if (stopSnap.exists && stopSnap.data().stopRequested) { await updateProgress(true, "stopped"); return { success: true, stopped: true }; }

    const firstInChunk = chunk[0];
    await updateProgress(false, null, firstInChunk.name || firstInChunk.phone);

    const numbersList = chunk.map(r => {
      let num = String(r.phone).replace(/[^\d]/g, "");
      return num.slice(-10);
    }).join(",");

    // CONSTRUCTING FINAL URL: Precise alignment with working curl
    const baseUrl = "https://www.fast2sms.com/dev/whatsapp";
    const auth = encodeURIComponent(config.apiKey);
    const mId = encodeURIComponent(templateId);
    const pId = encodeURIComponent(config.phoneNumberId);
    const nums = encodeURIComponent(numbersList);

    let apiUrl = `${baseUrl}?authorization=${auth}&message_id=${mId}&phone_number_id=${pId}&numbers=${nums}`;

    if (variablesValues) {
      apiUrl += `&variables_values=${encodeURIComponent(variablesValues)}`;
    }
    if (headerImageUrl) {
      apiUrl += `&media_url=${encodeURIComponent(headerImageUrl)}`;
    }

    // DEBUG LOG: the URL is useful for diagnosing dispatch issues, but the authorization
    // param IS the Fast2SMS API key — in cleartext it ends up in Cloud Logging and in the
    // whatsapp_history/debugBatches documents, and anyone who reads it can drain the SMS
    // wallet. Always redact it.
    const logUrl = apiUrl.replace(auth, "***REDACTED***");
    logger.info(`WhatsApp Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${logUrl}`);

    // Save batch info for debugging
    if (broadcastId) {
      const batchInfo = {
        batchIndex: Math.floor(i / BATCH_SIZE) + 1,
        recipientRange: `${chunk[0].phone} ... ${chunk[chunk.length - 1].phone}`,
        url: logUrl,
        timestamp: Date.now()
      };
      await fs.collection("whatsapp_history").doc(broadcastId).update({
        debugBatches: admin.firestore.FieldValue.arrayUnion(batchInfo)
      }).catch(e => logger.error("Failed to save debugBatch:", e));
    }

    try {
      const processingUpdates = {};
      chunk.forEach(r => {
        const num = String(r.phone).replace(/[^\d]/g, "");
        processingUpdates[`${broadcastId}/${num}/status`] = "processing";
      });
      await db.ref(`whatsapp_broadcast_logs`).update(processingUpdates);

      const response = await axios.get(apiUrl, { headers: { "accept": "application/json" } });
      const messageId = response.data.request_id || response.data.id || "batch_" + Date.now();

      // Store messageId -> broadcastId mapping for webhook lookup
      if (messageId && broadcastId) {
        await db.ref(`whatsapp_batch_map/${messageId}`).set(broadcastId);
      }

      const successUpdates = {};
      const conversationUpdates = {};
      const ts = Date.now();
      
      chunk.forEach((r, idx) => {
        if (r.name !== lastContactName) { processedContactsCount++; lastContactName = r.name; }
        const num = String(r.phone).replace(/[^\d]/g, "");
        const logPath = `${broadcastId}/${num}`;
        successUpdates[`${logPath}/status`] = "sent";
        successUpdates[`${logPath}/sentAt`] = ts;
        successUpdates[`${logPath}/messageId`] = messageId;
        
        // Populate conversation history
        const docId = sanitizeKey(messageId) + "_" + idx;
        const msgText = `📢 Broadcast: ${templateName}`;
        
        conversationUpdates[`whatsapp_conversations/${num}/messages/${docId}`] = { 
            messageId, 
            from: "business", 
            to: r.phone, 
            message: msgText, 
            type: "template", 
            timestamp: ts, 
            direction: "outbound", 
            status: "sent",
            broadcastId: broadcastId
        };
        conversationUpdates[`whatsapp_conversations/${num}/metadata/lastMessage`] = msgText;
        conversationUpdates[`whatsapp_conversations/${num}/metadata/timestamp`] = ts;
        conversationUpdates[`whatsapp_conversations/${num}/metadata/phoneNumber`] = r.phone;
        conversationUpdates[`whatsapp_conversations/${num}/metadata/displayName`] = r.name;
      });
      await db.ref(`/`).update(conversationUpdates);
      await db.ref(`whatsapp_broadcast_logs`).update(successUpdates);
      dispatchedCount += chunk.length;
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message;
      logger.error(`Broadcast Batch Error: ${errMsg}`, { response: error.response?.data });
      const failureUpdates = {};
      chunk.forEach(r => {
        if (r.name !== lastContactName) { processedContactsCount++; lastContactName = r.name; }
        const num = String(r.phone).replace(/[^\d]/g, "");
        const logPath = `${broadcastId}/${num}`;
        failureUpdates[`${logPath}/status`] = "failed";
        failureUpdates[`${logPath}/timestamp`] = Date.now();
        failureUpdates[`${logPath}/error`] = errMsg;
      });
      await db.ref(`whatsapp_broadcast_logs`).update(failureUpdates);
      failedCount += chunk.length;
    }
    await updateProgress();
  }

  // Fetch final wallet balance with a delay for async billing
  try {
    await new Promise(r => setTimeout(r, 4000));
    const wRes2 = await axios.post('https://www.fast2sms.com/dev/wallet', null, { headers: { 'authorization': config.apiKey } });
    if (wRes2.data && wRes2.data.wallet !== undefined) finalWalletBalance = parseFloat(wRes2.data.wallet);
  } catch (e) { logger.warn("Failed to fetch final wallet balance:", e.message); }

  await updateProgress(true);
  return { success: true, dispatchedCount };
  } catch (error) {
    logger.error("Unhandled error in sendWhatsAppBroadcast:", error);
    throw new HttpsError("internal", error.message, error.stack);
  }
});