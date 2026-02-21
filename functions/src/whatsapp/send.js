const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require('firebase-admin');
const axios = require('axios');

// Helper to verify admin privileges
async function verifyAdmin(auth) {
    if (!auth || !auth.uid || !auth.token.email) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const emailKey = auth.token.email.replace(/\./g, '_').replace(/@/g, '_');
    const db = admin.database();

    // Check if user is in allowedUsers and has permission
    const snapshot = await db.ref(`allowedUsers/${emailKey}`).once('value');
    const userData = snapshot.val();

    if (!userData) {
        throw new HttpsError('permission-denied', 'User not found in allowed list.');
    }

    const isAdmin = userData.isAdmin === true;
    const hasAccess = userData.permissions?.whatsapp_sender?.access === true || userData.permissions?.whatsapp_sender === true;

    if (!isAdmin && !hasAccess) {
        throw new HttpsError('permission-denied', 'User does not have permission to use WhatsApp Sender.');
    }
}

// Helper to fetch Fast2SMS config
async function getWhatsAppConfig() {
    const db = admin.database();
    const snapshot = await db.ref('modules/whatsapp_sender/config').once('value');
    const config = snapshot.val();

    if (!config || !config.apiKey) {
        throw new HttpsError('failed-precondition', 'WhatsApp configuration is missing.');
    }
    return config;
}

// Fetch Templates (Callable)
exports.fetchTemplates = onCall(async (request) => {
    await verifyAdmin(request.auth);
    const config = await getWhatsAppConfig();

    if (!config.wabaId) {
        throw new HttpsError('failed-precondition', 'WABA ID is not configured.');
    }

    const url = `https://www.fast2sms.com/dev/whatsapp/v24.0/${config.wabaId}/message_templates?authorization=${config.apiKey}`;

    try {
        const response = await axios.get(url, {
            headers: { 'accept': 'application/json' }
        });
        return { data: response.data };
    } catch (error) {
        logger.error("Error fetching templates", { error: error.message });
        throw new HttpsError('internal', 'Failed to fetch templates securely.');
    }
});

// Send WhatsApp Message (Callable)
exports.sendWhatsAppMessage = onCall(async (request) => {
    await verifyAdmin(request.auth);
    const config = await getWhatsAppConfig();

    const { to, text } = request.data;
    if (!to || !text) {
        throw new HttpsError('invalid-argument', 'Missing to or text parameters.');
    }

    const url = `https://www.fast2sms.com/dev/whatsapp/v24.0/${config.phoneNumberId}/messages`;
    const payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": { "body": text }
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': config.apiKey,
                'Content-Type': 'application/json'
            }
        });
        logger.info("WhatsApp message sent securely", { to });
        return response.data;
    } catch (error) {
        logger.error("Error sending message", { error: error.message });
        throw new HttpsError('internal', 'Failed to send WhatsApp message.');
    }
});

// Send WhatsApp Broadcast (Callable)
exports.sendWhatsAppBroadcast = onCall(async (request) => {
    await verifyAdmin(request.auth);
    const config = await getWhatsAppConfig();

    const { templateName, numbers, variables } = request.data;
    if (!templateName || !numbers) {
        throw new HttpsError('invalid-argument', 'Missing templateName or numbers parameters.');
    }

    const url = 'https://www.fast2sms.com/dev/bulkV2';
    const formattedNumbers = numbers.map(num => String(num).replace('+', '')).join(',');
    const variablesString = (variables || []).join('|');

    const payload = {
        route: "whatsapp",
        message_template_name: templateName,
        message_type: "template",
        variables_values: variablesString,
        numbers: formattedNumbers
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'authorization': config.apiKey,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            }
        });
        logger.info("WhatsApp broadcast sent securely", { count: numbers.length });
        return response.data;
    } catch (error) {
        logger.error("Error sending broadcast", { error: error.message });
        throw new HttpsError('internal', 'Failed to send WhatsApp broadcast.');
    }
});
