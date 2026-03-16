
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Ensure admin is initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const sanitizeKey = (key) => key ? String(key).replace(/[.#$/[\]]/g, "_") : key;

exports.whatsappWebhook = onRequest(async (request, response) => {
  if (request.method === "GET") {
    const mode = request.query["hub.mode"];
    const token = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

    if (mode === "subscribe" && token) {
      if (VERIFY_TOKEN && token !== VERIFY_TOKEN) {
        logger.warn("Webhook verification failed: token mismatch", {token});
        return response.status(403).send("Forbidden: Invalid verify token");
      }
      logger.info("Webhook verification successful", {mode});
      return response.status(200).send(challenge);
    }
    return response.status(200).send("OK (GET)");
  }

  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  logger.info("Webhook received", {body: JSON.stringify(request.body)});

  let processed = false;
  let errorDetails = null;

  try {
    let body = request.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { /* ignore, use string */ }
    }
    const db = admin.database();
    const historyRef = db.ref("modules/whatsapp_sender");

    // Always log for debug
    await historyRef.child("debug_webhooks").push({
      timestamp: admin.database.ServerValue.TIMESTAMP,
      payload: body,
    });

    if (body.whatsapp_reports) {
      for (const report of body.whatsapp_reports) {
        if (report.type === "incoming_message") {
          const messageId = report.message_id;
          const from = report.from;
          const type = report.message_type || "text";
          const timestamp = report.timestamp * 1000;
          const conversationId = from;

          let textBody = "";
          let previewText = "";
          let imageData = null;

          if (type === "image" || type === "audio" || report.media_url) {
            if (type === "image") {
              textBody = report.caption || "";
              previewText = report.caption ? `📷 ${report.caption}` : `📷 Photo`;
            } else if (type === "audio") {
              textBody = "";
              previewText = `🎤 Voice Message`;
            } else {
              textBody = report.caption || "";
              previewText = `📎 Attachment`;
            }
            imageData = {url: report.media_url, mimeType: report.mime_type || "", caption: report.caption || ""};
          } else if (type === "text") {
            textBody = report.body || "";
            previewText = textBody;
          } else {
            textBody = "";
            previewText = `📎 ${type} message`;
          }

          const existingCheck = await historyRef.child(`conversations/${conversationId}/messages`).orderByChild("messageId").equalTo(messageId).once("value");
          if (!existingCheck.exists()) {
            const newMsg = {
              messageId, from, to: report.phone_number_id || "business_number",
              message: textBody, type, timestamp, direction: "inbound", status: "received",
            };
            if (imageData) newMsg.imageData = imageData;
            await historyRef.child(`conversations/${conversationId}/messages`).push(newMsg);

            await historyRef.child(`conversations/${conversationId}/metadata`).transaction((currentData) => {
              const senderName = report.contact_name || report.profile_name || report.name || from;
              if (!currentData) {
                return {lastMessage: previewText, timestamp, unreadCount: 1, displayName: senderName, phoneNumber: from};
              }
              const updatedName = (!currentData.displayName || currentData.displayName === from || currentData.displayName === "undefined") ? senderName : currentData.displayName;
              return {...currentData, lastMessage: previewText, timestamp, displayName: updatedName, unreadCount: (currentData.unreadCount || 0) + 1};
            });
          }
          processed = true;
        } else if (report.type === "status_update") {
          const messageId = report.request_id || report.message_id || report.id;
          const status = (report.status || "").toLowerCase();
          const timestamp = report.timestamp * 1000;

          const lookupRef = db.ref(`modules/whatsapp_sender/message_lookup/${sanitizeKey(messageId)}`);
          const lookupSnapshot = await lookupRef.once("value");
          const lookupData = lookupSnapshot.val();

          if (lookupData) {
            const currentStatus = lookupData.lastStatus || "sent";
            const STATUS_RANK = { "failed": 4, "read": 3, "delivered": 2, "sent": 1, "pending": 0 };
            const newRank = STATUS_RANK[status] || 0;
            const currentRank = STATUS_RANK[currentStatus] || 0;

            if (newRank <= currentRank && status !== "failed") {
              console.log(`Ignoring duplicate or delayed webhook. Current: ${currentStatus}, Received: ${status} for Msg: ${messageId}`);
              continue; // Skip further processing for this report but continue the loop
            }

            const {recipientId, msgKey, broadcastId} = lookupData;
            const msgRef = historyRef.child(`conversations/${recipientId}/messages/${msgKey}`);

            // Extract detailed error info (full object, not just a string)
            let errMsg = null;
            let errorInfo = null;
            if (status === "failed" && report.errors && Array.isArray(report.errors) && report.errors.length > 0) {
              const errObj = report.errors[0];
              errMsg = (errObj.error_data && errObj.error_data.details) || errObj.message || errObj.title || "Unknown error";
              errorInfo = {
                code: errObj.code || null,
                title: errObj.title || null,
                details: (errObj.error_data && errObj.error_data.details) || errObj.message || null,
                href: errObj.href || null,
              };
            } else if (status === "failed" && typeof report.errors === "string") {
              errMsg = report.errors;
              errorInfo = {code: null, title: null, details: report.errors, href: null};
            }

            // Extract conversation & billing metadata from webhook payload
            const conversationInfo = report.conversation ? {
              id: report.conversation.id || null,
              originType: (report.conversation.origin && report.conversation.origin.type) || null,
            } : null;
            const pricingModel = report.pricing_model || (report.pricing && report.pricing.model) || null;
            const billingCategory = (report.pricing && report.pricing.category) || (report.billing && report.billing.category) || null;

            const update = {status};
            if (status === "sent") update.sentAt = timestamp;
            if (status === "delivered") update.deliveredAt = timestamp;
            if (status === "read") update.readAt = timestamp;
            if (errMsg) update.error = errMsg;
            if (errorInfo) update.errorInfo = errorInfo;
            if (conversationInfo) update.conversationInfo = conversationInfo;
            if (pricingModel) update.pricingModel = pricingModel;
            if (billingCategory) update.billingCategory = billingCategory;

            const updatePromises = [];

            updatePromises.push(msgRef.update(update));

            const newStatusEntry = {status, timestamp};
            if (errMsg) newStatusEntry.error = errMsg;
            updatePromises.push(msgRef.child("statusHistory").push(newStatusEntry));

            if (broadcastId) {
              const logUpdate = {status, timestamp};
              if (errMsg) logUpdate.error = errMsg;
              if (errorInfo) logUpdate.errorInfo = errorInfo;
              if (conversationInfo) logUpdate.conversationInfo = conversationInfo;
              if (pricingModel) logUpdate.pricingModel = pricingModel;
              if (billingCategory) logUpdate.billingCategory = billingCategory;
              if (status === "sent") logUpdate.sentAt = timestamp;
              if (status === "delivered") logUpdate.deliveredAt = timestamp;
              if (status === "read") logUpdate.readAt = timestamp;

              const bLogRef = db.ref(`modules/whatsapp_sender/broadcast_logs/${broadcastId}/${recipientId}`);
              updatePromises.push(bLogRef.update(logUpdate));
              updatePromises.push(bLogRef.child("statusHistory").push(newStatusEntry));

              // Update aggregate progress in history record transactionally
              const historyRecordRef = db.ref(`modules/whatsapp_sender/broadcast_history/${broadcastId}`);
              updatePromises.push(historyRecordRef.transaction((history) => {
                if (!history) return history;

                // Initialize if not present (safeguard)
                if (history.sentCount === undefined) history.sentCount = history.successCount || 0;
                if (history.deliveredCount === undefined) history.deliveredCount = 0;
                if (history.readCount === undefined) history.readCount = 0;
                if (history.failedCount === undefined) history.failedCount = 0;

                if (status === "delivered") history.deliveredCount = (history.deliveredCount || 0) + 1;
                if (status === "read") history.readCount = (history.readCount || 0) + 1;
                if (status === "failed") history.failedCount = (history.failedCount || 0) + 1;

                return history;
              }));
            }

            // Self-Cleaning: Delete lookup entry once message reaches terminal state
            if (status === "read" || status === "failed") {
              updatePromises.push(lookupRef.remove());
              if (lookupData.alternateMessageId && lookupData.alternateMessageId !== lookupRef.key) {
                updatePromises.push(db.ref(`modules/whatsapp_sender/message_lookup/${lookupData.alternateMessageId}`).remove());
              }
              if (lookupData.messageId && lookupData.messageId !== lookupRef.key) {
                updatePromises.push(db.ref(`modules/whatsapp_sender/message_lookup/${lookupData.messageId}`).remove());
              }
            } else {
              updatePromises.push(lookupRef.update({ lastStatus: status }));
              if (lookupData.alternateMessageId && lookupData.alternateMessageId !== lookupRef.key) {
                updatePromises.push(db.ref(`modules/whatsapp_sender/message_lookup/${lookupData.alternateMessageId}`).update({ lastStatus: status }));
              }
              if (lookupData.messageId && lookupData.messageId !== lookupRef.key) {
                updatePromises.push(db.ref(`modules/whatsapp_sender/message_lookup/${lookupData.messageId}`).update({ lastStatus: status }));
              }
            }

            // Execute all writes in parallel for maximum precision and speed
            await Promise.all(updatePromises);
          }
          processed = true; // Structurally valid status update
        }
      }
    } else if (body.object) {
      const entry = body.entry && body.entry.length > 0 ? body.entry[0] : null;
      const change = entry && entry.changes && entry.changes.length > 0 ? entry.changes[0] : null;
      const value = change ? change.value : null;

      if (value && value.messages && value.messages.length > 0) {
        processed = true;
        // Add Meta logic back if strictly required, but focus is Fast2SMS status/incoming
      } else if (value && value.statuses && value.statuses.length > 0) {
        processed = true;
      }
    }

    response.status(200).send("OK");
  } catch (error) {
    errorDetails = error.message;
    logger.error("Error processing webhook", error);
    response.status(500).send("Error");
  } finally {
    if (!processed) {
      await admin.database().ref("modules/whatsapp_sender/unhandled_webhooks").push({
        timestamp: admin.database.ServerValue.TIMESTAMP,
        payload: request.body,
        error: errorDetails,
        processed: false,
      });
    }
  }
});
