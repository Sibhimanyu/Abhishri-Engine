
/**
 * WhatsApp Sender Module - API Layer
 * Handles all external API calls and Cloud Function interactions
 */

if (!window.whatsAppSender) {
    console.error("WhatsApp Handler: State not initialized. Load state.js first.");
} else {

    /**
     * Fetch Templates securely via Cloud Function
     */
    window.whatsAppSender.fetchTemplates = async function () {
        if (!this.config || !this.config.wabaId) return;

        try {
            const fetchTemplatesCallable = firebase.functions().httpsCallable('fetchTemplates');
            const result = await fetchTemplatesCallable();

            // The Callable Function returns { data: { data: [...] } }
            // firebase SDK unwraps the first 'data', so result.data contains the Fast2SMS response.
            // Fast2SMS response itself has a 'data' array containing the templates.
            const responseData = result.data;
            let templatesArray = [];

            if (responseData && responseData.data && Array.isArray(responseData.data.data)) {
                // Handle nested structure: { data: { data: [...] } }
                templatesArray = responseData.data.data;
            } else if (responseData && Array.isArray(responseData.data)) {
                // Handle standard structure: { data: [...] }
                templatesArray = responseData.data;
            } else if (Array.isArray(responseData)) {
                // Handle direct array
                templatesArray = responseData;
            }

            this.templates = templatesArray;
            console.log("Templates fetched successfully:", this.templates.length);

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
     * @param {string} templateName - The name of the template from API
     * @param {string[]} numbers - Array of E.164 phone numbers
     * @param {string[]} variables - Array of variable values mapping to {{1}}, {{2}}...
     * @returns {Promise<object>} - API Response
     */
    window.whatsAppSender.sendBroadcastAPI = async function (templateName, numbers, variables = []) {
        const sendBroadcastCallable = firebase.functions().httpsCallable('sendWhatsAppBroadcast');
        const result = await sendBroadcastCallable({
            templateName: templateName,
            numbers: numbers,
            variables: variables
        });

        return result.data;
    };

}

