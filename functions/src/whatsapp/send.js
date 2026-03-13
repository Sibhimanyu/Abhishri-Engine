const {onCall, HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

const sanitizeKey = (key) => key ? String(key).replace(/[.#$/[\]]/g, "_") : key;

// Helper to verify admin privileges
async function verifyAdmin(auth) {
  if (!auth || !auth.uid || !auth.token.email) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const emailKey = auth.token.email.replace(/\./g, "_").replace(/@/g, "_");
  const db = admin.database();

  // Check if user is in allowedUsers and has permission
  const snapshot = await db.ref(`allowedUsers/${emailKey}`).once("value");
  const userData = snapshot.val();

  if (!userData) {
    throw new HttpsError("permission-denied", "User not found in allowed list.");
  }

  const isAdmin = userData.isAdmin === true;
  const hasAccess = userData.permissions?.whatsapp_sender?.access === true || userData.permissions?.whatsapp_sender === true;

  if (!isAdmin && !hasAccess) {
    throw new HttpsError("permission-denied", "User does not have permission to use WhatsApp Sender.");
  }
}

// Helper to fetch Fast2SMS config
async function getWhatsAppConfig() {
  const db = admin.database();
  const snapshot = await db.ref("modules/whatsapp_sender/config").once("value");
  const config = snapshot.val();

  if (!config || !config.apiKey) {
    throw new HttpsError("failed-precondition", "WhatsApp configuration is missing.");
  }
  return config;
}

// Fetch Templates (Callable)
exports.fetchTemplates = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();

  if (!config.wabaId) {
    throw new HttpsError("failed-precondition", "WABA ID is not configured.");
  }

  const url = `https://www.fast2sms.com/dev/whatsapp/v24.0/${config.wabaId}/message_templates?authorization=${config.apiKey}`;

  try {
    const response = await axios.get(url, {
      headers: {"accept": "application/json"},
    });
    return {data: response.data};
  } catch (error) {
    const apiError = error.response?.data || error.message;
    logger.error("Error fetching templates", {error: apiError});

    const displayMsg = typeof apiError === "object" ? JSON.stringify(apiError) : String(apiError);
    throw new HttpsError("internal", displayMsg);
  }
});

// Check WhatsApp Fast2SMS Wallet Balance (Callable)
exports.checkWhatsAppWallet = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();

  if (!config.apiKey) {
    throw new HttpsError("failed-precondition", "API Key is not configured.");
  }

  const url = `https://www.fast2sms.com/dev/wallet?authorization=${config.apiKey}`;

  try {
    const response = await axios.get(url, {
      headers: {"accept": "application/json"},
    });
    return {data: response.data};
  } catch (error) {
    const apiError = error.response?.data || error.message;
    logger.error("Error fetching wallet balance", {error: apiError});

    const displayMsg = typeof apiError === "object" ? JSON.stringify(apiError) : String(apiError);
    throw new HttpsError("internal", displayMsg);
  }
});

// Send WhatsApp Message (Callable)
exports.sendWhatsAppMessage = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();

  const {to, text} = request.data;
  if (!to || !text) {
    throw new HttpsError("invalid-argument", "Missing to or text parameters.");
  }

  const url = `https://www.fast2sms.com/dev/whatsapp/v24.0/${config.phoneNumberId}/messages`;
  const payload = {
    "messaging_product": "whatsapp",
    "to": to,
    "type": "text",
    "text": {"body": text},
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Authorization": config.apiKey,
        "Content-Type": "application/json",
      },
    });
    logger.info("WhatsApp message sent securely", {to});
    return response.data;
  } catch (error) {
    const apiError = error.response?.data || error.message;
    logger.error("Error sending message", {error: apiError});

    const displayMsg = typeof apiError === "object" ? JSON.stringify(apiError) : String(apiError);
    throw new HttpsError("internal", displayMsg);
  }
});

