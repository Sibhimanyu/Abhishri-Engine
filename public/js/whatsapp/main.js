
/**
 * WhatsApp Sender Module - Main Controller
 * Orchestrates initialization, subscriptions, and user actions.
 */

if (!window.whatsAppSender) {
    console.error("WhatsApp Handler: State not initialized. Load state.js first.");
} else {

    // --- Initialization ---

    window.whatsAppSender.initialize = function () {

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
        const proceed = await AppDialog.confirm('Sending this message will cost ₹0.03. Do you wish to proceed?', { title: 'Confirm Send', confirmText: 'Send' });
        if (!proceed) {
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
            AppDialog.toast('Please select a template first.', 'warn');
            return;
        }

        const templateName = select.value;
        const selectedOption = select.options[select.selectedIndex];
        const templateCategory = selectedOption.getAttribute('data-category') || 'UNKNOWN';
        const campaignNameValue = document.getElementById('wa-campaign-name')?.value?.trim() || templateName;

        const audienceVal = audienceSelect.value;
        const variables = Array.from(inputs)
            .filter(inp => inp.id !== 'wa-header-media-url') // Exclude header media from standard variables
            .map(inp => inp.value);
            
        // Look for the header media URL if present
        const customMediaUrl = document.getElementById('wa-header-media-url')?.value;
        const defaultMediaUrl = selectedOption.getAttribute('data-header-image');
        const headerImageUrl = customMediaUrl || defaultMediaUrl || null;

        // Required variable check
        if (variables.some(v => v.trim() === '')) {
            const proceed = await AppDialog.confirm('Some template variables are empty. Do you want to proceed?', { title: 'Empty Variables', confirmText: 'Proceed Anyway' });
            if (!proceed) {
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
            AppDialog.toast('Students broadcast list logic not yet configured.', 'info');
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
            AppDialog.toast('No recipients found for this audience.', 'warn');
            return;
        }

        // Calculate Cost Based on Category
        let ratePerMsg = 0.95; // Default to Marketing
        let isUtility = false;
        if (templateCategory.toUpperCase() === 'UTILITY') {
            ratePerMsg = 0.25;
            isUtility = true;
        }

        const totalCostEst = recipients.length * ratePerMsg;

        // Fetch Live Wallet Balance
        // We use a direct fetch here to the Fast2SMS wallet API
        let walletBalanceDisplay = '<i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Loading...';
        let walletBalance = null;

        try {
            // Creating a callable function to check wallet balance securely
            const checkWalletCallable = firebase.functions().httpsCallable('checkWhatsAppWallet');
            const walletResult = await checkWalletCallable();

            let wResponse = walletResult.data;
            if (wResponse && wResponse.data && wResponse.wallet === undefined) {
                // Occasional double wrap from axios + firebase
                wResponse = wResponse.data;
            }

            if (wResponse && wResponse.wallet !== undefined) {
                walletBalance = parseFloat(wResponse.wallet);
                walletBalanceDisplay = `₹${walletBalance.toFixed(2)}`;
            } else {
                walletBalanceDisplay = 'Unknown (API Error)';
                console.warn('Unexpected wallet response structure:', wResponse);
            }
        } catch (e) {
            console.error("Wallet check failed", e);
            walletBalanceDisplay = 'Unavailable';
        }

        const sufficientFunds = walletBalance === null || walletBalance >= totalCostEst;

        const dialogHtml = `
            <div style="text-align:left; margin-top: 10px;">
                <p style="color:var(--text-dim); margin-bottom: 20px;">Please review the broadcast billing summary before dispatching.</p>
                
                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                        <span style="color:var(--text-dim);">Template Category</span>
                        <strong style="text-transform: capitalize; color: ${isUtility ? 'var(--accent)' : '#f43f5e'};">
                            ${templateCategory}
                        </strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                        <span style="color:var(--text-dim);">Rate per Message</span>
                        <strong>₹${ratePerMsg.toFixed(2)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                        <span style="color:var(--text-dim);">Total Recipients</span>
                        <strong>${recipients.length}</strong>
                    </div>
                    <div style="height:1px; background:var(--card-border); margin: 12px 0;"></div>
                    <div style="display:flex; justify-content:space-between; font-size:1.1rem;">
                        <span>Estimated Cost</span>
                        <strong style="color: ${sufficientFunds ? 'white' : '#ef4444'};">₹${totalCostEst.toFixed(2)}</strong>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 12px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i data-lucide="wallet" style="width:18px;height:18px;color:var(--accent);"></i>
                        <span style="color:var(--text-dim);">Wallet Balance</span>
                    </div>
                    <strong style="font-size:1.1rem;">${walletBalanceDisplay}</strong>
                </div>
                
                ${!sufficientFunds ? `
                <div style="margin-top:16px; padding:12px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px; display:flex; gap:12px; align-items:flex-start;">
                    <i data-lucide="alert-triangle" style="width:18px;height:18px;color:#ef4444;flex-shrink:0;margin-top:2px;"></i>
                    <span style="color:#f87171; font-size:0.9rem;">Your wallet balance appears to be lower than the estimated cost. The broadcast may fail or partially deliver.</span>
                </div>` : ''}
            </div>
        `;

        // Render lucide icons in the dynamically constructed HTML shortly after it renders in the DOM
        setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 100);

        const broadcastConfirmed = await AppDialog.confirm(dialogHtml, {
            title: 'Confirm Broadcast Billing',
            confirmText: `Pay ₹${totalCostEst.toFixed(2)} & Send`,
            isHtml: true, // Custom flag to let AppDialog know message is raw HTML
            width: '450px'
        });

        if (!broadcastConfirmed) {
            return;
        }

        // Generate a unique broadcast ID for tracking individual message statuses
        const broadcastRef = firebase.database().ref('modules/whatsapp_sender/broadcast_history').push();
        const broadcastId = broadcastRef.key;
        
        const audienceText = audienceSelect.options[audienceSelect.selectedIndex] ? audienceSelect.options[audienceSelect.selectedIndex].text : audienceVal;

        // 1. Instantly log the campaign as "dispatching" so it appears in History immediately
        await broadcastRef.set({
            template: templateName,
            campaignName: campaignNameValue,
            message: templateName, 
            listId: audienceVal,
            listName: audienceText,
            successCount: recipients.length, 
            recipientsCount: recipients.length,
            sentCount: 0, // Starts at 0, Cloud Function will increment this
            deliveredCount: 0,
            readCount: 0,
            failedCount: 0,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            status: 'dispatching',
            variables: variables,
            headerImageUrl: headerImageUrl || null,
            broadcastId: broadcastId
        });

        AppDialog.toast(`Broadcast initiated. You can track progress in the History tab.`, 'success');
        
        // Switch to history view so they can watch live progress
        if (typeof this.switchView === 'function') {
            this.switchView('history');
        }

        // 2. Fire and forget the API call. The Cloud Function will run the background loop.
        this.sendBroadcastAPI({
            templateName,
            recipients,
            variables,
            broadcastId,
            headerImageUrl
        }).then(() => {

        }).catch(error => {
            console.error("Broadcast failed:", error);
            AppDialog.toast('Failed to send broadcast batch: ' + error.message, 'error');
        });
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
            <div class="wa-modal-body" style="max-height: 60vh; overflow-y: auto;">
                <label class="wa-modal-label">List Name</label>
                <input id="wa-new-list-name" class="wa-modal-input" type="text" placeholder="e.g. Parents, Students, Staff…" autocomplete="off">
                
                <div style="margin-top: 24px; border-top: 1px solid var(--border); padding-top: 16px;">
                    <label class="wa-modal-label" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>List Schema (Columns)</span>
                        <button type="button" class="btn btn-secondary btn-sm" id="wa-add-field-btn" style="padding: 4px 8px; font-size: 0.8rem;">
                            <i data-lucide="plus" style="width:12px;height:12px;"></i> Add Field
                        </button>
                    </label>
                    <p style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 12px;">Define custom fields available in this list. "Name" and "Phone Number" are required by default.</p>
                    
                    <div id="wa-schema-fields">
                        <div style="display:flex; gap:8px; margin-bottom:8px;">
                            <input class="wa-modal-input" type="text" value="Name (Required)" disabled style="cursor:not-allowed; opacity:0.7; margin-bottom:0;">
                        </div>
                        <div style="display:flex; gap:8px; margin-bottom:8px;">
                            <input class="wa-modal-input" type="text" value="Phone Number (Required)" disabled style="cursor:not-allowed; opacity:0.7; margin-bottom:0;">
                        </div>
                        <!-- Dynamic fields inserted here -->
                    </div>
                </div>

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

            // Gather custom fields
            const fieldInputs = overlay.querySelectorAll('.wa-custom-field-input');
            const customFields = [];
            fieldInputs.forEach(inp => {
                const val = inp.value.trim();
                if (val) customFields.push(val);
            });

            overlay.remove();
            const listRef = firebase.database().ref('modules/whatsapp_sender/custom_lists').push();
            listRef.set({
                name,
                customFields: customFields.length > 0 ? customFields : null,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                count: 0
            });
        });

        // Wire up the "Add Field" button after HTML insertion
        setTimeout(() => {
            const addBtn = document.getElementById('wa-add-field-btn');
            const fieldsContainer = document.getElementById('wa-schema-fields');
            if (addBtn && fieldsContainer) {
                addBtn.addEventListener('click', () => {
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.gap = '8px';
                    row.style.marginBottom = '8px';

                    row.innerHTML = `
                        <input class="wa-modal-input wa-custom-field-input" type="text" placeholder="New Field Name" style="margin-bottom:0;">
                        <button class="btn btn-icon btn-danger" type="button" onclick="this.parentElement.remove()" style="padding: 0 12px;">
                            <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                        </button>
                    `;
                    fieldsContainer.appendChild(row);
                    if (window.lucide) window.lucide.createIcons({ root: row });
                    row.querySelector('input').focus();
                });
            }
        }, 50);

        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.addContactModal = async function (listId) {
        // Fetch the list schema so we know which custom fields to show
        const listSnap = await firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}`).once('value');
        const listData = listSnap.val() || {};
        const customFields = listData.customFields || [];

        const customFieldsHTML = customFields.map(field => `
            <label class="wa-modal-label" style="margin-top:12px;">${field}</label>
            <input class="wa-modal-input wa-add-field-input" type="text" data-fieldname="${field}" placeholder="${field}" autocomplete="off">
        `).join('');

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
            <div class="wa-modal-body" style="max-height:60vh; overflow-y:auto;">
                <label class="wa-modal-label">Name <span style="color:var(--danger)">*</span></label>
                <input id="wa-contact-name" class="wa-modal-input" type="text" placeholder="Full name" autocomplete="off">
                <label class="wa-modal-label" style="margin-top:14px;">Phone Number <span style="color:var(--danger)">*</span></label>
                <input id="wa-contact-phone" class="wa-modal-input" type="tel" placeholder="+919876543210 (E.164 format)" autocomplete="off">
                ${customFieldsHTML}
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

            // Collect custom field values
            const entry = { name, phone, addedAt: firebase.database.ServerValue.TIMESTAMP };
            overlay.querySelectorAll('.wa-add-field-input').forEach(inp => {
                const key = inp.getAttribute('data-fieldname');
                const val = inp.value.trim();
                if (key) entry[key] = val;
            });

            overlay.remove();
            const listRef = firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}`);
            listRef.child('members').push(entry)
                .then(() => listRef.child('count').transaction(count => (count || 0) + 1));
        });
        if (window.lucide) window.lucide.createIcons();
    };


    window.whatsAppSender.editMemberModal = async function (listId, memberKey) {
        // Fetch the list schema and the member data
        const [listSnap, memberSnap] = await Promise.all([
            firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}`).once('value'),
            firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}/members/${memberKey}`).once('value')
        ]);

        const listData = listSnap.val();
        const memberData = memberSnap.val();
        if (!listData || !memberData) {
            AppDialog.toast('Could not load member data.', 'error');
            return;
        }

        const customFields = listData.customFields || [];

        // Collect ALL extra fields from the member object (not just schema fields)
        const systemKeys = new Set(['name', 'phone', 'addedAt']);
        const extraFieldsOnMember = Object.keys(memberData).filter(k => !systemKeys.has(k));
        // Merge schema fields + any extra fields on member
        const allFields = [...new Set([...customFields, ...extraFieldsOnMember])];

        let customFieldsHTML = allFields.map(field => `
            <label class="wa-modal-label" style="margin-top:12px;">${field}</label>
            <input class="wa-modal-input wa-edit-field-input" type="text" data-fieldname="${field}" value="${(memberData[field] || '').replace(/"/g, '&quot;')}" placeholder="${field}">
        `).join('');

        this._showModal(`
            <div class="wa-modal-header">
                <span class="wa-modal-title">
                    <i data-lucide="user-pen" style="width:18px;height:18px;color:var(--accent);"></i>
                    Edit Contact
                </span>
                <button class="btn-icon" data-wa-modal-close aria-label="Close">
                    <i data-lucide="x" style="width:16px;height:16px;"></i>
                </button>
            </div>
            <div class="wa-modal-body" style="max-height:60vh; overflow-y:auto;">
                <label class="wa-modal-label">Name <span style="color:var(--danger)">*</span></label>
                <input id="wa-edit-name" class="wa-modal-input" type="text" value="${(memberData.name || '').replace(/"/g, '&quot;')}" placeholder="Full name">
                <label class="wa-modal-label" style="margin-top:12px;">Phone Number <span style="color:var(--danger)">*</span></label>
                <input id="wa-edit-phone" class="wa-modal-input" type="tel" value="${(memberData.phone || '').replace(/"/g, '&quot;')}" placeholder="+91...">
                ${customFieldsHTML}
            </div>
            <div class="wa-modal-footer">
                <button class="btn btn-secondary" data-wa-modal-close>Cancel</button>
                <button class="btn btn-primary" data-wa-modal-submit>
                    <i data-lucide="check" style="width:14px;height:14px;"></i> Save Changes
                </button>
            </div>
        `, (overlay) => {
            const name = overlay.querySelector('#wa-edit-name').value.trim();
            const phone = overlay.querySelector('#wa-edit-phone').value.trim();
            if (!name) {
                overlay.querySelector('#wa-edit-name').style.borderColor = 'var(--danger, #f87171)';
                return;
            }
            if (!phone) {
                overlay.querySelector('#wa-edit-phone').style.borderColor = 'var(--danger, #f87171)';
                return;
            }

            // Gather custom field updates
            const updates = { name, phone };
            overlay.querySelectorAll('.wa-edit-field-input').forEach(inp => {
                const key = inp.getAttribute('data-fieldname');
                updates[key] = inp.value;
            });

            firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}/members/${memberKey}`).update(updates);
            overlay.remove();
        });
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.uploadCsvModal = async function (listId) {
        // Pre-fetch list schema to know what fields to ask for
        const listSnap = await firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}`).once('value');
        const listData = listSnap.val();
        if (!listData) {
            AppDialog.toast('List not found.', 'error');
            return;
        }

        const customFields = listData.customFields || [];

        // Generate HTML for dynamic selects based on custom fields
        let customSelectsHTML = '';
        customFields.forEach((field, index) => {
            const safeId = `wa-mapping-custom-${index}`;
            customSelectsHTML += `
                <div style="margin-bottom: 12px;">
                    <label style="display:block; margin-bottom:4px; font-weight:500; font-size:0.9rem;">${field}</label>
                    <select id="${safeId}" class="wa-modal-input wa-mapping-custom-select" data-fieldname="${field}" style="padding:8px; width:100%; border-radius:4px; border:1px solid var(--border); background:var(--surface);">
                        <option value="">Skip this field</option>
                    </select>
                </div>
            `;
        });

        this._showModal(`
            <div class="wa-modal-header">
                <span class="wa-modal-title">
                    <i data-lucide="upload" style="width:18px;height:18px;color:var(--accent);"></i>
                    Upload Contacts CSV
                </span>
                <button class="btn-icon" data-wa-modal-close aria-label="Close">
                    <i data-lucide="x" style="width:16px;height:16px;"></i>
                </button>
            </div>
            
            <!-- Step 1: File Selection -->
            <div id="wa-csv-step-1">
                <div class="wa-modal-body">
                    <p style="font-size:0.85rem;color:var(--text-dim);margin-bottom:12px;">Select your CSV file to begin. You will map your required columns in the next step.</p>
                    <input id="wa-csv-file" class="wa-modal-input" type="file" accept=".csv" style="padding:8px 0;">
                </div>
                <div class="wa-modal-footer">
                    <button class="btn btn-secondary" data-wa-modal-close>Cancel</button>
                    <button class="btn btn-primary" id="wa-csv-next-btn">
                        Next <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
                    </button>
                </div>
            </div>

            <!-- Step 2: Column Mapping -->
            <div id="wa-csv-step-2" style="display:none;">
                <div class="wa-modal-body" style="max-height: 50vh; overflow-y: auto;">
                    <p style="font-size:0.85rem;color:var(--text-dim);margin-bottom:12px;">Map the CSV columns to your directory fields.</p>
                    
                    <div style="margin-bottom: 12px;">
                        <label style="display:block; margin-bottom:4px; font-weight:500; font-size:0.9rem;">Name Column <span style="color:var(--danger)">*</span></label>
                        <select id="wa-mapping-name" class="wa-modal-input" style="padding:8px; width:100%; border-radius:4px; border:1px solid var(--border); background:var(--surface);">
                            <option value="">Select column...</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 12px;">
                        <label style="display:block; margin-bottom:4px; font-weight:500; font-size:0.9rem;">Phone Number Column <span style="color:var(--danger)">*</span></label>
                        <select id="wa-mapping-phone" class="wa-modal-input" style="padding:8px; width:100%; border-radius:4px; border:1px solid var(--border); background:var(--surface);">
                            <option value="">Select column...</option>
                        </select>
                    </div>

                    ${customFields.length > 0 ? '<div style="margin-top:20px; border-top:1px solid var(--border); padding-top:16px; margin-bottom:12px; font-weight:600; font-size:0.95rem;">Custom Directory Fields</div>' : ''}
                    ${customSelectsHTML}

                </div>
                <div class="wa-modal-footer">
                    <button class="btn btn-secondary" id="wa-csv-back-btn">Back</button>
                    <button class="btn btn-primary" id="wa-csv-custom-upload-btn">
                        <i data-lucide="upload" style="width:14px;height:14px;"></i> Upload
                    </button>
                </div>
            </div>
        `);

        // _showModal attaches the UI synchronously, so we can wire things up immediately
        const overlay = document.getElementById('wa-modal-overlay');
        if (!overlay) return;

        if (window.lucide) window.lucide.createIcons({ root: overlay });

        const step1 = overlay.querySelector('#wa-csv-step-1');
        const step2 = overlay.querySelector('#wa-csv-step-2');
        const fileInput = overlay.querySelector('#wa-csv-file');
        const nextBtn = overlay.querySelector('#wa-csv-next-btn');
        const backBtn = overlay.querySelector('#wa-csv-back-btn');
        const uploadBtn = overlay.querySelector('#wa-csv-custom-upload-btn');

        const phoneSelect = overlay.querySelector('#wa-mapping-phone');
        const nameSelect = overlay.querySelector('#wa-mapping-name');
        const customSelects = overlay.querySelectorAll('.wa-mapping-custom-select');

        let parsedHeaders = [];
        let parsedRows = [];

        // --- Step 1 to Step 2 Transition logic ---
        nextBtn.addEventListener('click', () => {
            const file = fileInput.files[0];
            if (!file) {
                AppDialog.toast('Please select a CSV file.', 'warn');
                return;
            }

            nextBtn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Reading...';
            nextBtn.disabled = true;
            if (window.lucide) window.lucide.createIcons({ root: nextBtn });

            const reader = new FileReader();
            reader.onload = (e) => {
                nextBtn.innerHTML = 'Next <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>';
                nextBtn.disabled = false;
                if (window.lucide) window.lucide.createIcons({ root: nextBtn });

                const text = e.target.result;
                parsedRows = text.split('\n');
                if (parsedRows.length < 2) {
                    AppDialog.toast('The CSV file seems to be empty or missing headers.', 'warn');
                    return;
                }

                parsedHeaders = parsedRows[0].split(',').map(h => {
                    let cleaned = h.trim().replace(/"/g, '');
                    const forbidden = ['.', '#', '$', '/', '[', ']'];
                    for (let c of forbidden) {
                        cleaned = cleaned.split(c).join('');
                    }
                    return cleaned;
                });

                // Populate Name and Phone selects
                phoneSelect.innerHTML = '<option value="">Select column...</option>';
                nameSelect.innerHTML = '<option value="">Select column...</option>';

                // Reset all Custom Field selects
                customSelects.forEach(sel => {
                    sel.innerHTML = '<option value="">Skip this field</option>';
                });

                // Populate all selects with CSV header options
                parsedHeaders.forEach((h, idx) => {
                    const optText = h || `Field${idx + 1}`;

                    const optName = document.createElement('option');
                    optName.value = idx;
                    optName.textContent = optText;
                    nameSelect.appendChild(optName);

                    const optPhone = document.createElement('option');
                    optPhone.value = idx;
                    optPhone.textContent = optText;
                    phoneSelect.appendChild(optPhone);

                    customSelects.forEach(sel => {
                        const optCustom = document.createElement('option');
                        optCustom.value = idx;
                        optCustom.textContent = optText;
                        sel.appendChild(optCustom);
                    });
                });

                // Simple auto-guess for base fields
                const lowerHeaders = parsedHeaders.map(h => h.toLowerCase());
                const guessNameIdx = lowerHeaders.findIndex(h => h.includes('name') && !h.includes('father') && !h.includes('mother'));
                if (guessNameIdx !== -1) nameSelect.value = guessNameIdx;

                const guessPhoneIdx = lowerHeaders.findIndex(h => h.includes('phone') || h.includes('number') || h.includes('contact'));
                if (guessPhoneIdx !== -1) phoneSelect.value = guessPhoneIdx;

                // Auto-guess for custom fields (exact or close match)
                customSelects.forEach(sel => {
                    const fieldName = sel.getAttribute('data-fieldname').toLowerCase();
                    const guessIdx = lowerHeaders.findIndex(h => h === fieldName || h.includes(fieldName));
                    if (guessIdx !== -1) sel.value = guessIdx;
                });

                step1.style.display = 'none';
                step2.style.display = 'block';
            };
            reader.onerror = () => {
                AppDialog.toast('Failed to read the file.', 'error');
                nextBtn.innerHTML = 'Next <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>';
                nextBtn.disabled = false;
            };
            reader.readAsText(file);
        });

        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            step2.style.display = 'none';
            step1.style.display = 'block';
        });

        // --- Step 2 Final Upload logic ---
        uploadBtn.addEventListener('click', () => {
            const phoneIdx = parseInt(phoneSelect.value);
            const nameIdx = parseInt(nameSelect.value);

            if (isNaN(phoneIdx) || isNaN(nameIdx)) {
                AppDialog.toast('Please select both a Name and a Phone Number column.', 'warn');
                return;
            }

            // Gather mapped indices for custom fields
            const mappedCustomFields = [];
            customSelects.forEach(sel => {
                const idx = parseInt(sel.value);
                if (!isNaN(idx)) {
                    mappedCustomFields.push({
                        fieldName: sel.getAttribute('data-fieldname'),
                        colIdx: idx
                    });
                }
            });

            uploadBtn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Uploading...';
            uploadBtn.disabled = true;
            if (window.lucide) window.lucide.createIcons({ root: uploadBtn });

            const listRef = firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}`);
            const timestamp = firebase.database.ServerValue.TIMESTAMP;
            let addedCount = 0;
            let updates = {};

            for (let i = 1; i < parsedRows.length; i++) {
                const rowText = parsedRows[i].trim();
                if (!rowText) continue;

                let row = [];
                let inQuotes = false;
                let currentVal = '';
                for (let char of rowText) {
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        row.push(currentVal);
                        currentVal = '';
                    } else {
                        currentVal += char;
                    }
                }
                row.push(currentVal);
                row = row.map(c => c.trim().replace(/"/g, ''));

                if (row.length <= Math.max(phoneIdx, nameIdx)) continue;

                let phone = row[phoneIdx];
                let name = row[nameIdx];
                if (!phone || !name) continue;

                phone = phone.replace(/[^\d+]/g, '');
                if (!phone.startsWith('+')) {
                    if (phone.length === 10) phone = '+91' + phone;
                    else phone = '+' + phone;
                }

                // Explicit schema mapping! Only the requested mapped fields go into memberData.
                const memberData = {
                    addedAt: timestamp,
                    phone: phone,
                    name: name
                };

                mappedCustomFields.forEach(mapping => {
                    const cellValue = row[mapping.colIdx];
                    if (cellValue !== undefined && cellValue !== "") {
                        // Apply sanitization to the key just in case, though it comes from defined field
                        let safeKey = mapping.fieldName;
                        const forbidden = ['.', '#', '$', '/', '[', ']'];
                        for (let c of forbidden) { safeKey = safeKey.split(c).join(''); }

                        memberData[safeKey] = cellValue;
                    }
                });

                const newKey = listRef.child('members').push().key;
                updates[`members/${newKey}`] = memberData;
                addedCount++;
            }

            if (addedCount > 0) {
                listRef.update(updates).then(() => {
                    listRef.child('count').transaction(count => (count || 0) + addedCount);
                    overlay.remove();
                    AppDialog.toast(`Successfully mapped and added ${addedCount} contacts.`, 'success');
                }).catch(err => {
                    AppDialog.toast('Failed to upload: ' + err.message, 'error');
                    overlay.remove();
                });
            } else {
                AppDialog.toast("No valid contacts found to add. Ensure Name and Phone aren't empty.", 'warn');
                uploadBtn.innerHTML = '<i data-lucide="upload" style="width:14px;height:14px;"></i> Upload';
                uploadBtn.disabled = false;
                if (window.lucide) window.lucide.createIcons({ root: uploadBtn });
            }
        });
    };

    window.whatsAppSender.removeMemberFromList = async function (listId, memberKey) {
        const confirmed = await AppDialog.confirm('Remove this contact from the list?', { danger: true, confirmText: 'Remove', title: 'Remove Contact' });
        if (!confirmed) return;

        const listRef = firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}`);
        listRef.child(`members/${memberKey}`).remove().then(() => {
            listRef.child('count').transaction(count => (count || 1) - 1);
        });
    };

    window.whatsAppSender.deleteList = async function (listId) {
        const confirmed = await AppDialog.confirm('Delete this entire list? This action cannot be undone.', { danger: true, confirmText: 'Delete List', title: 'Delete List' });
        if (!confirmed) return;
        firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}`).remove();
        this.renderListsView();
    };

}
