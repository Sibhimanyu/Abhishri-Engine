
/**
 * WhatsApp Sender Module - API Layer
 * Handles all external API calls and Cloud Function interactions
 */

if (!window.whatsAppSender) {
    console.error("WhatsApp Handler: State not initialized. Load state.js first.");
} else {

    /**
     * Fetch Templates from Meta/Partner API via direct call (as per legacy) or Cloud Function
     */
    window.whatsAppSender.fetchTemplates = async function () {
        if (!this.config || !this.config.apiKey || !this.config.wabaId) return;

        try {
            // Direct call to Fast2SMS API
            // Endpoint updated as per provided cURL
            const url = `https://www.fast2sms.com/dev/whatsapp/v24.0/${this.config.wabaId}/message_templates?authorization=${this.config.apiKey}`;

            const fetchResponse = await fetch(url, {
                method: 'GET',
                headers: {
                    'accept': 'application/json'
                }
            });

            if (!fetchResponse.ok) {
                throw new Error('Failed to fetch templates');
            }

            const data = await fetchResponse.json();
            // Fast2SMS/Meta often returns { data: [...] } or just [...]
            this.templates = (data && data.data) ? data.data : (Array.isArray(data) ? data : []);
            console.log("Templates fetched:", this.templates.length);

            // If currently on broadcast view, re-render to show templates
            if (this.currentView === 'broadcast' && typeof this.renderBroadcastView === 'function') {
                this.renderBroadcastView();
            }

        } catch (error) {
            console.error("Error fetching templates:", error);
            this.templates = []; // Fallback empty
        }
    };

    /**
     * Send a text message via Cloud Function
     * @param {string} recipient - Phone number
     * @param {string} text - Message body
     * @returns {Promise<object>} - API Response
     */
    window.whatsAppSender.sendMessageAPI = async function (recipient, text) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const url = isLocal
            ? 'http://localhost:5001/abhishri-academy/us-central1/sendWhatsAppMessage'
            : 'https://sendwhatsappmessage-y2ijh5s6la-uc.a.run.app';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apiKey: this.config.apiKey,
                wabaId: this.config.wabaId,
                phoneNumberId: this.config.phoneNumberId,
                to: recipient,
                text: text
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to send message via API');
        }

        return await response.json();
    };

    /**
     * Send Broadcast Template directly to Fast2SMS API
     * @param {string} templateName - The name of the template from API
     * @param {string[]} numbers - Array of E.164 phone numbers
     * @param {string[]} variables - Array of variable values mapping to {{1}}, {{2}}...
     * @returns {Promise<object>} - API Response
     */
    window.whatsAppSender.sendBroadcastAPI = async function (templateName, numbers, variables = []) {
        if (!this.config || !this.config.apiKey) {
            throw new Error("Fast2SMS API Key not configured.");
        }

        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const url = isLocal
            ? 'http://localhost:5001/abhishri-academy/us-central1/sendWhatsAppBroadcast'
            : 'https://sendwhatsappbroadcast-y2ijh5s6la-uc.a.run.app';

        const payload = {
            apiKey: this.config.apiKey,
            templateName: templateName,
            numbers: numbers,
            variables: variables
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || errData.message || 'Failed to send broadcast API');
        }

        return await response.json();
    };

}
