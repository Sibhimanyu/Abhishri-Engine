
/**
 * WhatsApp Sender Module - API Layer
 * Handles all external API calls and Cloud Function interactions
 */

if (!window.whatsAppSender) {
    console.error("WhatsApp Handler: State not initialized. Load state.js first.");
} else {

    /**
     * Trigger a sync of templates from Meta/Fast2SMS to Firestore
     */
    window.whatsAppSender.syncTemplatesAPI = async function () {
        const syncTemplatesCallable = firebase.functions().httpsCallable('syncWhatsAppTemplates');
        const result = await syncTemplatesCallable();
        return result.data;
    };

    /**
     * Send a text message via Callable Cloud Function
     * @param {string} recipient - Phone number
     * @param {string} text - Message body
     * @returns {Promise<object>} - API Response
     */
    window.whatsAppSender.sendMessageAPI = async function (recipient, text) {
        const sendMessageCallable = firebase.functions().httpsCallable('sendWhatsAppMessage');
        const result = await sendMessageCallable({
            to: recipient,
            text: text
        });

        return result.data;
    };

    /**
     * Send Broadcast Template via Callable Cloud Function
     * @param {object} options - Options object
     * @param {string} options.templateName - The name of the template from API
     * @param {string[]} options.recipients - Array of E.164 phone numbers
     * @param {string[]} options.variables - Array of variable values mapping to {{1}}, {{2}}...
     * @param {string} [options.broadcastId] - Optional unique ID for this broadcast campaign
     * @param {string} [options.headerImageUrl] - Optional direct URL for an image header
     * @returns {Promise<object>} - API Response
     */
    window.whatsAppSender.sendBroadcastAPI = async function ({ templateName, recipients, variables = [], broadcastId = null, headerImageUrl = null, excludedNumbers = [], contactsCount = 0 }) {

        const sendBroadcastCallable = firebase.functions().httpsCallable('sendWhatsAppBroadcast');
        const result = await sendBroadcastCallable({
            templateName: templateName,
            recipients: recipients,
            variables: variables,
            broadcastId: broadcastId,
            headerImageUrl: headerImageUrl,
            excludedNumbers: excludedNumbers,
            contactsCount: contactsCount
        });

        return result.data;
    };

    /**
     * Local Simulation Engine
     * Simulates background processing of a broadcast for UI testing
     */
    window.whatsAppSender.startLocalSimulation = async function (broadcastId, allRecipients) {
        const historyRef = firestore.collection('modules').doc('whatsapp_sender').collection('history').doc(broadcastId);

        // Group by contact name
        const contactGroups = {};
        allRecipients.forEach(r => {
            if (!contactGroups[r.name]) contactGroups[r.name] = [];
            contactGroups[r.name].push(r);
        });

        const contactNames = Object.keys(contactGroups);
        let processedContacts = 0;
        let processedMessages = 0;

        for (const name of contactNames) {
            // Check if stopped by user
            const currentSnap = await historyRef.get();
            const data = currentSnap.data() || {};
            if (data.status === 'stopped' || data.stopRequested) {
                await historyRef.update({ status: 'stopped', currentContactName: 'Simulation Stopped' });
                return;
            }

            // Update current contact being processed
            await historyRef.update({
                currentContactName: name,
                processedContactsCount: processedContacts
            });

            const members = contactGroups[name];
            for (const member of members) {
                const cleanPhone = String(member.phone).replace(/\D/g, '');
                const logRef = firebase.database().ref(`modules/whatsapp_sender/broadcast_logs/${broadcastId}/${cleanPhone}`);

                // 1. Initial State: Pending
                const timestamp = Date.now();
                const initialLog = {
                    broadcastId,
                    recipientId: member.phone,
                    name: member.name,
                    status: 'pending',
                    timestamp: timestamp,
                    isSimulation: true
                };
                await logRef.set(initialLog);
                await logRef.child('statusHistory').push({ status: 'pending', timestamp });

                // 2. Simulate 'Sent' (Confirmed by provider)
                setTimeout(async () => {
                    // 5% chance of early failure (e.g., invalid number)
                    if (Math.random() < 0.05) {
                        const failTs = Date.now();
                        await logRef.update({ status: 'failed', timestamp: failTs, error: 'Simulation: Invalid Number' });
                        await logRef.child('statusHistory').push({ status: 'failed', timestamp: failTs, error: 'Simulation: Invalid Number' });
                        await historyRef.update({ failedCount: firebase.firestore.FieldValue.increment(1) });
                        return;
                    }

                    const sentTs = Date.now();
                    const statusEntry = { status: 'sent', timestamp: sentTs, serverTime: Date.now() };
                    await logRef.update({ status: 'sent', timestamp: sentTs, sentAt: sentTs });
                    await logRef.child('statusHistory').push(statusEntry);

                    processedMessages++;
                    await historyRef.update({
                        processedNumbersCount: processedMessages,
                        sentCount: firebase.firestore.FieldValue.increment(1)
                    });

                    // 3. Simulate 'Delivered'
                    setTimeout(async () => {
                        const delivTs = Date.now();
                        await logRef.update({ status: 'delivered', timestamp: delivTs, deliveredAt: delivTs });
                        await logRef.child('statusHistory').push({ status: 'delivered', timestamp: delivTs });
                        await historyRef.update({ deliveredCount: firebase.firestore.FieldValue.increment(1) });

                        // 4. 70% chance of reading
                        if (Math.random() > 0.3) {
                            setTimeout(async () => {
                                const readTs = Date.now();
                                await logRef.update({ status: 'read', timestamp: readTs, readAt: readTs });
                                await logRef.child('statusHistory').push({ status: 'read', timestamp: readTs });
                                await historyRef.update({ readCount: firebase.firestore.FieldValue.increment(1) });
                            }, 1000 + Math.random() * 8000);
                        }
                    }, 800 + Math.random() * 4000);

                }, 400 + Math.random() * 1200);

                // Delay between numbers
                await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
            }

            processedContacts++;
            await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
        }

        // Mark as completed
        await historyRef.update({
            status: 'completed',
            currentContactName: null,
            processedContactsCount: contactNames.length,
            processedNumbersCount: allRecipients.length
        });

        AppDialog.toast('Simulation completed successfully.', 'success');
    };

}
