
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
        // 1. Subscribe to Configuration in Firestore
        if (this._configUnsubscribe) this._configUnsubscribe();

        this._configUnsubscribe = firestore.collection('modules').doc('whatsapp_sender').collection('config').doc('main')
            .onSnapshot((doc) => {
                this.config = doc.data();
                this.render();
            });

        // 2. Subscribe to Templates in Firestore
        if (this._templatesUnsubscribe) this._templatesUnsubscribe();
        this._templatesUnsubscribe = firestore.collection('modules').doc('whatsapp_sender').collection('templates')
            .onSnapshot((snapshot) => {
                this.templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (this.currentView === 'broadcast' && typeof this.renderBroadcastView === 'function') {
                    this.renderBroadcastView();
                }
            });

        // 3. Subscribe to Conversations (Metadata from RTDB)
        if (this._convosUnsubscribe) this._convosUnsubscribe();

        const convosRef = firebase.database().ref('modules/whatsapp_sender/conversations');
        const listener = convosRef.on('value', (snapshot) => {
            const data = snapshot.val() || {};
            this.conversations = {};
            Object.entries(data).forEach(([key, val]) => {
                if (val.metadata) {
                    this.conversations[val.metadata.phoneNumber || key] = val.metadata;
                }
            });

            if (this.currentView === 'chats') {
                this.renderConversationList();
            }
        });
        this._convosUnsubscribe = () => convosRef.off('value', listener);
    };

    window.whatsAppSender.subscribeToMessages = function (phoneNumber) {
        if (this._messagesUnsubscribe) this._messagesUnsubscribe();

        const safeKey = phoneNumber.replace(/[.#$/[\]]/g, '_');
        const messagesRef = firebase.database().ref(`modules/whatsapp_sender/conversations/${safeKey}/messages`);

        const listener = messagesRef.orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
            const messages = [];
            snapshot.forEach(child => {
                messages.push({ key: child.key, ...child.val() });
            });
            this.activeMessages = messages;
            this.renderMessages();

            // Reset unread count in RTDB
            firebase.database().ref(`modules/whatsapp_sender/conversations/${safeKey}/metadata`).update({ unreadCount: 0 }).catch(() => { });
        });

        this._messagesUnsubscribe = () => messagesRef.off('value', listener);
    };

    window.whatsAppSender.loadLists = function () {
        if (this._listsUnsubscribe) this._listsUnsubscribe();
        this._listsUnsubscribe = firestore.collection('modules').doc('whatsapp_sender').collection('lists').onSnapshot((querySnapshot) => {
            const data = {};
            querySnapshot.forEach((doc) => {
                data[doc.id] = doc.data();
            });
            this.lists = data;

            if (this.currentView === 'lists' && typeof this.renderLists === 'function') {
                this.renderLists();
            }

            // Gracefully update the audience dropdown without rerendering the entire broadcast view
            const audienceSelect = document.getElementById('wa-broadcast-audience');
            if (audienceSelect) {
                const currentValue = audienceSelect.value;

                audienceSelect.innerHTML = `<option value="none" disabled selected>-- Choose Audience --</option>` +
                    Object.entries(this.lists).map(([id, list]) =>
                        `<option value="list:${id}">${list.name} (${list.contactsCount ?? list.count ?? 0})</option>`
                    ).join('');

                // Try to keep the previously selected value
                if (Array.from(audienceSelect.options).some(opt => opt.value === currentValue)) {
                    audienceSelect.value = currentValue;
                } else {
                    audienceSelect.value = 'none'; // Fallback
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
        if (!proceed) return;

        const recipient = this.activeConversationId;
        if (!recipient) return;

        input.value = '';
        input.focus();

        try {
            const safeKey = recipient.replace(/[.#$/[\]]/g, '_');
            const messagesRef = firebase.database().ref(`modules/whatsapp_sender/conversations/${safeKey}/messages`);
            const newMessageRef = messagesRef.push();
            const timestamp = Date.now();

            await newMessageRef.set({
                message: text,
                direction: 'outbound',
                status: 'processing',
                timestamp: timestamp,
                to: recipient,
                from: this.config.phoneNumber
            });

            await firebase.database().ref(`modules/whatsapp_sender/conversations/${safeKey}/metadata`).update({
                lastMessage: text,
                timestamp: timestamp,
                phoneNumber: recipient,
                displayName: this.conversations[recipient]?.displayName || recipient
            });

            const data = await this.sendMessageAPI(recipient, text);
            const realMessageId = data.messages?.[0]?.id || data.message_id || data.id;

            await newMessageRef.update({
                status: 'sent',
                messageId: realMessageId
            });

        } catch (error) {
            console.error("Send Failed:", error);
            AppDialog.toast('Failed to send message: ' + error.message, 'error');
        }
    };

    window.whatsAppSender.prepareBroadcast = async function () {
        const select = document.getElementById('wa-template-select');
        const audienceSelect = document.getElementById('wa-broadcast-audience');
        const inputs = document.querySelectorAll('.wa-var-input');
        const isSimulation = document.getElementById('wa-broadcast-simulate')?.checked || false;
        const sendBtn = document.getElementById('wa-broadcast-send-btn');

        if (!select || !select.value) {
            AppDialog.toast('Please select a template first.', 'warn');
            return;
        }

        const templateName = select.value;
        const selectedOption = select.options[select.selectedIndex];
        const templateCategory = selectedOption.getAttribute('data-category') || 'UNKNOWN';
        const campaignNameValue = document.getElementById('wa-campaign-name')?.value?.trim() || templateName;

        const audienceVal = audienceSelect.value;
        if (!audienceVal || audienceVal === 'none') {
            AppDialog.toast('Please select an audience.', 'warn');
            return;
        }

        // Show loading state on button
        const originalBtnHtml = sendBtn ? sendBtn.innerHTML : '';
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = `<i data-lucide="loader" class="animation-spin" style="width:16px;height:16px;margin-right:8px;"></i> Calculating Bill...`;
            if (window.lucide) window.lucide.createIcons({ root: sendBtn });
        }

        try {
            const variables = Array.from(inputs)
                .filter(inp => inp.id !== 'wa-header-media-url')
                .map(inp => inp.value);

            const customMediaUrl = document.getElementById('wa-header-media-url')?.value;
            const needsImageHeader = selectedOption.getAttribute('data-needs-image') === 'true';
            const headerImageUrl = customMediaUrl || selectedOption.getAttribute('data-header-image') || null;

            // 1. Check for empty variables
            if (variables.some(v => v.trim() === '')) {
                const proceed = await AppDialog.confirm('Some template variables are empty. Do you want to proceed?', { title: 'Empty Variables', confirmText: 'Proceed Anyway' });
                if (!proceed) {
                    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = originalBtnHtml; if (window.lucide) window.lucide.createIcons({ root: sendBtn }); }
                    return;
                }
            }

            // 2. Check for missing header image if required
            if (needsImageHeader && !headerImageUrl) {
                const proceed = await AppDialog.confirm('This template requires a header image, but none is selected. Do you want to proceed without an image?', { title: 'Missing Image', confirmText: 'Proceed Anyway' });
                if (!proceed) {
                    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = originalBtnHtml; if (window.lucide) window.lucide.createIcons({ root: sendBtn }); }
                    return;
                }
            }

            const recipients = await this._getCurrentlySelectedRecipients();
            if (recipients.length === 0) {
                AppDialog.toast('No recipients found for this audience.', 'warn');
                if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = originalBtnHtml; if (window.lucide) window.lucide.createIcons({ root: sendBtn }); }
                return;
            }

            const excluded = this.excludedNumbers || [];
            const excludedSet = new Set(excluded.map(n => n.replace(/[^\d]/g, "")));
            const activeRecipients = recipients.filter(r => !excludedSet.has(r.phone.replace(/[^\d]/g, "")));

            let ratePerMsg = 0.95;
            let rateType = 'Marketing Rate';
            if (templateCategory.toUpperCase() === 'UTILITY') {
                ratePerMsg = 0.25;
                rateType = 'Utility Rate';
            }
            const totalCostEst = activeRecipients.length * ratePerMsg;
            const contactsCount = [...new Set(recipients.map(r => r.name))].length;

            const dialogHtml = `
                <div style="text-align:left; margin-top: 10px;">
                    <p style="color:var(--text-dim); margin-bottom: 24px; font-size:0.95rem; line-height:1.5;">You are about to launch a broadcast campaign. Please review the billing summary and recipient breakdown below.</p>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:24px;">
                        <div style="background:rgba(var(--accent-rgb), 0.05); border:1px solid rgba(var(--accent-rgb), 0.1); border-radius:16px; padding:16px;">
                            <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; font-weight:700;">Campaign</div>
                            <div style="font-weight:800; color:var(--text-main); font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${campaignNameValue}</div>
                        </div>
                        <div style="background:rgba(59, 130, 246, 0.05); border:1px solid rgba(59, 130, 246, 0.1); border-radius:16px; padding:16px;">
                            <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; font-weight:700;">Template</div>
                            <div style="font-weight:800; color:#3b82f6; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${templateName}</div>
                        </div>
                    </div>

                    <div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 20px; padding: 20px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                            <span style="color:var(--text-dim); font-weight:600; display:flex; align-items:center; gap:8px;">
                                <i data-lucide="users" style="width:16px;height:16px;opacity:0.7;"></i> Target Recipients
                            </span>
                            <strong style="color:var(--text-main); font-size:1.1rem;">${recipients.length}</strong>
                        </div>
                        
                        ${excluded.length > 0 ? `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; color:#ef4444;">
                            <span style="font-weight:600; display:flex; align-items:center; gap:8px;">
                                <i data-lucide="user-minus" style="width:16px;height:16px;opacity:0.7;"></i> Smart-Excluded
                            </span>
                            <strong style="font-size:1.1rem;">-${excluded.length}</strong>
                        </div>
                        ` : ''}

                        <div style="height:1px; background:var(--border); margin: 16px 0; opacity:0.5;"></div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <span style="color:var(--text-dim); font-weight:600;">Billable Messages</span>
                            <strong style="color:var(--text-main); font-size:1.2rem;">${activeRecipients.length}</strong>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                            <span style="color:var(--text-dim); font-weight:600;">
                                Unit Price <span style="font-size:0.7rem; font-weight:800; background:rgba(245, 158, 11, 0.1); color:#f59e0b; padding:2px 6px; border-radius:4px; margin-left:4px; text-transform:uppercase;">${rateType}</span>
                            </span>
                            <strong style="color:var(--text-main);">₹${ratePerMsg.toFixed(2)}</strong>
                        </div>

                        <div style="background:rgba(37, 211, 102, 0.08); border:1px solid rgba(37, 211, 102, 0.2); border-radius:12px; padding:16px; display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:#25D366; font-weight:800; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.02em;">Estimated Cost</span>
                            <strong style="color:#25D366; font-size:1.6rem; font-weight:900;">₹${totalCostEst.toFixed(2)}</strong>
                        </div>
                    </div>

                    <div style="background:rgba(245, 158, 11, 0.05); border-left:4px solid #f59e0b; padding:12px 16px; border-radius:4px 12px 12px 4px; display:flex; gap:12px; align-items:center;">
                        <i data-lucide="info" style="width:20px;height:20px;color:#f59e0b;flex-shrink:0;"></i>
                        <p style="font-size:0.8rem; color:var(--text-dim); margin:0;">Costs are estimated based on WABA categories. Final billing may vary based on conversation windows.</p>
                    </div>
                </div>`;

            // Reset button state before showing confirmation
            if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = originalBtnHtml; if (window.lucide) window.lucide.createIcons({ root: sendBtn }); }

            const confirmed = await AppDialog.confirm(dialogHtml, {
                title: 'Launch Broadcast',
                confirmText: `Launch Campaign`,
                confirmButtonClass: 'btn-primary',
                isHtml: true,
                width: '500px'
            });
            if (!confirmed) return;

            const broadcastRef = firestore.collection('modules').doc('whatsapp_sender').collection('history').doc();
            const broadcastId = broadcastRef.id;

            // We send the FULL list to the backend. The backend will instantly 
            // batch-log the exclusions and then proceed with active recipients.
            // This ensures exclusions are ALWAYS in the report even if stopped midway.
            const fullRecipients = recipients;
            const finalExcluded = excluded;

            await broadcastRef.set({
                template: templateName,
                campaignName: campaignNameValue,
                listName: audienceSelect.options[audienceSelect.selectedIndex].text,
                recipientsCount: fullRecipients.length,
                contactsCount: contactsCount,
                sentCount: 0, 
                deliveredCount: 0, 
                readCount: 0, 
                failedCount: 0,
                excludedCount: finalExcluded.length,
                processingCount: 0,
                queuedCount: fullRecipients.length - finalExcluded.length,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'dispatching',
                broadcastId: broadcastId,
                isSimulation: isSimulation
            });

            if (!isSimulation && audienceVal.startsWith('list:')) {
                firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(audienceVal.split(':')[1]).update({ used: true });
            }

            AppDialog.toast('Broadcast initiated. Opening report...', 'success');
            this.viewBroadcastDetails(broadcastId, broadcastRef.id);

            if (isSimulation) {
                this.startLocalSimulation(broadcastId, activeRecipients);
            } else {
                this.sendBroadcastAPI({
                    templateName,
                    recipients: fullRecipients, // SEND FULL LIST
                    variables,
                    broadcastId,
                    headerImageUrl,
                    contactsCount,
                    excludedNumbers: finalExcluded
                }).then(() => {
                    this.excludedNumbers = [];
                }).catch(e => {
                    AppDialog.toast('Broadcast failed: ' + e.message, 'error');
                });
            }
        } catch (error) {
            console.error("Preparation Failed:", error);
            AppDialog.toast('Failed to prepare broadcast: ' + error.message, 'error');
            if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = originalBtnHtml; if (window.lucide) window.lucide.createIcons({ root: sendBtn }); }
        }
    };

    window.whatsAppSender.stopBroadcast = async function (logId) {
        const confirmed = await AppDialog.confirm('Are you sure you want to stop this broadcast? Messages already in queue will still be sent.', {
            title: 'Stop Broadcast',
            confirmText: 'Stop Now',
            danger: true
        });
        if (!confirmed) return;

        try {
            await firestore.collection('modules').doc('whatsapp_sender').collection('history').doc(logId).update({
                stopRequested: true,
                status: 'stopped'
            });
            AppDialog.toast('Stop request sent.', 'info');
        } catch (e) {
            AppDialog.toast('Failed to stop: ' + e.message, 'error');
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

            // Create list in Firestore
            const listRef = firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc();
            listRef.set({
                name,
                customFields: customFields.length > 0 ? customFields : null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                count: 0
            }).then(() => {
                overlay.remove();
                AppDialog.toast('List created successfully.', 'success');
                // Auto open the new list
                setTimeout(() => this.viewListDetails(listRef.id), 500);
            }).catch(e => {
                AppDialog.toast('Failed to create list: ' + e.message, 'error');
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
        const listSnap = await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).get();
        const listData = listSnap.data() || {};
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
            const listRef = firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId);
            listRef.collection('members').add(entry)
                .then(() => this.recalculateListCounts(listId));
        });
        if (window.lucide) window.lucide.createIcons();
    };


    window.whatsAppSender.editMemberModal = async function (listId, memberKey) {
        // Fetch the list schema and the member data from Firestore
        const listRef = firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId);
        const [listSnap, memberSnap] = await Promise.all([
            listRef.get(),
            listRef.collection('members').doc(memberKey).get()
        ]);

        const listData = listSnap.data();
        const memberData = memberSnap.data();
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

            listRef.collection('members').doc(memberKey).update(updates).then(() => {
                AppDialog.toast('Contact updated.', 'success');
                this.recalculateListCounts(listId);
            });
            overlay.remove();
        });
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.uploadCsvModal = async function (listId) {
        // Pre-fetch list schema to know what fields to ask for from Firestore
        const listRef = firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId);
        const listSnap = await listRef.get();
        const listData = listSnap.data();
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
                    <select id="${safeId}" multiple class="wa-modal-input wa-mapping-custom-select" data-fieldname="${field}" style="padding:8px; width:100%; border-radius:4px; border:1px solid var(--border); background:var(--surface); height: 100px;">
                    </select>
                    <div style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">Hold Ctrl/Cmd to merge multiple columns (comma-separated).</div>
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
                        <label style="display:block; margin-bottom:4px; font-weight:500; font-size:0.9rem;">Name Column(s) <span style="color:var(--danger)">*</span></label>
                        <select id="wa-mapping-name" multiple class="wa-modal-input" style="padding:8px; width:100%; border-radius:4px; border:1px solid var(--border); background:var(--surface); height: 100px;">
                        </select>
                        <div style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">Hold Ctrl/Cmd to merge multiple columns (e.g. First + Last Name).</div>
                    </div>

                    <div style="margin-bottom: 12px;">
                        <label style="display:block; margin-bottom:4px; font-weight:500; font-size:0.9rem;">Phone Number(s) <span style="color:var(--danger)">*</span></label>
                        <select id="wa-mapping-phone" multiple class="wa-modal-input" style="padding:8px; width:100%; border-radius:4px; border:1px solid var(--border); background:var(--surface); height: 100px;">
                        </select>
                        <div style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">Hold Ctrl/Cmd to select multiple (comma-separated).</div>
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
                phoneSelect.innerHTML = '';
                nameSelect.innerHTML = '';

                // Reset all Custom Field selects
                customSelects.forEach(sel => {
                    sel.innerHTML = '';
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
                if (guessNameIdx !== -1 && nameSelect.options[guessNameIdx]) nameSelect.options[guessNameIdx].selected = true;

                const guessPhoneIdx = lowerHeaders.findIndex(h => h.includes('phone') || h.includes('number') || h.includes('contact'));
                if (guessPhoneIdx !== -1 && phoneSelect.options[guessPhoneIdx]) phoneSelect.options[guessPhoneIdx].selected = true;

                // Auto-guess for custom fields (exact or close match)
                customSelects.forEach(sel => {
                    const fieldName = sel.getAttribute('data-fieldname').toLowerCase();
                    const guessIdx = lowerHeaders.findIndex(h => h === fieldName || h.includes(fieldName));
                    if (guessIdx !== -1 && sel.options[guessIdx]) sel.options[guessIdx].selected = true;
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
        uploadBtn.addEventListener('click', async () => {
            const phoneIdxs = Array.from(phoneSelect.selectedOptions).map(opt => parseInt(opt.value)).filter(v => !isNaN(v));
            const nameIdxs = Array.from(nameSelect.selectedOptions).map(opt => parseInt(opt.value)).filter(v => !isNaN(v));

            if (phoneIdxs.length === 0 || nameIdxs.length === 0) {
                AppDialog.toast('Please select at least one Name and Phone Number column.', 'warn');
                return;
            }

            // Gather mapped indices for custom fields
            const mappedCustomFields = [];
            customSelects.forEach(sel => {
                const idxs = Array.from(sel.selectedOptions).map(opt => parseInt(opt.value)).filter(v => !isNaN(v));
                if (idxs.length > 0) {
                    mappedCustomFields.push({
                        fieldName: sel.getAttribute('data-fieldname'),
                        colIdxs: idxs
                    });
                }
            });

            uploadBtn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Uploading...';
            uploadBtn.disabled = true;
            if (window.lucide) window.lucide.createIcons({ root: uploadBtn });

            const timestamp = firebase.firestore.FieldValue.serverTimestamp();
            let addedCount = 0;
            const membersColl = listRef.collection('members');
            let batch = firestore.batch();
            let batchCount = 0;

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

                let nameParts = [];
                for (let idx of nameIdxs) {
                    if (row[idx]) nameParts.push(row[idx]);
                }
                let name = nameParts.join(' ').trim();

                let phoneParts = [];
                for (let idx of phoneIdxs) {
                    let p = row[idx];
                    if (p) {
                         p = p.replace(/[^\d+]/g, '');
                         if (p.length >= 10) {
                             if (!p.startsWith('+')) {
                                 if (p.length === 10) p = '+91' + p;
                                 else p = '+' + p;
                             }
                             phoneParts.push(p);
                         }
                    }
                }
                let phone = phoneParts.join(','); 
                if (!phone || !name) continue;

                // Explicit schema mapping! Only the requested mapped fields go into memberData.
                const memberData = {
                    addedAt: timestamp,
                    phone: phone,
                    name: name
                };

                mappedCustomFields.forEach(mapping => {
                    let parts = [];
                    mapping.colIdxs.forEach(idx => {
                        if (row[idx] !== undefined && row[idx] !== "") parts.push(row[idx]);
                    });
                    if (parts.length > 0) {
                        memberData[mapping.fieldName] = parts.join(', ');
                    }
                });

                const newMemberRef = membersColl.doc();
                batch.set(newMemberRef, memberData);
                addedCount++;
                batchCount++;

                if (batchCount >= 450) { // Limit per batch is 500
                    await batch.commit();
                    batch = firestore.batch();
                    batchCount = 0;
                }
            }

            if (addedCount > 0) {
                if (batchCount > 0) await batch.commit();
                this.recalculateListCounts(listId);
                overlay.remove();
                AppDialog.toast(`Successfully mapped and added ${addedCount} contacts.`, 'success');
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

        try {
            await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).collection('members').doc(memberKey).delete();
            this.recalculateListCounts(listId);
            AppDialog.toast('Contact removed.', 'success');
        } catch (e) {
            AppDialog.toast('Failed to remove contact: ' + e.message, 'error');
        }
    };

    window.whatsAppSender.deleteList = async function (listId) {
        const listSnap = await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).get();
        if (listSnap.data()?.used === true) {
            AppDialog.toast('This list has been used in a broadcast and cannot be deleted.', 'error');
            return;
        }

        const confirmed = await AppDialog.confirm('Delete this entire list? This action cannot be undone.', { danger: true, confirmText: 'Delete List', title: 'Delete List' });
        if (!confirmed) return;
        firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).delete();
        this.renderListsView();
    };

    window.whatsAppSender._getCurrentlySelectedRecipients = async function () {
        const val = document.getElementById('wa-broadcast-audience').value;
        let recipients = [];
        const addRecipient = (phone, name) => {
            if (!phone) return;
            phone.split(/[\/,;]/).forEach(num => {
                let cleaned = num.trim().replace(/[^\d]/g, '');
                if (cleaned.length >= 10) {
                    if (cleaned.length === 10) cleaned = '91' + cleaned;
                    recipients.push({ phone: cleaned, name: name || cleaned });
                }
            });
        };

        if (val.startsWith('list:')) {
            const snap = await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(val.split(':')[1]).collection('members').get();
            snap.docs.forEach(doc => addRecipient(doc.data().phone, doc.data().name));
        }

        const seen = new Set();
        return recipients.filter(r => seen.has(r.phone) ? false : seen.add(r.phone));
    };

    window.whatsAppSender.scanForDuplicates = async function () {
        const template = document.getElementById('wa-template-select').value;
        const days = parseInt(document.getElementById('wa-duplicate-days').value) || 7;
        const resultsEl = document.getElementById('wa-scanner-results');
        if (!template) return;

        resultsEl.innerHTML = '<i data-lucide="loader" style="animation:spin 1s linear infinite;"></i> Scanning...';
        try {
            const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
            const historySnap = await firestore.collection('modules').doc('whatsapp_sender').collection('history')
                .where('timestamp', '>=', new Date(cutoff)).get();

            const bIds = historySnap.docs.filter(doc => doc.data().template === template).map(doc => doc.id);
            const dupPhones = new Set();

            for (const bId of bIds) {
                const snap = await firebase.database().ref('modules/whatsapp_sender/broadcast_logs').orderByChild('broadcastId').equalTo(bId).once('value');
                Object.values(snap.val() || {}).forEach(log => {
                    const status = (log.status || '').toLowerCase();
                    if (log.status !== 'failed' && (log.recipientId || log.phone)) {
                        const phone = log.recipientId || log.phone;
                        dupPhones.add(String(phone).replace(/\D/g, ''));
                    }
                });
            }

            const current = await this._getCurrentlySelectedRecipients();
            const found = current.filter(r => dupPhones.has(r.phone.replace(/\D/g, '')));

            if (found.length === 0) {
                resultsEl.innerHTML = '<span style="color:#4ade80;">No duplicates found.</span>';
                this.excludedNumbers = [];
            } else {
                resultsEl.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(245,158,11,0.1); padding:8px 12px; border-radius:6px; border:1px solid rgba(245,158,11,0.2);">
                    <span style="color:#f59e0b; font-weight:600;">${found.length} Duplicates Found</span>
                    <button class="btn btn-secondary" onclick="window.whatsAppSender.showExclusionModal()" style="padding:4px 10px; font-size:0.7rem; height:auto;">Exclude</button>
                </div>`;
                this.foundDuplicates = found;
                this.excludedNumbers = found.map(r => r.phone);
            }
            if (window.lucide) window.lucide.createIcons({ root: resultsEl });
        } catch (e) { resultsEl.innerHTML = '<span style="color:var(--danger);">Scan failed.</span>'; }
    };

    window.whatsAppSender.showExclusionModal = function () {
        const duplicates = this.foundDuplicates || [];
        const html = `
            <div style="padding:24px;">
                <h3 style="margin-bottom:16px;">Exclude Recent Recipients</h3>
                <div style="max-height:300px; overflow-y:auto; margin-bottom:20px;">
                    ${duplicates.map(r => `
                        <label style="display:flex; align-items:center; gap:12px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; margin-bottom:8px; cursor:pointer;">
                            <input type="checkbox" class="wa-exclude-check" value="${r.phone}" ${this.excludedNumbers.includes(r.phone) ? 'checked' : ''}>
                            <div><div style="font-weight:600;">${r.name}</div><div style="font-size:0.75rem; color:var(--text-dim);">${r.phone}</div></div>
                        </label>`).join('')}
                </div>
                <button class="btn btn-primary full-width" data-wa-modal-submit>Apply Exclusion</button>
            </div>`;
        this._showModal(html, (overlay) => {
            this.excludedNumbers = Array.from(overlay.querySelectorAll('.wa-exclude-check:checked')).map(cb => cb.value);
            overlay.remove();
            AppDialog.toast(`${this.excludedNumbers.length} recipients excluded.`, 'info');
        });
    };

    window.whatsAppSender.recalculateListCounts = async function (listId) {
        try {
            const membersSnap = await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).collection('members').get();
            let cCount = 0;
            const allPhones = new Set();
            membersSnap.forEach(doc => {
                cCount++;
                const phones = String(doc.data().phone || "").split(/[\/,;]/).map(n => n.trim().replace(/[^\d]/g, '')).filter(n => n.length >= 10);
                phones.forEach(p => allPhones.add(p));
            });
            await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).update({
                contactsCount: cCount,
                numbersCount: allPhones.size,
                count: cCount
            });
        } catch (e) { console.error(e); }
    };

}
