
const { onRequest } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const admin = require('firebase-admin');

// Ensure admin is initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

exports.whatsappWebhook = onRequest(async (request, response) => {
    if (request.method === 'GET') {
        // Verification challenge (standard for Meta/Fast2SMS webhooks)
        const mode = request.query['hub.mode'];
        const token = request.query['hub.verify_token'];
        const challenge = request.query['hub.challenge'];

        const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

        if (mode === 'subscribe' && token) {
            if (VERIFY_TOKEN && token !== VERIFY_TOKEN) {
                logger.warn("Webhook verification failed: token mismatch", { token });
                return response.status(403).send('Forbidden: Invalid verify token');
            }
            logger.info("Webhook verification successful", { mode });
            return response.status(200).send(challenge);
        }
        return response.status(200).send('OK (GET)');
    }

    if (request.method !== 'POST') {
        return response.status(405).send('Method Not Allowed');
    }

    logger.info("Webhook received", {
        body: JSON.stringify(request.body)
    });

    try {
        const body = request.body;
        const db = admin.database();
        const historyRef = db.ref('modules/whatsapp_sender');

        // --- DEBUG STORAGE (only in dev mode) ---
        if (process.env.DEV_MODE === 'true') {
            await historyRef.child('debug_webhooks').push({
                timestamp: admin.database.ServerValue.TIMESTAMP,
                payload: body
            });
        }
        // -----------------------------------------

        if (body.whatsapp_reports) {
            for (const report of body.whatsapp_reports) {
                if (report.type === 'incoming_message') {
                    const messageId = report.message_id;
                    const from = report.from; // Sender's phone number
                    const type = report.message_type || 'text';
                    const timestamp = report.timestamp * 1000;
                    const conversationId = from;

                    let textBody = ''; // Actual text for the chat bubble
                    let previewText = ''; // Text for the sidebar preview
                    let imageData = null;

                    if (type === 'image' || type === 'audio' || report.media_url) {
                        if (type === 'image') {
                            textBody = report.caption || '';
                            previewText = report.caption ? `📷 ${report.caption}` : `📷 Photo`;
                        } else if (type === 'audio') {
                            textBody = '';
                            previewText = `🎤 Voice Message`;
                        } else {
                            textBody = report.caption || '';
                            previewText = `📎 Attachment`;
                        }

                        imageData = {
                            url: report.media_url,
                            mimeType: report.mime_type || '',
                            caption: report.caption || ''
                        };
                    } else if (type === 'text') {
                        textBody = report.body || '';
                        previewText = textBody;
                    } else {
                        textBody = '';
                        previewText = `📎 ${type} message`;
                    }

                    // Check if this messageId already exists to avoid duplicates
                    const existingCheck = await historyRef.child(`conversations/${conversationId}/messages`)
                        .orderByChild('messageId')
                        .equalTo(messageId)
                        .once('value');

                    if (existingCheck.exists()) {
                        logger.info("Duplicate message received via webhook (Fast2SMS), checking for media updates.", { messageId });
                        if (imageData && imageData.url) {
                            existingCheck.forEach(child => {
                                const currentMsg = child.val();
                                if (!currentMsg.imageData || !currentMsg.imageData.url) {
                                    child.ref.update({ imageData: imageData, message: textBody });
                                    logger.info("Updated existing message with new media_url", { messageId });
                                }
                            });
                        }
                        continue;
                    }

                    // 1. Store the message
                    const newMsg = {
                        messageId: messageId,
                        from: from,
                        to: report.phone_number_id || 'business_number',
                        message: textBody,
                        type: type,
                        timestamp: timestamp,
                        direction: 'inbound',
                        status: 'received'
                    };

                    if (imageData) {
                        newMsg.imageData = imageData;
                    }

                    await historyRef.child(`conversations/${conversationId}/messages`).push(newMsg);

                    // 2. Update conversation metadata
                    await historyRef.child(`conversations/${conversationId}/metadata`).transaction((currentData) => {
                        if (!currentData) {
                            return {
                                lastMessage: previewText,
                                timestamp: timestamp,
                                unreadCount: 1,
                                displayName: from,
                                phoneNumber: from
                            };
                        }
                        return {
                            ...currentData,
                            lastMessage: previewText,
                            timestamp: timestamp,
                            unreadCount: (currentData.unreadCount || 0) + 1
                        };
                    });

                    logger.info("Inbound message (Fast2SMS) processed", { messageId });

                } else if (report.type === 'status_update') {
                    const messageId = report.request_id;
                    const status = (report.status || '').toLowerCase();
                    const recipientId = report.recipient_id;
                    const timestamp = report.timestamp * 1000;

                    const messageRef = historyRef.child(`conversations/${recipientId}/messages`);
                    const query = messageRef.orderByChild('messageId').equalTo(messageId);
                    const snapshot = await query.once('value');

                    if (snapshot.exists()) {
                        snapshot.forEach(child => {
                            const current = child.val();
                            const update = {};

                            if (status === 'sent') update.sentAt = timestamp;
                            if (status === 'delivered') update.deliveredAt = timestamp;
                            if (status === 'read') update.readAt = timestamp;

                            const statusPriority = { 'sent': 1, 'delivered': 2, 'read': 3, 'failed': 4 };
                            const currentPriority = statusPriority[current.status] || 0;
                            const newPriority = statusPriority[status] || 0;

                            if (status === 'failed') {
                                update.status = 'failed';
                                update.error = report.errors || 'Unknown error';
                            } else if (newPriority >= currentPriority) {
                                update.status = status;
                            }

                            child.ref.update(update);
                        });
                        logger.info("Status update (Fast2SMS) processed", { messageId, status });
                    } else {
                        logger.warn("Message not found for status update", { messageId });
                    }
                }
            }
        } else if (body.object) {
            // Handle standard Meta/WhatsApp Webhook Payload
            if (body.entry &&
                body.entry[0].changes &&
                body.entry[0].changes[0] &&
                body.entry[0].changes[0].value.messages &&
                body.entry[0].changes[0].value.messages[0]
            ) {
                const value = body.entry[0].changes[0].value;
                const metadata = value.metadata || {};

                // IT IS A MESSAGE
                const message = value.messages[0];
                const contact = value.contacts ? value.contacts[0] : null;

                const from = message.from; // Phone number or ID
                const messageId = message.id;
                const type = message.type;
                let textBody = '';

                if (type === 'text') {
                    textBody = message.text.body;
                } else if (type === 'image') {
                    // Fast2SMS/Meta provides the image ID which can be downloaded via API later.
                    // For now, store it as an image message with the ID and optional caption.
                    const caption = message.image.caption || '';
                    const imageId = message.image.id;
                    const mimeType = message.image.mime_type;

                    textBody = caption ? `[Photo]: ${caption}` : `[Photo]`;

                    // We attach these to the Firebase object
                    message.imageData = {
                        id: imageId,
                        mimeType: mimeType,
                        caption: caption
                    };
                } else {
                    textBody = `[${type} message]`;
                }

                const timestamp = parseInt(message.timestamp) * 1000; // Convert to ms

                // Determine Conversation ID
                // For inbound: 'from' is the customer. conversationId = from.
                const conversationId = from;

                // DEDUPLICATION CHECK
                // Check if this messageId already exists to avoid duplicates
                const existingCheck = await historyRef.child(`conversations/${conversationId}/messages`)
                    .orderByChild('messageId')
                    .equalTo(messageId)
                    .once('value');

                if (existingCheck.exists()) {
                    logger.info("Duplicate message received via webhook, skipping.", { messageId });
                } else {
                    // 1. Store the message
                    const newMsg = {
                        messageId: messageId,
                        from: from,
                        to: 'business_number', // placeholder or use metadata if available
                        message: textBody,
                        type: type,
                        timestamp: timestamp,
                        direction: 'inbound',
                        status: 'received'
                    };

                    if (type === 'image' && message.imageData) {
                        newMsg.imageData = message.imageData;
                    }

                    await historyRef.child(`conversations/${conversationId}/messages`).push(newMsg);

                    // 2. Update conversation metadata
                    await historyRef.child(`conversations/${conversationId}/metadata`).transaction((currentData) => {
                        if (!currentData) {
                            return {
                                lastMessage: textBody,
                                timestamp: timestamp,
                                unreadCount: 1,
                                displayName: contact && contact.profile ? contact.profile.name : from,
                                phoneNumber: from
                            };
                        }
                        return {
                            ...currentData,
                            lastMessage: textBody,
                            timestamp: timestamp,
                            unreadCount: (currentData.unreadCount || 0) + 1
                        };
                    });

                    logger.info("Inbound message (Fast2SMS/Meta) processed", { messageId });
                }

            } else if (body.entry &&
                body.entry[0].changes &&
                body.entry[0].changes[0] &&
                body.entry[0].changes[0].value.statuses &&
                body.entry[0].changes[0].value.statuses[0]
            ) {
                // IT IS A STATUS UPDATE
                const statusUpdate = body.entry[0].changes[0].value.statuses[0];
                const messageId = statusUpdate.id;
                const status = statusUpdate.status; // sent, delivered, read
                const recipientId = statusUpdate.recipient_id;
                const timestamp = parseInt(statusUpdate.timestamp) * 1000;

                // We need to find the conversation.
                // Assuming recipient_id is the phone number which is the conversationId

                const messageRef = historyRef.child(`conversations/${recipientId}/messages`);
                const query = messageRef.orderByChild('messageId').equalTo(messageId);
                const snapshot = await query.once('value');

                if (snapshot.exists()) {
                    snapshot.forEach(child => {
                        const current = child.val();
                        const update = {};

                        if (status === 'sent') update.sentAt = timestamp;
                        if (status === 'delivered') update.deliveredAt = timestamp;
                        if (status === 'read') update.readAt = timestamp;

                        const statusPriority = { 'sent': 1, 'delivered': 2, 'read': 3 };
                        const currentPriority = statusPriority[current.status] || 0;
                        const newPriority = statusPriority[status] || 0;

                        if (newPriority >= currentPriority) {
                            update.status = status;
                        }

                        child.ref.update(update);
                    });
                    logger.info("Status update processed", { messageId, status });
                } else {
                    logger.warn("Message not found for status update", { messageId });
                }
            } else {
                logger.info("Unhandled Webhook Event Structure", body || {});
            }
        }

        response.status(200).send('OK');

    } catch (error) {
        logger.error("Error processing Fast2SMS webhook", error);
        response.status(500).send('Internal Server Error');
    }
});
