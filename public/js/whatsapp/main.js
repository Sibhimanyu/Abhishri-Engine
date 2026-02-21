
/**
 * WhatsApp Sender Module - Main Controller
 * Orchestrates initialization, subscriptions, and user actions.
 */

if (!window.whatsAppSender) {
    console.error("WhatsApp Handler: State not initialized. Load state.js first.");
} else {

    // --- Initialization ---

    window.whatsAppSender.initialize = function () {
        console.log("Initializing WhatsApp Sender (Inbox Mode)...");
        this.subscribe();
        this.loadLists();
    };


    // --- Subscriptions ---

    window.whatsAppSender.subscribe = function () {
        // 1. Subscribe to Configuration
        if (this.configListener) {
            firebase.database().ref('modules/whatsapp_sender/config').off('value', this.configListener);
        }

        const configRef = firebase.database().ref('modules/whatsapp_sender/config');
        this.configListener = configRef.on('value', (snapshot) => {
            this.config = snapshot.val();
            if (this.config && this.config.apiKey && this.config.wabaId) {
                this.fetchTemplates();
            }
            this.render();
        });

        // 2. Subscribe to Conversations (Metadata only)
        const conversationsRef = firebase.database().ref('modules/whatsapp_sender/conversations');
        conversationsRef.on('value', (snapshot) => {
            const data = snapshot.val() || {};
            // Process conversations: object { phone: { metadata: {}, messages: {} } }
            this.conversations = {};
            Object.entries(data).forEach(([phone, content]) => {
                if (content.metadata) {
                    this.conversations[phone] = content.metadata;
                }
            });

            if (this.currentView === 'chats') {
                this.renderConversationList();
            }
        });
    };

    window.whatsAppSender.subscribeToMessages = function (phoneNumber) {
        // 3. Subscribe to specific messages
        const messagesRef = firebase.database().ref(`modules/whatsapp_sender/conversations/${phoneNumber}/messages`).limitToLast(50);

        // Remove previous listener on messages if exists
        if (this.currentMessageListener) {
            this.currentMessageListener.ref.off('value', this.currentMessageListener.callback);
        }

        const callback = (snapshot) => {
            const data = snapshot.val() || {};
            this.activeMessages = Object.entries(data).map(([key, val]) => ({ key, ...val }));
            this.renderMessages();
            // Reset unread count
            firebase.database().ref(`modules/whatsapp_sender/conversations/${phoneNumber}/metadata/unreadCount`).set(0);
        };

        messagesRef.on('value', callback);
        this.currentMessageListener = { ref: messagesRef, callback };
    };

    window.whatsAppSender.loadLists = function () {
        const listsRef = firebase.database().ref('modules/whatsapp_sender/custom_lists');
        listsRef.on('value', (snapshot) => {
            const data = snapshot.val() || {};
            this.lists = data;

            if (this.currentView === 'lists' && typeof this.renderLists === 'function') {
                this.renderLists();
            }

            // Gracefully update the audience dropdown without rerendering the entire broadcast view
            const audienceSelect = document.getElementById('wa-broadcast-audience');
            if (audienceSelect) {
                const currentValue = audienceSelect.value;
                const optgroup = audienceSelect.querySelector('optgroup[label="Custom Lists"]');

                if (optgroup) {
                    optgroup.innerHTML = Object.entries(this.lists).map(([id, list]) =>
                        `<option value="list:${id}">${list.name} (${list.count || 0})</option>`
                    ).join('');
                }

                // Try to keep the previously selected value
                if (Array.from(audienceSelect.options).some(opt => opt.value === currentValue)) {
                    audienceSelect.value = currentValue;
                } else {
                    audienceSelect.value = 'all'; // Fallback
                    if (typeof this.updateRecipientCount === 'function') {
                        this.updateRecipientCount();
                    }
                }
            }
        });
    };


    // --- User Actions & Main Logic ---

    window.whatsAppSender.handleSendMessage = async function (e) {
        e.preventDefault();
        const input = document.getElementById('wa-chat-input');
        const text = input.value.trim();
        if (!text) return;

        // Cost warning
        if (!confirm("Warning: Sending this message will cost 0.03 rupees. Do you wish to proceed?")) {
            return;
        }

        const recipient = this.activeConversationId;
        if (!recipient) return;

        input.value = ''; // Clear input immediately
        input.focus();

        try {
            // 1. Direct Push to Firebase (Optimistic)
            const newMessageRef = firebase.database().ref(`modules/whatsapp_sender/conversations/${recipient}/messages`).push();

            await newMessageRef.set({
                message: text,
                direction: 'outbound',
                status: 'pending',
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                to: recipient,
                from: this.config.phoneNumber
            });

            // Update metadata transactionally
            firebase.database().ref(`modules/whatsapp_sender/conversations/${recipient}/metadata`).transaction((currentData) => {
                if (!currentData) {
                    return {
                        lastMessage: text,
                        timestamp: Date.now(),
                        phoneNumber: recipient,
                        displayName: recipient
                    };
                }
                return {
                    ...currentData,
                    lastMessage: text,
                    timestamp: Date.now()
                };
            });

            // 2. Call Cloud Function via API Layer
            const data = await this.sendMessageAPI(recipient, text);
            console.log("API Response:", data);

            // Extract Message ID
            const realMessageId = data.messages?.[0]?.id || data.message_id || data.id;

            // Update message with real ID and status
            await newMessageRef.update({
                status: 'sent',
                messageId: realMessageId
            });

        } catch (error) {
            console.error("Send Failed:", error);
        }
    };

    window.whatsAppSender.prepareBroadcast = async function () {
        const select = document.getElementById('wa-template-select');
        const audienceSelect = document.getElementById('wa-broadcast-audience');
        const inputs = document.querySelectorAll('.wa-var-input');

        if (!select || !select.value) {
            alert('Please select a template first.');
            return;
        }

        const templateName = select.value;
        const audienceVal = audienceSelect.value;
        const variables = Array.from(inputs).map(inp => inp.value);

        // Required variable check
        if (variables.some(v => v.trim() === '')) {
            if (!confirm('Some template variables are empty. Do you want to proceed?')) {
                return;
            }
        }

        // Get recipients logic
        let recipients = [];
        if (audienceVal === 'staff') {
            const data = await firebase.database().ref('modules/staff_directory/staff').once('value');
            const staffs = data.val() || {};
            recipients = Object.values(staffs).map(s => s.phone).filter(Boolean);
        } else if (audienceVal === 'students') {
            // Example hook for future students lists
            alert("Students broadcast list logic not yet configured.");
            return;
        } else if (audienceVal.startsWith('list:')) {
            const listId = audienceVal.split(':')[1];
            const data = await firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}/members`).once('value');
            const members = data.val() || {};
            recipients = Object.values(members).map(m => m.phone).filter(Boolean);
        } else {
            // "all" - Merge staff and lists
            const staffData = await firebase.database().ref('modules/staff_directory/staff').once('value');
            const staffs = staffData.val() || {};
            Object.values(staffs).forEach(s => { if (s.phone) recipients.push(s.phone); });

            const listsData = await firebase.database().ref('modules/whatsapp_sender/custom_lists').once('value');
            const lists = listsData.val() || {};
            Object.values(lists).forEach(l => {
                if (l.members) Object.values(l.members).forEach(m => { if (m.phone) recipients.push(m.phone); });
            });
        }

        // Clean duplicates and missing + signs
        recipients = [...new Set(recipients)].map(num => num.startsWith('+') ? num : '+' + num);

        if (recipients.length === 0) {
            alert("No recipients found for this audience.");
            return;
        }

        const costEst = recipients.length * 0.03;
        if (!confirm(`You are about to send a broadcast to ${recipients.length} recipients. Estimated Cost: ₹${costEst.toFixed(2)}. Proceed?`)) {
            return;
        }

        try {
            // Using our new broadcast API helper
            await this.sendBroadcastAPI(templateName, recipients, variables);
            alert(`Successfully dispatched broadcast to ${recipients.length} recipients via Fast2SMS.`);

            // Log the campaign broadcast to History (optional enhancement)
            firebase.database().ref('modules/whatsapp_sender/broadcast_history').push({
                template: templateName,
                recipientsCount: recipients.length,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                status: 'sent',
                variables: variables
            });

        } catch (error) {
            console.error("Broadcast failed:", error);
            alert("Failed to send broadcast: " + error.message);
        }
    };

    window.whatsAppSender.startNewChat = function () {
        const phone = prompt("Enter phone number to chat with (E.164, e.g. +1234567890):");
        if (phone) {
            // Check if exists or just select it (logic handles new ones)
            this.selectConversation(phone);
        }
    };

    // Reusable styled in-page modal --------------------------------
    window.whatsAppSender._showModal = function (html, onSubmit) {
        // Remove any existing modal
        document.getElementById('wa-modal-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'wa-modal-overlay';
        overlay.innerHTML = `
            <div class="wa-modal">
                ${html}
            </div>
        `;

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        document.body.appendChild(overlay);

        // Autofocus first input
        setTimeout(() => overlay.querySelector('input')?.focus(), 50);

        // Wire submit button
        const submitBtn = overlay.querySelector('[data-wa-modal-submit]');
        if (submitBtn && onSubmit) {
            submitBtn.addEventListener('click', () => onSubmit(overlay));
        }

        // Wire cancel / close buttons
        overlay.querySelectorAll('[data-wa-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => overlay.remove());
        });

        // Enter key submits
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitBtn?.click();
            if (e.key === 'Escape') overlay.remove();
        });
    };

    window.whatsAppSender.createListModal = function () {
        this._showModal(`
            <div class="wa-modal-header">
                <span class="wa-modal-title">
                    <i data-lucide="plus-circle" style="width:18px;height:18px;color:var(--accent);"></i>
                    Create New List
                </span>
                <button class="btn-icon" data-wa-modal-close aria-label="Close">
                    <i data-lucide="x" style="width:16px;height:16px;"></i>
                </button>
            </div>
            <div class="wa-modal-body">
                <label class="wa-modal-label">List Name</label>
                <input id="wa-new-list-name" class="wa-modal-input" type="text" placeholder="e.g. Parents, Students, Staff…" autocomplete="off">
            </div>
            <div class="wa-modal-footer">
                <button class="btn btn-secondary" data-wa-modal-close>Cancel</button>
                <button class="btn btn-primary" data-wa-modal-submit>
                    <i data-lucide="check" style="width:14px;height:14px;"></i> Create List
                </button>
            </div>
        `, (overlay) => {
            const name = overlay.querySelector('#wa-new-list-name').value.trim();
            if (!name) {
                overlay.querySelector('#wa-new-list-name').style.borderColor = 'var(--danger, #f87171)';
                return;
            }
            overlay.remove();
            const listRef = firebase.database().ref('modules/whatsapp_sender/custom_lists').push();
            listRef.set({ name, createdAt: firebase.database.ServerValue.TIMESTAMP, count: 0 });
        });
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.addContactModal = function (listId) {
        this._showModal(`
            <div class="wa-modal-header">
                <span class="wa-modal-title">
                    <i data-lucide="user-plus" style="width:18px;height:18px;color:var(--accent);"></i>
                    Add Contact
                </span>
                <button class="btn-icon" data-wa-modal-close aria-label="Close">
                    <i data-lucide="x" style="width:16px;height:16px;"></i>
                </button>
            </div>
            <div class="wa-modal-body">
                <label class="wa-modal-label">Name</label>
                <input id="wa-contact-name" class="wa-modal-input" type="text" placeholder="Full name" autocomplete="off">
                <label class="wa-modal-label" style="margin-top:14px;">Phone Number</label>
                <input id="wa-contact-phone" class="wa-modal-input" type="tel" placeholder="+919876543210 (E.164 format)" autocomplete="off">
            </div>
            <div class="wa-modal-footer">
                <button class="btn btn-secondary" data-wa-modal-close>Cancel</button>
                <button class="btn btn-primary" data-wa-modal-submit>
                    <i data-lucide="check" style="width:14px;height:14px;"></i> Add Contact
                </button>
            </div>
        `, (overlay) => {
            const name = overlay.querySelector('#wa-contact-name').value.trim();
            const phone = overlay.querySelector('#wa-contact-phone').value.trim();
            let valid = true;
            if (!name) { overlay.querySelector('#wa-contact-name').style.borderColor = 'var(--danger, #f87171)'; valid = false; }
            if (!phone) { overlay.querySelector('#wa-contact-phone').style.borderColor = 'var(--danger, #f87171)'; valid = false; }
            if (!valid) return;
            overlay.remove();
            const listRef = firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}`);
            listRef.child('members').push({ name, phone, addedAt: firebase.database.ServerValue.TIMESTAMP })
                .then(() => listRef.child('count').transaction(count => (count || 0) + 1));
        });
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.removeMemberFromList = function (listId, memberKey) {
        if (!confirm("Remove this contact?")) return;

        const listRef = firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}`);
        listRef.child(`members/${memberKey}`).remove().then(() => {
            listRef.child('count').transaction(count => (count || 1) - 1);
        });
    };

    window.whatsAppSender.deleteList = function (listId) {
        if (!confirm("Delete this entire list? Action cannot be undone.")) return;
        firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}`).remove();
        this.renderListsView();
    };

}