// Send WhatsApp Broadcast (Callable)
exports.sendWhatsAppBroadcast = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const config = await getWhatsAppConfig();

  const {templateName, numbers, variables} = request.data;
  if (!templateName || !numbers) {
    throw new HttpsError("invalid-argument", "Missing templateName or numbers parameters.");
  }

  const url = `https://www.fast2sms.com/dev/whatsapp/v24.0/${config.phoneNumberId}/messages`;
  const formattedNumbers = numbers.map((num) => String(num).replace("+", ""));

  // Construct variables array for Meta template API
  const parameters = (variables || []).map((val) => ({
    type: "text",
    text: String(val),
  }));

  // We will loop and send to each to guarantee delivery using the standard Meta structure).
  const results = [];
  const errors = [];
  let sentCount = 0; // Keep track of successful dispatches to power the real-time UI

  // Function to ping the DB with the current progress
  const updateProgress = async (isFinal = false, statusOverride = null) => {
    if (!request.data.broadcastId) return;
    try {
      const updatePayload = {sentCount: sentCount};
      if (statusOverride) {
        updatePayload.status = statusOverride;
      } else if (isFinal) {
        updatePayload.status = "dispatched";
        updatePayload.failedCount = errors.length;
      }
      await admin.database().ref(`modules/whatsapp_sender/broadcast_history/${request.data.broadcastId}`).update(updatePayload);
    } catch (e) {
      logger.warn("Failed to ping broadcast progress to DB: " + e.message);
    }
  };

  let processedCount = 0;
  let isStopped = false;

  for (const number of formattedNumbers) {
    // Check for stop signal if broadcastId exists
    if (request.data.broadcastId) {
      const stopSnapshot = await admin.database().ref(`modules/whatsapp_sender/broadcast_history/${request.data.broadcastId}/stopRequested`).once("value");
      if (stopSnapshot.val() === true) {
        isStopped = true;
        logger.info(`Broadcast ${request.data.broadcastId} stopped by user request.`);
        break;
      }
    }

    processedCount++;
    const payload = {
      messaging_product: "whatsapp",
      to: number,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: "en", // Defaulting to english, adjust if needed
        },
        components: [],
      },
    };

    // Add header component if an image URL was provided
    if (request.data.headerImageUrl) {
      payload.template.components.push({
        type: "header",
        parameters: [
          {
            type: "image",
            image: {
              link: request.data.headerImageUrl,
            },
          },
        ],
      });
    }

    // Add body variables if they exist
    if (parameters.length > 0) {
      payload.template.components.push({
        type: "body",
        parameters: parameters,
      });
    }

    try {
      const response = await axios.post(url, payload, {
        headers: {
          "Authorization": config.apiKey,
          "Content-Type": "application/json",
        },
      });
      const responseData = response.data;
      results.push(responseData);

      // Fetch messageId robustly depending on Fast2SMS or Meta response format
      let messageId = null;
      if (responseData.messages && responseData.messages.length > 0 && responseData.messages[0].id) {
        messageId = responseData.messages[0].id;
      } else if (responseData.request_id) {
        messageId = responseData.request_id;
      } else if (responseData.id) {
        messageId = responseData.id;
      }

      // Log to individual conversation for webhook status tracking
      if (messageId) {
        const timestamp = Date.now();
        const msgRecord = {
          messageId: messageId,
          from: "business",
          to: number,
          message: `[Broadcast Template]: ${templateName}`,
          type: "template",
          templateName: templateName,
          variables: variables,
          timestamp: timestamp,
          direction: "outbound",
          status: "sent",
          broadcastId: request.data.broadcastId, // Link to specific broadcast campaign
        };

        const db = admin.database();
        const msgRef = db.ref(`modules/whatsapp_sender/conversations/${number}/messages`).push();
        const msgKey = msgRef.key;
        await msgRef.set(msgRecord);

        // Store lookup mapping for O(1) webhook correlation
        await db.ref(`modules/whatsapp_sender/message_lookup/${sanitizeKey(messageId)}`).set({
          recipientId: number,
          broadcastId: request.data.broadcastId || null,
          msgKey: msgKey,
          timestamp: timestamp,
        });

        // Also log to a dedicated broadcast logs path for easier grouping in UI
        if (request.data.broadcastId) {
          await db.ref(`modules/whatsapp_sender/broadcast_logs/${request.data.broadcastId}/${number}`).set({
            messageId: messageId,
            msgKey: msgKey,
            status: "sent",
            timestamp: timestamp,
          });
        }
      }

      sentCount++; // Increment successful send count

      // Ping DB every 5 messages to provide real-time UI updates
      if (processedCount % 5 === 0) {
        updateProgress(false).catch(() => {}); // Fire and forget
      }
    } catch (error) {
      const apiError = error.response?.data || error.message;
      logger.error(`Error sending broadcast to ${number}`, {error: apiError});
      errors.push({number, error: apiError});
    }
  }

  if (errors.length > 0) {
    logger.error("Some broadcast messages failed", {errors});
    // We still return results for those that succeeded
  }

  // Final database ping to mark as complete or stopped
  if (request.data.broadcastId) {
    await updateProgress(true, isStopped ? "stopped" : null);
  }

  logger.info("WhatsApp broadcast sent securely", {count: numbers.length, failed: errors.length});
  return {success: true, results, errors};
});
