
const {onRequest} = require("firebase-functions/https");
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
      imageData = {url: report.media_url || img.link || img.id, mimeType: report.mime_type || img.mime_type || "", caption: textBody};
    } else if (type === "audio") {
      previewText = `🎤 Voice Message`;
      imageData = {url: report.media_url || report.audio?.link || report.audio?.id, mimeType: report.mime_type || report.audio?.mime_type || ""};
    } else {
      textBody = report.caption || "";
      previewText = `📎 Attachment`;
      imageData = {url: report.media_url, mimeType: report.mime_type || "", caption: textBody};
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
        return {lastMessage: previewText, timestamp, unreadCount: 1, displayName: senderName, phoneNumber: from};
      }
      const updatedName = (!currentData.displayName || currentData.displayName === from || currentData.displayName === "undefined") ? senderName : currentData.displayName;
      return {...currentData, lastMessage: previewText, timestamp, displayName: updatedName, unreadCount: (currentData.unreadCount || 0) + 1};
    });
  }
}

/**
 * Common Logic for processing Status Updates
 */
async function processStatus(db, fs, report) {
  const messageId = report.request_id || report.message_id || report.id;
  const status = (report.status || "").toLowerCase();
  const timestamp = (report.timestamp > 10000000000 ? report.timestamp : report.timestamp * 1000);
  const docId = sanitizeKey(messageId);

  const logRef = db.ref(`modules/whatsapp_sender/broadcast_logs/${docId}`);
  const logSnap = await logRef.once("value");
  const logData = logSnap.val();

  if (logData) {
    const currentStatus = logData.status || "pending";
    const STATUS_RANK = { "failed": 0, "pending": 1, "sent": 2, "delivered": 3, "read": 4 };
    const newRank = STATUS_RANK[status] || 0;
    const currentRank = STATUS_RANK[currentStatus] || 0;

    const {recipientId, broadcastId} = logData;
    const recipientKey = sanitizeKey(recipientId);
    const updatePromises = [];

    let errMsg = null;
    if (status === "failed" && report.errors && Array.isArray(report.errors) && report.errors.length > 0) {
      const errObj = report.errors[0];
      errMsg = (errObj.error_data && errObj.error_data.details) || errObj.message || errObj.title || "Unknown error";
    }

    const shouldUpdateMain = (newRank > currentRank) || (currentStatus === "failed" && status !== "failed");
    const statusEntry = { status, timestamp, serverTime: Date.now() };
    if (errMsg) statusEntry.error = errMsg;

    updatePromises.push(logRef.child("statusHistory").push(statusEntry));

    if (shouldUpdateMain) {
      const rtdbUpdate = { status, timestamp };
      if (status === "sent") rtdbUpdate.sentAt = timestamp;
      if (status === "delivered") rtdbUpdate.deliveredAt = timestamp;
      if (status === "read") rtdbUpdate.readAt = timestamp;
      if (errMsg) rtdbUpdate.error = errMsg;
      updatePromises.push(logRef.update(rtdbUpdate));
    }

    const messagesRef = db.ref(`modules/whatsapp_sender/conversations/${recipientKey}/messages`);
    const msgQuery = await messagesRef.orderByChild("messageId").equalTo(messageId).once("value");
    
    if (msgQuery.exists()) {
      msgQuery.forEach((child) => {
        updatePromises.push(child.ref.child("statusHistory").push(statusEntry));
        if (shouldUpdateMain) {
          const u = { status };
          if (errMsg) u.error = errMsg;
          updatePromises.push(child.ref.update(u));
        }
      });
    }

    if (broadcastId && broadcastId !== "adhoc" && shouldUpdateMain) {
      const historyRecordRef = fs.collection("modules").doc("whatsapp_sender").collection("history").doc(broadcastId);
      const historyUpdate = {};
      
      if (status === "delivered" && (currentStatus === "sent" || currentStatus === "pending")) {
        historyUpdate.deliveredCount = admin.firestore.FieldValue.increment(1);
      } else if (status === "read") {
        historyUpdate.readCount = admin.firestore.FieldValue.increment(1);
        if (currentStatus === "sent" || currentStatus === "pending") {
            historyUpdate.deliveredCount = admin.firestore.FieldValue.increment(1);
        }
      }
      
      if (currentStatus === "failed" && status !== "failed") {
        historyUpdate.failedCount = admin.firestore.FieldValue.increment(-1);
        if (status === "sent") historyUpdate.sentCount = admin.firestore.FieldValue.increment(1);
        if (status === "delivered") { historyUpdate.sentCount = admin.firestore.FieldValue.increment(1); historyUpdate.deliveredCount = admin.firestore.FieldValue.increment(1); }
        if (status === "read") { historyUpdate.sentCount = admin.firestore.FieldValue.increment(1); historyUpdate.deliveredCount = admin.firestore.FieldValue.increment(1); historyUpdate.readCount = admin.firestore.FieldValue.increment(1); }
      } else if (status === "failed" && currentStatus !== "failed") {
        historyUpdate.failedCount = admin.firestore.FieldValue.increment(1);
      }
      
      if (Object.keys(historyUpdate).length > 0) {
        updatePromises.push(historyRecordRef.update(historyUpdate));
      }
    }

    await Promise.all(updatePromises);
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
      if (value.messages) for (const msg of value.messages) await processIncoming(db, {...msg, profile_name: value.contacts?.[0]?.profile?.name});
      if (value.statuses) for (const status of value.statuses) await processStatus(db, fs, status);
    }

    response.status(200).send("OK");
  } catch (error) {
    logger.error("Global error processing webhook", error);
    response.status(500).send("Error");
  }
});
