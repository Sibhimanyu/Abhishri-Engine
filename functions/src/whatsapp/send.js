
const { onRequest } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const axios = require('axios');

const ALLOWED_ORIGINS = [
    'https://abhishri-academy.firebaseapp.com',
    'https://abhishri-academy.web.app',
    'http://localhost:5000'
];

// Cloud Function to Send WhatsApp Message (via Fast2SMS)
exports.sendWhatsAppMessage = onRequest({ cors: ALLOWED_ORIGINS }, async (req, res) => {
    // Check for POST method
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { apiKey, wabaId, phoneNumberId, to, text } = req.body;

    if (!apiKey || !phoneNumberId || !to || !text) {
        return res.status(400).json({ error: "Missing parameters. apiKey, phoneNumberId, to, and text are required." });
    }

    // Fast2SMS (and other Meta partners) typically use the standard WhatsApp Business API URL structure
    // Endpoint: https://www.fast2sms.com/dev/whatsapp/v24.0/{phone_number_id}/messages
    const url = `https://www.fast2sms.com/dev/whatsapp/v24.0/${phoneNumberId}/messages`;

    // Standard Meta API Payload
    const payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": { "body": text }
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': apiKey, // Fast2SMS uses this header, some others use 'Bearer <token>'
                'Content-Type': 'application/json'
            }
        });
        logger.info("WhatsApp message sent successfully", { to, response: response.data });
        res.status(200).json(response.data);
    } catch (error) {
        const errDetails = error.response ? error.response.data : error.message;
        logger.error("Error sending WhatsApp message", { error: errDetails });
        res.status(500).json({
            error: "Failed to send message",
            details: errDetails
        });
    }
});

// Cloud Function to Send WhatsApp Broadcast (via Fast2SMS bulkV2)
exports.sendWhatsAppBroadcast = onRequest({ cors: ALLOWED_ORIGINS }, async (req, res) => {
    // Check for POST method
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { apiKey, templateName, numbers, variables } = req.body;

    if (!apiKey || !templateName || !numbers) {
        return res.status(400).json({ error: "Missing parameters. apiKey, templateName, and numbers are required." });
    }

    const url = 'https://www.fast2sms.com/dev/bulkV2';

    // Format numbers for Fast2SMS: comma separated, without leading +
    const formattedNumbers = numbers.map(num => num.replace('+', '')).join(',');

    // Fast2SMS expects variables back-to-back split by pipe: "Var1|Var2"
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
                'authorization': apiKey,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            }
        });
        logger.info("WhatsApp broadcast sent successfully", { count: numbers.length, response: response.data });
        res.status(200).json(response.data);
    } catch (error) {
        const errDetails = error.response ? error.response.data : error.message;
        logger.error("Error sending WhatsApp broadcast", { error: errDetails });
        res.status(500).json({
            error: "Failed to send broadcast",
            details: errDetails
        });
    }
});
