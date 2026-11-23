
const { onRequest } = require("firebase-functions/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { extractReaction, storeReaction, findMessage } = require("./reactions");



const sanitizeKey = (key) => key ? String(key).replace(/[.#$/[\]]/g, "_") : key;

const STATUS_RANK = { queued: 1, processing: 2, sent: 3, delivered: 4, read: 5, failed: 6, error: 6 };

/** Whether a receipt should change a message's status: only forward moves; failed always applies. */
function shouldApplyStatus(current, next) {
  const n = String(next || "").toLowerCase();
  if (n === "failed" || n === "error") return true;
  return (STATUS_RANK[n] || 0) > (STATUS_RANK[String(current || "").toLowerCase()] || 0);
}

/** The error text of a failed receipt (Meta `errors[]` or Fast2SMS `status_description`). */
function receiptError(report, status) {
  if (status !== "failed" && status !== "error") return null;
  let errMsg = report.status_description || null;
  if (Array.isArray(report.errors) && report.errors.length > 0) {
    const e = report.errors[0];
    errMsg = (e.error_data && e.error_data.details) || e.message || e.title || errMsg || "Unknown error";
  }
  return errMsg;
}

/**
 * Apply a receipt to the conversation message it belongs to (live-chat replies, which the
 * broadcast lookups never see). `applied` holds ref paths already updated by the broadcast
 * branch so one receipt isn't recorded twice.
 */
async function updateConversationMessage(db, { wamid, recipient, status, timestamp, errMsg }, applied = new Set()) {
  const conversationId = String(recipient || "").replace(/[^\d]/g, "");
  if (!wamid || !conversationId) return false;
  const snap = await findMessage(db.ref(`whatsapp_conversations/${conversationId}/messages`), wamid);
  if (!snap) return false;
  const path = snap.ref.toString();
  if (applied.has(path)) return false;
  applied.add(path);

  const entry = { status, timestamp, serverTime: Date.now() };
  if (errMsg) entry.error = errMsg;
  const writes = [snap.ref.child("statusHistory").push(entry)];
  if (shouldApplyStatus(snap.val().status, status)) {
    const upd = { status, error: errMsg || null };
    if (status === "sent") upd.sentAt = timestamp;
    if (status === "delivered") upd.deliveredAt = timestamp;
    if (status === "read") upd.readAt = timestamp;
    writes.push(snap.ref.update(upd));
  }
  await Promise.all(writes);
  return true;
}

/**
 * Common Logic for processing Incoming Messages
 */
async function processIncoming(db, report) {
  const messageId = report.message_id || report.id;
  const from = report.from;
  // A copy of the business's own outgoing message is not an incoming one. Its record already
  // exists (send.js files it); never file it as a customer message.
  if (report.from_me === true || report.direction === "outbound") return;
  // A reaction is stored on the message it reacts to: no bubble, no unread bump, no notification.
  if ((report.message_type || report.type) === "reaction") {
    const reaction = extractReaction({ ...report, type: "reaction", from: report.from });
    if (reaction && !(await storeReaction(db, reaction))) console.warn("Reaction for an unknown message", reaction.targetId);
    return;
  }
  const type = report.message_type || report.type || "text";
  const timestamp = (report.timestamp > 10000000000 ? report.timestamp : report.timestamp * 1000);
  const conversationId = String(from).replace(/[^\d]/g, "");

  let textBody = "";
  let previewText = "";
  let imageData = null;

  if (type === "image" || type === "audio" || report.media_url || report.image || report.audio) {
    if (type === "image") {
      const img = report.image || {};
      textBody = report.caption || img.caption || "";
      previewText = textBody ? `📷 ${textBody}` : `📷 Photo`;
      imageData = { url: report.media_url || img.link || img.id, mimeType: report.mime_type || img.mime_type || "", caption: textBody };
    } else if (type === "audio") {
      previewText = `🎤 Voice Message`;
      imageData = { url: report.media_url || report.audio?.link || report.audio?.id, mimeType: report.mime_type || report.audio?.mime_type || "" };
    } else {
      textBody = report.caption || "";
      previewText = `📎 Attachment`;
      imageData = { url: report.media_url, mimeType: report.mime_type || "", caption: textBody };
    }
  } else if (type === "text") {
    textBody = report.body || report.text?.body || "";
    previewText = textBody;
  } else if (type === "button" || type === "interactive") {
    textBody = report.button?.text || report.interactive?.button_reply?.title || "Button clicked";
    previewText = `🔘 ${textBody}`;
  } else {
    textBody = "";
    previewText = `📎 ${type} message`;
  }

  const conversationRef = db.ref(`whatsapp_conversations/${conversationId}`);
  const existingCheck = await conversationRef.child("messages").orderByChild("messageId").equalTo(messageId).once("value");

  if (!existingCheck.exists()) {
    const newMsg = {
      messageId, from, to: report.phone_number_id || "business_number",
      message: textBody, type, timestamp, direction: "inbound", status: "received",
    };
    if (imageData) newMsg.imageData = imageData;
    await conversationRef.child("messages").push(newMsg);

    await conversationRef.child("metadata").transaction((currentData) => {
      const senderName = report.contact_name || report.profile_name || report.name || from;
      if (!currentData) {
        return { lastMessage: previewText, timestamp, unreadCount: 1, displayName: senderName, phoneNumber: from };
      }
      const updatedName = (!currentData.displayName || currentData.displayName === from || currentData.displayName === "undefined") ? senderName : currentData.displayName;
      return { ...currentData, lastMessage: previewText, timestamp, displayName: updatedName, unreadCount: (currentData.unreadCount || 0) + 1 };
    });
  }
}

/**
 * Common Logic for processing Status Updates
 */
async function processStatus(db, fs, report) {
  // Fast2SMS Bulk API logic:
  // 1. The ID we stored during send was the 'fast2sms_request_id' (e.g. W45aLqep55Jo1qL)
  // 2. The webhook's 'request_id' is actually the Meta Message ID (wamid)
  // 3. The webhook's 'fast2sms_request_id' is the one we use to find the batch.
  
  const batchId = report.fast2sms_request_id || report.request_id || report.message_id || report.id;
  const metaMessageId = report.request_id || report.id; // The wamid (Meta items carry it as `id`)
  const status = (report.status || "").toLowerCase();
  const timestamp = (report.timestamp > 10000000000 ? parseInt(report.timestamp) : (parseInt(report.timestamp) * 1000 || Date.now()));
  const recipientPhone = report.recipient_id || report.mobileNo || report.to || report.from || report.phone;

  // New efficient lookup:
  // 1. Find the broadcastId from the batchId (Fast2SMS request ID)
  const appliedConvoPaths = new Set();
  let broadcastId = null;
  const batchMapSnap = await db.ref(`whatsapp_batch_map/${batchId}`).once("value");
  if (batchMapSnap.exists()) {
    broadcastId = batchMapSnap.val();
  } else if (metaMessageId) {
    // Fallback: try mapping from metaMessageId if possible (requires storing it in batch_map too, but let's try lookup)
    const metaMapSnap = await db.ref(`whatsapp_batch_map/${metaMessageId}`).once("value");
    if (metaMapSnap.exists()) broadcastId = metaMapSnap.val();
  }

  if (broadcastId) {
    const broadcastLogsRef = db.ref(`whatsapp_broadcast_logs/${broadcastId}`);
    const incomingRecipient = recipientPhone ? String(recipientPhone).replace(/[^\d]/g, "") : null;
    
    // Efficiently find the specific recipient(s) within the broadcast
    let targetLogs = [];
    if (incomingRecipient) {
      const phone10 = incomingRecipient.slice(-10);
      const broadcastSnap = await broadcastLogsRef.once("value");
      const logs = broadcastSnap.val() || {};
      
      // Direct match first
      if (logs[incomingRecipient]) {
        targetLogs.push(broadcastSnap.child(incomingRecipient));
      } else if (phone10.length === 10) {
        // Match by last 10 digits
        Object.keys(logs).forEach(key => {
          if (key.endsWith(phone10)) {
            targetLogs.push(broadcastSnap.child(key));
          }
        });
      }
    }

    // If still not found, fallback to searching within this broadcast by messageId
    if (targetLogs.length === 0) {
      const query = await broadcastLogsRef.orderByChild("messageId").equalTo(batchId).once("value");
      query.forEach(c => targetLogs.push(c));
    }

    if (targetLogs.length > 0) {
      const statusEntry = { status, timestamp, serverTime: Date.now() };
      let errMsg = null;
      if ((status === "failed" || status === "error")) {
        errMsg = report.status_description || null;
        if (report.errors && Array.isArray(report.errors) && report.errors.length > 0) {
          const errObj = report.errors[0];
          errMsg = (errObj.error_data && errObj.error_data.details) || errObj.message || errObj.title || errMsg || "Unknown error";
        }
      }
      if (errMsg) statusEntry.error = errMsg;

      const STATUS_RANK = { "queued": 1, "processing": 2, "sent": 3, "delivered": 4, "read": 5, "failed": 6, "error": 6 };
      const newRank = STATUS_RANK[status] || 0;

      const updates = [];
      
      for (const logSnap of targetLogs) {
        const logData = logSnap.val();
        const currentStatus = (logData.status || "pending").toLowerCase();
        const currentRank = STATUS_RANK[currentStatus] || 0;
        const shouldUpdateMain = (newRank > currentRank);

        const logRef = logSnap.ref;
        updates.push(logRef.child("statusHistory").push(statusEntry));

        if (shouldUpdateMain) {
          const rtdbUpdate = { status, timestamp };
          if (status === "sent") rtdbUpdate.sentAt = timestamp;
          if (status === "delivered") rtdbUpdate.deliveredAt = timestamp;
          if (status === "read") rtdbUpdate.readAt = timestamp;
          if (errMsg) rtdbUpdate.error = errMsg;
          
          if (metaMessageId && metaMessageId !== logData.messageId) {
            rtdbUpdate.metaMessageId = metaMessageId;
            // Also map the metaMessageId to this broadcastId for future webhooks
            updates.push(db.ref(`whatsapp_batch_map/${metaMessageId}`).set(broadcastId));
          }
          
          updates.push(logRef.update(rtdbUpdate));

          // Update aggregated stats in Firestore history
          const historyRecordRef = fs.collection("whatsapp_history").doc(broadcastId);
          const historyUpdate = {};
          if (status === "sent" && currentStatus === "processing") historyUpdate.sentCount = admin.firestore.FieldValue.increment(1);
          else if (status === "delivered") {
            if (currentStatus === "processing") historyUpdate.sentCount = admin.firestore.FieldValue.increment(1);
            if (currentStatus === "processing" || currentStatus === "sent") historyUpdate.deliveredCount = admin.firestore.FieldValue.increment(1);
          } else if (status === "read") {
            if (currentStatus === "processing") historyUpdate.sentCount = admin.firestore.FieldValue.increment(1);
            if (currentStatus === "processing" || currentStatus === "sent") historyUpdate.deliveredCount = admin.firestore.FieldValue.increment(1);
            historyUpdate.readCount = admin.firestore.FieldValue.increment(1);
          } else if (status === "failed" && currentStatus !== "failed") {
            historyUpdate.failedCount = admin.firestore.FieldValue.increment(1);
          }
          if (Object.keys(historyUpdate).length > 0) updates.push(historyRecordRef.update(historyUpdate));

          // Update conversation record
          const conversationId = String(logData.recipientId).replace(/[^\d]/g, "");
          const messagesRef = db.ref(`whatsapp_conversations/${conversationId}/messages`);
          
          updates.push(messagesRef.once("value").then(convoSnap => {
            const msgPromises = [];
            convoSnap.forEach(m => {
              const mData = m.val();
              if (mData.messageId === batchId || mData.messageId === metaMessageId) {
                appliedConvoPaths.add(m.ref.toString());
                msgPromises.push(m.ref.child("statusHistory").push(statusEntry));
                const mUpdate = { status, error: errMsg || null };
                if (metaMessageId) mUpdate.metaMessageId = metaMessageId;
                msgPromises.push(m.ref.update(mUpdate));
              }
            });
            return Promise.all(msgPromises);
          }));
        }
      }
      await Promise.all(updates);
    }
  } else {
    // Legacy search for old structure logs if still coming in
    const logsRef = db.ref(`whatsapp_broadcast_logs`);
    let logQuery = await logsRef.orderByChild("messageId").equalTo(batchId).once("value");
    if (!logQuery.exists() && metaMessageId) {
      logQuery = await logsRef.orderByChild("messageId").equalTo(metaMessageId).once("value");
    }

    if (logQuery.exists()) {
      const statusEntry = { status, timestamp, serverTime: Date.now() };
      let errMsg = null;
      if ((status === "failed" || status === "error")) {
        errMsg = report.status_description || null;
        if (report.errors && Array.isArray(report.errors) && report.errors.length > 0) {
          const errObj = report.errors[0];
          errMsg = (errObj.error_data && errObj.error_data.details) || errObj.message || errObj.title || errMsg || "Unknown error";
        }
      }
      if (errMsg) statusEntry.error = errMsg;

      const STATUS_RANK = { "queued": 1, "processing": 2, "sent": 3, "delivered": 4, "read": 5, "failed": 6, "error": 6 };
      const newRank = STATUS_RANK[status] || 0;

      const updates = [];
      logQuery.forEach(child => {
        const logData = child.val();
        const logRecipient = String(logData.recipientId || "").replace(/[^\d]/g, "");
        const incomingRecipient = recipientPhone ? String(recipientPhone).replace(/[^\d]/g, "") : null;
        const isMatch = incomingRecipient && (logRecipient === incomingRecipient || (incomingRecipient.length >= 10 && logRecipient.endsWith(incomingRecipient.slice(-10))));

        if (isMatch) {
          const currentStatus = (logData.status || "pending").toLowerCase();
          const currentRank = STATUS_RANK[currentStatus] || 0;
          const shouldUpdateMain = (newRank > currentRank);

          updates.push(child.ref.child("statusHistory").push(statusEntry));
          if (shouldUpdateMain) {
            const rtdbUpdate = { status, timestamp };
            if (status === "sent") rtdbUpdate.sentAt = timestamp;
            if (status === "delivered") rtdbUpdate.deliveredAt = timestamp;
            if (status === "read") rtdbUpdate.readAt = timestamp;
            if (errMsg) rtdbUpdate.error = errMsg;
            updates.push(child.ref.update(rtdbUpdate));
            
            // Note: Firestore aggregation for legacy logs omitted for safety/brevity
          }
        }
      });
      await Promise.all(updates);
    }
  }

  // Live-chat replies (and anything else filed under the conversation) are matched by wamid
  // whether or not a broadcast claimed the receipt.
  await updateConversationMessage(db, {
    wamid: metaMessageId, recipient: recipientPhone, status, timestamp, errMsg: receiptError(report, status),
  }, appliedConvoPaths);
}

/**
 * Shared-secret gate for the webhook.
 *
 * Sending goes through Fast2SMS, so Meta's x-hub-signature-256 HMAC cannot be
 * assumed on delivery callbacks. The one mechanism every provider supports is a
 * secret baked into the registered callback URL itself: query params are
 * preserved on both the GET verification handshake and POST deliveries.
 *
 * Enforcement is config-driven: set `webhookToken` on configs/whatsapp_main
 * (Admin -> WhatsApp Config) and re-register the callback URL with
 * ?token=<value> at the provider. Until the token is configured the endpoint
 * behaves as before but logs a warning on every hit, so turning protection on
 * is a config change, not a deploy.
 */
async function getWebhookToken() {
  const snap = await admin.firestore().collection("configs").doc("whatsapp_main").get();
  const t = snap.exists ? snap.data().webhookToken : null;
  return t ? String(t).trim() : null;
}

const tokenMatches = (presented, expected) => {
  const a = Buffer.from(String(presented || ""));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

exports.shouldApplyStatus = shouldApplyStatus;
exports.receiptError = receiptError;
exports.updateConversationMessage = updateConversationMessage;
exports.processStatus = processStatus;
exports.processIncoming = processIncoming;
exports.whatsappWebhook = onRequest(async (request, response) => {
  let token;
  try {
    token = await getWebhookToken();
  } catch (err) {
    // Fail closed-ish: better to make the provider retry than to accept
    // unauthenticated traffic just because the config read hiccuped.
    logger.error("Webhook: could not load webhookToken config", err);
    return response.status(503).send("Config unavailable");
  }

  if (token) {
    // Meta's GET handshake presents the secret as hub.verify_token; every other
    // call (Meta POST, Fast2SMS GET/POST) carries it in the registered URL.
    const viaQuery = tokenMatches(request.query.token, token);
    const viaHub = request.method === "GET" && tokenMatches(request.query["hub.verify_token"], token);
    if (!viaQuery && !viaHub) {
      logger.warn("Webhook: rejected unauthenticated call", { method: request.method });
      return response.status(403).send("Forbidden");
    }
  } else {
    logger.warn(
      "Webhook: webhookToken not configured - endpoint is UNAUTHENTICATED. " +
      "Set it in Admin -> WhatsApp Config and add ?token=<value> to the callback URL."
    );
  }

  if (request.method === "GET") {
    const challenge = request.query["hub.challenge"];
    return response.status(200).send(challenge);
  }

  if (request.method !== "POST") return response.status(405).send("Method Not Allowed");

  try {
    const db = admin.database(), fs = admin.firestore(), body = request.body;
    await db.ref("whatsapp_debug_webhooks").push({ timestamp: admin.database.ServerValue.TIMESTAMP, payload: body });

    if (body.whatsapp_reports && Array.isArray(body.whatsapp_reports)) {
      for (const report of body.whatsapp_reports) {
        if (report.type === "incoming_message") await processIncoming(db, report);
        else if (report.type === "status_update") await processStatus(db, fs, report);
      }
    } else if (body.object) {
      const change = body.entry?.[0]?.changes?.[0] || {};
      const value = change.value || {};
      // The business's own phone reacting (WhatsApp Business app): shown on the message like ours.
      if (change.field === "smb_message_echoes") {
        for (const echo of value.message_echoes || []) {
          const reaction = extractReaction(echo, { fromMe: true });
          if (reaction) await storeReaction(db, reaction);
        }
      }
      if (value.messages) for (const msg of value.messages) await processIncoming(db, { ...msg, profile_name: value.contacts?.[0]?.profile?.name });
      if (value.statuses) for (const status of value.statuses) await processStatus(db, fs, status);
    }

    response.status(200).send("OK");
  } catch (error) {
    logger.error("Global error processing webhook", error);
    response.status(500).send("Error");
  }
});


/**
 * Trim whatsapp_debug_webhooks to the last DEBUG_RETENTION_DAYS.
 *
 * The webhook appends every raw provider payload there and nothing ever reads it
 * back in code — it exists purely so a human can inspect recent traffic in the
 * Firebase console. Left alone it grows forever (2,015 entries / 1.1 MB across
 * the first 92 days, ~22/day), and because the payloads carry parent phone
 * numbers and message bodies, "forever" is a privacy cost as well as a storage
 * one. Recent history stays; everything older goes.
 *
 * Deletes in batches via a single multi-path update per batch (atomic, one round
 * trip), bounded by MAX_BATCHES so a backlog can never run the function away.
 */
const DEBUG_RETENTION_DAYS = 30;
const DEBUG_BATCH = 500;
const DEBUG_MAX_BATCHES = 20;

exports.pruneWhatsAppDebugLog = onSchedule(
  { schedule: "every day 03:30", timeZone: "Asia/Kolkata" },
  async () => {
    const ref = admin.database().ref("whatsapp_debug_webhooks");
    const cutoff = Date.now() - DEBUG_RETENTION_DAYS * 86400000;
    let removed = 0;

    for (let i = 0; i < DEBUG_MAX_BATCHES; i++) {
      // Server-side filter — needs the timestamp index in database.rules.json,
      // without which RTDB would download the whole node to sort it locally.
      const snap = await ref.orderByChild("timestamp").endAt(cutoff).limitToFirst(DEBUG_BATCH).once("value");
      if (!snap.exists()) break;

      const updates = {};
      snap.forEach((child) => { updates[child.key] = null; });
      const n = Object.keys(updates).length;
      if (n === 0) break;

      await ref.update(updates);
      removed += n;
      if (n < DEBUG_BATCH) break;
    }

    logger.info("pruneWhatsAppDebugLog complete", { removed, retentionDays: DEBUG_RETENTION_DAYS });
  }
);
