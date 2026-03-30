
const { onRequest } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");



const sanitizeKey = (key) => key ? String(key).replace(/[.#$/[\]]/g, "_") : key;

/**
 * Common Logic for processing Incoming Messages
 */
async function processIncoming(db, report) {
  const messageId = report.message_id || report.id;
  const from = report.from;
  const type = report.message_type || report.type || "text";
  const timestamp = (report.timestamp > 10000000000 ? report.timestamp : report.timestamp * 1000);
  const conversationId = sanitizeKey(from);

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

  const conversationRef = db.ref(`modules/whatsapp_sender/conversations/${conversationId}`);
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
  const metaMessageId = report.request_id; // The wamid
  const status = (report.status || "").toLowerCase();
  const timestamp = (report.timestamp > 10000000000 ? parseInt(report.timestamp) : (parseInt(report.timestamp) * 1000 || Date.now()));
  const recipientPhone = report.recipient_id || report.mobileNo || report.to || report.from || report.phone;

  // New efficient lookup:
  // 1. Find the broadcastId from the batchId (Fast2SMS request ID)
  let broadcastId = null;
  const batchMapSnap = await db.ref(`modules/whatsapp_sender/batch_map/${batchId}`).once("value");
  if (batchMapSnap.exists()) {
    broadcastId = batchMapSnap.val();
  } else if (metaMessageId) {
    // Fallback: try mapping from metaMessageId if possible (requires storing it in batch_map too, but let's try lookup)
    const metaMapSnap = await db.ref(`modules/whatsapp_sender/batch_map/${metaMessageId}`).once("value");
    if (metaMapSnap.exists()) broadcastId = metaMapSnap.val();
  }

  if (broadcastId) {
    const broadcastLogsRef = db.ref(`modules/whatsapp_sender/broadcast_logs/${broadcastId}`);
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
            updates.push(db.ref(`modules/whatsapp_sender/batch_map/${metaMessageId}`).set(broadcastId));
          }
          
          updates.push(logRef.update(rtdbUpdate));

          // Update aggregated stats in Firestore history
          const historyRecordRef = fs.collection("modules").doc("whatsapp_sender").collection("history").doc(broadcastId);
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
          const conversationId = sanitizeKey(logData.recipientId);
          const messagesRef = db.ref(`modules/whatsapp_sender/conversations/${conversationId}/messages`);
          
          updates.push(messagesRef.once("value").then(convoSnap => {
            const msgPromises = [];
            convoSnap.forEach(m => {
              const mData = m.val();
              if (mData.messageId === batchId || mData.messageId === metaMessageId) {
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
    const logsRef = db.ref(`modules/whatsapp_sender/broadcast_logs`);
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
}

exports.whatsappWebhook = onRequest(async (request, response) => {
  if (request.method === "GET") {
    const challenge = request.query["hub.challenge"];
    return response.status(200).send(challenge);
  }

  if (request.method !== "POST") return response.status(405).send("Method Not Allowed");

  try {
    const db = admin.database(), fs = admin.firestore(), body = request.body;
    await db.ref("modules/whatsapp_sender/debug_webhooks").push({ timestamp: admin.database.ServerValue.TIMESTAMP, payload: body });

    if (body.whatsapp_reports && Array.isArray(body.whatsapp_reports)) {
      for (const report of body.whatsapp_reports) {
        if (report.type === "incoming_message") await processIncoming(db, report);
        else if (report.type === "status_update") await processStatus(db, fs, report);
      }
    } else if (body.object) {
      const value = body.entry?.[0]?.changes?.[0]?.value || {};
      if (value.messages) for (const msg of value.messages) await processIncoming(db, { ...msg, profile_name: value.contacts?.[0]?.profile?.name });
      if (value.statuses) for (const status of value.statuses) await processStatus(db, fs, status);
    }

    response.status(200).send("OK");
  } catch (error) {
    logger.error("Global error processing webhook", error);
    response.status(500).send("Error");
  }
});