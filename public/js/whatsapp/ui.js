
/**
 * WhatsApp Sender Module - UI Layer
 * Handles DOM manipulation and View Rendering
 */

if (!window.whatsAppSender) {
    console.error("WhatsApp Handler: State not initialized. Load state.js first.");
} else {

    window.whatsAppSender.render = function () {
        switch (this.currentView) {
            case 'chats': if (this.renderConversationList) this.renderConversationList(); break;
            case 'broadcast': if (this.renderBroadcastView) this.renderBroadcastView(); break;
            case 'history': if (this.renderHistoryView) this.renderHistoryView(); break;
            case 'lists': if (this.renderListsView) this.renderListsView(); break;
        }
    };

    /**
     * Format WhatsApp/Meta specific Markdown (bold, italic, strikethrough, monospace)
     * @param {string} text - Raw message text
     * @returns {string} - Formatted HTML
     */
    window.whatsAppSender.formatWhatsAppText = function (text) {
        if (!text) return "";
        
        // Escape existing HTML to prevent injection
        let formatted = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // Apply Meta formatting
        // *bold* -> <b>bold</b>
        // _italic_ -> <i>italic</i>
        // ~strikethrough~ -> <strike>strikethrough</strike>
        // ```monospace``` -> <code>monospace</code>
        
        formatted = formatted
            .replace(/\*(.*?)\*/g, "<b>$1</b>")
            .replace(/_(.*?)_/g, "<i>$1</i>")
            .replace(/~(.*?)~/g, "<strike>$1</strike>")
            .replace(/```([\s\S]*?)```/g, "<code>$1</code>")
            .replace(/\n/g, "<br>"); // Also handle newlines

        return formatted;
    };

    /**
     * Escape a string for safe HTML insertion
     * @param {string} text
     * @returns {string}
     */
    window.whatsAppSender.escapeHtml = function (text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };

    // --- Main Render & Navigation ---

    window.whatsAppSender.switchView = function (viewName) {
        this.currentView = viewName;
        
        // Update URL hash to persist state on reload (e.g., #whatsapp/broadcast)
        window.location.hash = `whatsapp/${viewName}`;

        // Update Sidebar
        document.querySelectorAll('#sidebar-nav-whatsapp .nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-whatsapp-${viewName}`);
        if (activeNav) activeNav.classList.add('active');

        // Update View Containers
        document.querySelectorAll('.whatsapp-subview').forEach(el => el.style.display = 'none');
        const activeView = document.getElementById(`whatsapp-view-${viewName}`);
        if (activeView) activeView.style.display = 'block';

        this.render();
        if (typeof closeSidebar === 'function') closeSidebar();
    };

    window.whatsAppSender.render = function () {
        if (!window.location.hash.startsWith('#whatsapp')) return;

        const subtitle = document.getElementById('whatsapp-screen-subtitle');
        if (subtitle) {
            subtitle.innerText = this.config?.apiKey ? 'Inbox - 2-Way Messaging' : 'Fast2SMS API configuration pending';
        }

        // Permission-based tab visibility
        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const waPerms = userData.permissions?.whatsapp_sender || {};
        const isMaster = isAdmin || waPerms === true;

        const broadcastNav = document.getElementById('nav-whatsapp-broadcast');
        const listsNav = document.getElementById('nav-whatsapp-lists');
        const historyNav = document.getElementById('nav-whatsapp-history');
        if (broadcastNav) broadcastNav.style.display = (isMaster || waPerms.broadcast) ? 'flex' : 'none';
        if (listsNav) listsNav.style.display = (isMaster || waPerms.lists) ? 'flex' : 'none';
        if (historyNav) historyNav.style.display = (isMaster || waPerms.history) ? 'flex' : 'none';

        // Fallback if trying to access a restricted view
        if (this.currentView === 'broadcast' && !(isMaster || waPerms.broadcast)) {
            this.currentView = 'chats';
        }
        if (this.currentView === 'lists' && !(isMaster || waPerms.lists)) {
            this.currentView = 'chats';
        }
        if (this.currentView === 'history' && !(isMaster || waPerms.history)) {
            this.currentView = 'chats';
        }

        // Router for sub-views
        if (this.currentView === 'chats') {
            this.renderChatsView();
        } else if (this.currentView === 'broadcast') {
            this.renderBroadcastView();
        } else if (this.currentView === 'history') {
            this.renderHistoryView();
        } else if (this.currentView === 'lists') {
            this.renderListsView();
        }

        if (window.lucide) window.lucide.createIcons();
    };


    // --- Chats View ---

    window.whatsAppSender.renderChatsView = function () {
        const container = document.getElementById('whatsapp-view-chats');
        const actualContainer = document.getElementById('whatsapp-content-chats');

        if (!actualContainer) return;

        // Only render structure once to avoid losing focus/scroll
        if (!actualContainer.innerHTML.includes('whatsapp-inbox-container')) {
            actualContainer.innerHTML = `
                <div class="whatsapp-inbox-container">
                    <!-- Conversations Sidebar -->
                    <div class="conversation-sidebar">
                        <div class="conversation-header">
                            <h2>Chats</h2>
                            <div class="wa-search-bar">
                                <i data-lucide="search"></i>
                                <input type="text" placeholder="Search conversations..." id="wa-search-input" oninput="window.whatsAppSender.filterConversations(this.value)">
                            </div>
                        </div>
                        <div class="conversation-list" id="wa-conversation-list">
                            <!-- Injected via renderConversationList -->
                            <div style="padding:20px; text-align:center; color: var(--text-dim);">Loading chats...</div>
                        </div>
                    </div>

                    <!-- Chat Area -->
                    <div class="chat-area" id="wa-chat-area">
                        <div class="empty-chat-placeholder">
                            <i data-lucide="message-square" style="width: 64px; height: 64px; opacity: 0.3; margin-bottom: 20px;"></i>
                            <h3 style="margin-bottom: 8px;">Select a conversation</h3>
                            <p style="font-size: 0.9rem;">Choose a chat from the left to view messages.</p>
                        </div>
                    </div>
                </div>
            `;
        }

        this.renderConversationList();
    };

    window.whatsAppSender.renderConversationList = function () {
        const listContainer = document.getElementById('wa-conversation-list');
        if (!listContainer) return;

        const sortedConvos = Object.values(this.conversations).sort((a, b) => b.timestamp - a.timestamp);

        if (sortedConvos.length === 0) {
            listContainer.innerHTML = `
                <div style="padding:40px 20px; text-align:center; color: var(--text-dim);">
                    <p>No active conversations.</p>
                </div>`;
            return;
        }

        listContainer.innerHTML = sortedConvos.map(convo => {
            const date = new Date(convo.timestamp);
            const timeStr = date.toLocaleDateString() === new Date().toLocaleDateString()
                ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : date.toLocaleDateString();

            let displayName = convo.displayName;
            if (displayName === 'undefined' || !displayName) displayName = convo.phoneNumber;

            const initial = displayName ? displayName[0].toUpperCase() : '#';
            const isActive = this.activeConversationId === convo.phoneNumber ? 'active' : '';

            return `
                <div class="conversation-item ${isActive}" onclick="window.whatsAppSender.selectConversation('${convo.phoneNumber}')">
                    <div class="avatar-placeholder">${initial}</div>
                    <div class="conversation-info">
                        <div class="conversation-top">
                            <span class="contact-name">${displayName}</span>
                            <span class="last-time">${timeStr}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="last-message">${convo.lastMessage || ''}</span>
                            ${convo.unreadCount > 0 ? `<span class="unread-badge">${convo.unreadCount}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    window.whatsAppSender.selectConversation = function (phoneNumber) {
        this.activeConversationId = phoneNumber;

        // 1. Highlight in sidebar
        this.renderConversationList();

        // 2. Render Chat Area Structure
        const chatArea = document.getElementById('wa-chat-area');
        const metadata = this.conversations[phoneNumber] || { displayName: phoneNumber };
        let displayName = metadata.displayName;
        if (displayName === 'undefined' || !displayName) displayName = phoneNumber;

        chatArea.innerHTML = `
            <div class="chat-header">
                <button class="btn-icon mobile-only" onclick="window.whatsAppSender.closeChatMobile()">
                    <i data-lucide="arrow-left"></i>
                </button>
                <div class="avatar-placeholder" style="width: 40px; height: 40px; font-size: 1rem;">
                    ${displayName?.[0] || '#'}
                </div>
                <div class="chat-header-info">
                    <h3>${displayName}</h3>
                    <p>${phoneNumber}</p>
                </div>
            </div>

            <div class="messages-container" id="wa-messages-scroll">
                <div style="text-align:center; padding: 20px;">Loading messages...</div>
            </div>

            <form class="chat-input-area" onsubmit="window.whatsAppSender.handleSendMessage(event)">
                <input type="text" id="wa-chat-input" class="chat-input" placeholder="Type a message..." autocomplete="off">
                <button type="submit" class="send-btn-icon">
                    <i data-lucide="send"></i>
                </button>
            </form>
        `;
        if (window.lucide) window.lucide.createIcons();

        // Subscribe to messages for this conversation.
        this.subscribeToMessages(phoneNumber);
    };

    window.whatsAppSender.renderMessages = function () {
        const container = document.getElementById('wa-messages-scroll');
        if (!container) return;

        // Sort by timestamp
        const sorted = this.activeMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        container.innerHTML = sorted.map(msg => {
            const date = new Date(msg.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const isInbound = msg.direction === 'inbound';

            let statusIcon = '';
            let statusTooltip = '';
            if (!isInbound) {
                // Build tooltip with all receipt timestamps
                const tooltipParts = [];
                if (msg.sentAt) tooltipParts.push(`Sent: ${new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
                if (msg.deliveredAt) tooltipParts.push(`Delivered: ${new Date(msg.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
                if (msg.readAt) tooltipParts.push(`Read: ${new Date(msg.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
                statusTooltip = tooltipParts.length > 0 ? tooltipParts.join('\n') : (msg.status || 'pending');

                if (msg.status === 'read') statusIcon = '<i data-lucide="check-check" class="status-read"></i>';
                else if (msg.status === 'delivered') statusIcon = '<i data-lucide="check-check" class="status-delivered"></i>';
                else if (msg.status === 'sent') statusIcon = '<i data-lucide="check" class="status-sent"></i>';
                else statusIcon = '<i data-lucide="clock" class="status-sent"></i>';
            }

            let mediaContent = '';
            if (msg.imageData) {
                if (msg.type === 'image') {
                    if (msg.imageData.url) {
                        mediaContent = `
                            <div class="message-media" style="margin-bottom: 8px; border-radius: 8px; overflow: hidden; background: rgba(0,0,0,0.1); max-width: 100%;">
                                <a href="${msg.imageData.url}" target="_blank">
                                    <img src="${msg.imageData.url}" style="width: 100%; height: auto; display: block;" alt="Received Image">
                                </a>
                            </div>
                        `;
                    } else {
                        // Fallback placeholder if no direct URL is available
                        mediaContent = `
                            <div class="message-media" style="margin-bottom: 8px; border-radius: 8px; overflow: hidden; background: rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; padding: 20px;">
                                <div style="text-align: center;">
                                    <i data-lucide="image" style="width: 32px; height: 32px; opacity: 0.7; margin-bottom: 8px;"></i>
                                    <div style="font-size: 0.8rem; opacity: 0.8;">Image Received<br><small>ID: ${msg.imageData.id ? msg.imageData.id.substring(0, 8) : 'Unknown'}...</small></div>
                                </div>
                            </div>
                        `;
                    }
                } else if (msg.type === 'audio') {
                    if (msg.imageData.url) {
                        mediaContent = `
                            <div class="custom-audio-player" data-src="${msg.imageData.url}">
                                <audio class="hidden-audio" src="${msg.imageData.url}" preload="metadata" style="display:none;"></audio>
                                <button class="audio-play-btn">
                                    <i data-lucide="play"></i>
                                </button>
                                <div class="audio-scrubber">
                                    <div class="audio-progress"></div>
                                </div>
                                <span class="audio-time">0:00</span>
                            </div>
                        `;
                    } else {
                        mediaContent = `
                            <div class="message-media" style="margin-bottom: 8px; border-radius: 8px; overflow: hidden; background: rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; padding: 20px;">
                                <div style="text-align: center;">
                                    <i data-lucide="mic" style="width: 32px; height: 32px; opacity: 0.7; margin-bottom: 8px;"></i>
                                    <div style="font-size: 0.8rem; opacity: 0.8;">Voice Message<br><small>ID: ${msg.imageData.id ? msg.imageData.id.substring(0, 8) : 'Unknown'}...</small></div>
                                </div>
                            </div>
                        `;
                    }
                } else if (msg.imageData.url) {
                    // Generic fallback for video/document
                    mediaContent = `
                        <div class="message-media" style="margin-bottom: 8px; border-radius: 8px; overflow: hidden; background: rgba(0,0,0,0.1); max-width: 100%; padding: 10px; text-align: center;">
                            <a href="${msg.imageData.url}" target="_blank" style="color: inherit; text-decoration: none;">
                                <i data-lucide="paperclip" style="width: 24px; height: 24px; margin-bottom: 4px;"></i><br>
                                <span style="font-size: 0.85rem;">View Attachment</span>
                            </a>
                        </div>
                    `;
                }
            }

            const messageText = msg.message || msg.text?.body || '';
            const textContent = messageText ? `<div class="message-text">${this.formatWhatsAppText(messageText)}</div>` : '';

            return `
                <div class="message-bubble ${isInbound ? 'inbound' : 'outbound'}">
                    ${mediaContent}
                    ${textContent}
                    <div class="message-meta">
                        <span>${timeStr}</span>
                        ${!isInbound ? `<span class="message-status" title="${statusTooltip}">${statusIcon}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
        container.scrollTop = container.scrollHeight;

        // Initialize custom audio listeners once
        if (!window.audioInitDone) {
            window.audioInitDone = true;

            const formatTime = (time) => {
                if (isNaN(time)) return "0:00";
                const mins = Math.floor(time / 60);
                const secs = Math.floor(time % 60);
                return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            };

            const stopAllOtherAudios = (exceptAudio) => {
                document.querySelectorAll('.hidden-audio').forEach(audio => {
                    if (audio !== exceptAudio && !audio.paused) {
                        audio.pause();
                        const player = audio.closest('.custom-audio-player');
                        if (player) {
                            const btn = player.querySelector('.audio-play-btn');
                            btn.classList.remove('playing');
                            btn.innerHTML = '<i data-lucide="play"></i>';
                            if (window.lucide) window.lucide.createIcons({ root: btn });
                        }
                    }
                });
            };

            container.addEventListener('click', (e) => {
                const btn = e.target.closest('.audio-play-btn');
                const scrubber = e.target.closest('.audio-scrubber');

                if (btn) {
                    const player = btn.closest('.custom-audio-player');
                    const audio = player.querySelector('.hidden-audio');

                    if (audio.paused) {
                        stopAllOtherAudios(audio);
                        audio.play();
                        btn.classList.add('playing');
                        btn.innerHTML = '<i data-lucide="pause"></i>';
                    } else {
                        audio.pause();
                        btn.classList.remove('playing');
                        btn.innerHTML = '<i data-lucide="play"></i>';
                    }
                    if (window.lucide) window.lucide.createIcons({ root: btn });
                }

                if (scrubber) {
                    const player = scrubber.closest('.custom-audio-player');
                    const audio = player.querySelector('.hidden-audio');
                    const rect = scrubber.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    if (audio.duration) {
                        audio.currentTime = percent * audio.duration;
                    }
                }
            });

            container.addEventListener('timeupdate', (e) => {
                if (e.target.classList.contains('hidden-audio')) {
                    const audio = e.target;
                    const player = audio.closest('.custom-audio-player');
                    const progress = player.querySelector('.audio-progress');
                    const timeEl = player.querySelector('.audio-time');

                    if (audio.duration) {
                        const percent = (audio.currentTime / audio.duration) * 100;
                        progress.style.width = `${percent}%`;
                        timeEl.textContent = formatTime(audio.currentTime);
                    }
                }
            }, true);

            container.addEventListener('loadedmetadata', (e) => {
                if (e.target.classList.contains('hidden-audio')) {
                    const audio = e.target;
                    const player = audio.closest('.custom-audio-player');
                    const timeEl = player.querySelector('.audio-time');
                    timeEl.textContent = formatTime(audio.duration);
                }
            }, true);

            container.addEventListener('ended', (e) => {
                if (e.target.classList.contains('hidden-audio')) {
                    const audio = e.target;
                    const player = audio.closest('.custom-audio-player');
                    const btn = player.querySelector('.audio-play-btn');
                    audio.currentTime = 0;
                    btn.classList.remove('playing');
                    btn.innerHTML = '<i data-lucide="play"></i>';
                    const progress = player.querySelector('.audio-progress');
                    if (progress) progress.style.width = '0%';
                    const timeEl = player.querySelector('.audio-time');
                    if (timeEl) timeEl.textContent = formatTime(audio.duration);
                    if (window.lucide) window.lucide.createIcons({ root: btn });
                }
            }, true);
        }
    };

    window.whatsAppSender.closeChatMobile = function () {
        document.querySelector('.chat-area').classList.remove('active');
        this.activeConversationId = null;
        this.renderConversationList();
    };

    window.whatsAppSender.filterConversations = function (query) {
        const items = document.querySelectorAll('#wa-conversation-list .conversation-item');
        const q = query.trim().toLowerCase();
        items.forEach(item => {
            const name = item.querySelector('.contact-name')?.textContent?.toLowerCase() || '';
            const preview = item.querySelector('.last-message')?.textContent?.toLowerCase() || '';
            item.style.display = (!q || name.includes(q) || preview.includes(q)) ? '' : 'none';
        });
    };


    // --- Broadcast View ---

    window.whatsAppSender.renderBroadcastView = function () {
        const container = document.getElementById('whatsapp-content-broadcast');
        if (!container) return;

        const templatesToRender = this.templates || [];
        const isMaster = window.currentUserData?.isAdmin || window.currentUserData?.permissions?.whatsapp_sender === true || false;
        const canBroadcast = isMaster || window.currentUserData?.permissions?.whatsapp_sender?.broadcast === true;

        container.innerHTML = `
            <div class="broadcast-container">
                <!-- Left: Compact Form Panel -->
                <div class="broadcast-form-panel">
                    <div class="broadcast-form-header">
                        <i data-lucide="radio" style="width:18px;height:18px;color:var(--accent-primary);"></i>
                        <span>New Broadcast</span>
                    </div>

                    <div class="broadcast-form-body">

                        <!-- Campaign Name -->
                        <div class="bcast-field-group">
                            <label class="bcast-label">
                                <i data-lucide="tag" style="width:14px;height:14px;"></i> Campaign Name
                            </label>
                            <input type="text" class="wa-input" placeholder="e.g. Monthly Newsletter"
                                value="New Broadcast ${new Date().toLocaleDateString()}" id="wa-campaign-name">
                        </div>

                        <div class="bcast-divider"></div>

                        <!-- Audience -->
                        <div class="bcast-field-group">
                            <label class="bcast-label">
                                <i data-lucide="users" style="width:14px;height:14px;"></i> Audience
                            </label>
                            <select class="wa-input" id="wa-broadcast-audience" onchange="window.whatsAppSender.updateRecipientCount()">
                                <option value="none" disabled selected>-- Choose Audience --</option>
                                <option value="all">All Contacts</option>
                                <option value="staff">Staff Members</option>
                                <option value="students">Students</option>
                                <optgroup label="Custom Lists">
                                    ${Object.entries(this.lists).map(([id, list]) => `<option value="list:${id}">${list.name} (${list.count || 0})</option>`).join('')}
                                </optgroup>
                            </select>
                            <div class="bcast-meta" id="wa-recipient-count"></div>
                        </div>

                        <div class="bcast-divider"></div>

                        <!-- Template -->
                        <div class="bcast-field-group">
                            <label class="bcast-label">
                                <i data-lucide="layout-template" style="width:14px;height:14px;"></i> Template
                            </label>
                            <select class="wa-input" id="wa-template-select" onchange="window.whatsAppSender.updatePreview()">
                                ${templatesToRender.length > 0
                ? `<option value="" disabled selected>-- Choose a Template --</option>` + templatesToRender.map(t => {
                    const name = t.name;
                    const components = t.components || [];
                    const bodyComp = components.find(c => c.type === 'BODY') || {};
                    const content = bodyComp.text || '';
                    const category = t.category || t.previous_category || 'UNKNOWN';
                    const headerComp = components.find(c => c.type === 'HEADER' && c.format === 'IMAGE');
                    const headerImageUrl = headerComp && headerComp.example && headerComp.example.header_handle ? (headerComp.example.header_handle[0] || '') : '';
                    const footerComp = components.find(c => c.type === 'FOOTER') || {};
                    const footerText = footerComp.text || '';
                    const buttonsComp = components.find(c => c.type === 'BUTTONS') || {};
                    const buttonsJson = buttonsComp.buttons ? encodeURIComponent(JSON.stringify(buttonsComp.buttons)) : '';
                    return `<option value="${name}" data-content="${encodeURIComponent(content)}" data-category="${category}" data-header-image="${headerImageUrl}" data-footer="${encodeURIComponent(footerText)}" data-buttons="${buttonsJson}">${name} (${category} - ${t.language || 'en'})</option>`;
                }).join('')
                : `<option value="" disabled selected>No templates found from API</option>`}
                            </select>
                        </div>

                        <!-- Variables (injected dynamically) -->
                        <div id="wa-template-variables"></div>

                    </div>

                    <!-- Send Button pinned at bottom -->
                    <div class="broadcast-form-footer">
                        ${canBroadcast ? `
                        <button id="wa-broadcast-send-btn" class="btn btn-primary full-width" onclick="window.whatsAppSender.prepareBroadcast()">
                            <i data-lucide="send"></i> Send Broadcast
                        </button>
                        ` : `
                        <button class="btn btn-primary full-width" disabled title="You do not have permission to send broadcasts">
                            <i data-lucide="send"></i> Not Authorized
                        </button>
                        `}
                    </div>
                </div>

                <!-- Right: Preview Panel -->
                <div class="broadcast-preview-panel">
                    <div class="bcast-preview-label">
                        <i data-lucide="eye" style="width:14px;height:14px;"></i> Live Preview
                    </div>
                    <div class="bcast-phone-mockup">
                        <div class="bcast-phone-screen">

                            <!-- Status Bar -->
                            <div class="bcast-status-bar">
                                <span class="bcast-status-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                <div class="bcast-status-icons">
                                    <svg width="14" height="10" viewBox="0 0 24 16" fill="white" opacity="0.9"><rect x="0" y="8" width="4" height="8" rx="1"/><rect x="5" y="5" width="4" height="11" rx="1"/><rect x="10" y="2" width="4" height="14" rx="1"/><rect x="15" y="0" width="4" height="16" rx="1"/></svg>
                                    <svg width="14" height="10" viewBox="0 0 24 16" fill="white" opacity="0.9"><path d="M12 2C7 2 2.5 4.5 0 8.5 2.5 12.5 7 15 12 15s9.5-2.5 12-6.5C21.5 4.5 17 2 12 2zm0 10a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"/></svg>
                                    <svg width="22" height="11" viewBox="0 0 44 22" fill="none"><rect x="1" y="1" width="38" height="20" rx="4" stroke="white" stroke-opacity="0.5" stroke-width="2"/><rect x="3" y="3" width="28" height="16" rx="2.5" fill="white"/><path d="M41 7v8a4 4 0 000-8z" fill="white" fill-opacity="0.5"/></svg>
                                </div>
                            </div>

                            <!-- Chat Header -->
                            <div class="bcast-chat-header">
                                <div class="bcast-back-btn">
                                    <svg width="10" height="16" viewBox="0 0 10 16" fill="white"><path d="M9 1L2 8l7 7" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
                                    <span style="font-size:0.8rem;font-weight:600;">15</span>
                                </div>
                                <img src="assets/ENGLISH LOGO-CORAL.png" class="bcast-header-avatar" alt="Abhishri" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                                <div class="bcast-header-avatar-fallback" style="display:none;">A</div>
                                <div class="bcast-header-info">
                                    <div class="bcast-header-name">Abhishri Academy</div>
                                    <div class="bcast-header-sub">Business account</div>
                                </div>
                                <div class="bcast-header-call">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.68A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                                </div>
                            </div>

                            <!-- Chat Wallpaper + Messages -->
                            <div class="bcast-chat-body">
                                <!-- Incoming broadcast message (from business perspective, recipient sees this as inbound) -->
                                <div class="bcast-msg-inbound bcast-msg-inbound--preview">
                                    <div id="wa-preview-text" style="white-space:pre-wrap;line-height:1.5;word-break:break-word;">Select a template to see the preview here...</div>
                                    <span class="bcast-msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            </div>

                            <!-- Bottom Toolbar -->
                            <div class="bcast-chat-toolbar">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                <div class="bcast-chat-input-fake">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>
                                </div>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();

        // JS fallback: hide preview panel on mobile (in case CSS is cached)
        const applyPreviewVisibility = () => {
            const panel = container.querySelector('.broadcast-preview-panel');
            if (panel) panel.style.display = window.innerWidth <= 768 ? 'none' : '';
        };
        applyPreviewVisibility();
        window._broadcastResizeHandler && window.removeEventListener('resize', window._broadcastResizeHandler);
        window._broadcastResizeHandler = applyPreviewVisibility;
        window.addEventListener('resize', window._broadcastResizeHandler);
    };


    window.whatsAppSender.updatePreview = function () {
        const select = document.getElementById('wa-template-select');
        const previewText = document.getElementById('wa-preview-text');
        const varsContainer = document.getElementById('wa-template-variables');

        if (!select || !previewText || !varsContainer) return;

        const contentRaw = select.options[select.selectedIndex].getAttribute('data-content');
        if (!contentRaw) {
            varsContainer.innerHTML = '';
            previewText.innerHTML = "Select a template to preview content here...";
            return;
        }

        const templateText = decodeURIComponent(contentRaw);

        // Find variables like {{1}}, {{2}} in the text
        const matches = [...templateText.matchAll(/\{\{(\d+)\}\}/g)];
        const uniqueVars = [...new Set(matches.map(m => m[1]))].sort((a, b) => Number(a) - Number(b));

        // Generate Input Fields if this template just got selected (not on every keystroke)
        // We check if the container is empty or we changed templates.
        const currentInputs = varsContainer.querySelectorAll('.wa-var-input');
        
        // Find if template requires an image header (from the dataset we embedded)
        const headerImageUrl = select.options[select.selectedIndex].getAttribute('data-header-image');
        const needsImageHeader = headerImageUrl !== null && headerImageUrl !== undefined && headerImageUrl !== '';

        if (currentInputs.length !== uniqueVars.length || !varsContainer.querySelector('.wa-media-upload-section')) {
            let html = '';
            
            // Add Media Upload section if needed
            if (needsImageHeader) {
                html += `
                    <div class="wa-media-upload-section" style="margin-bottom: 20px;">
                        <label style="display:block; margin-bottom: 8px; font-weight: 500;">Header Image</label>
                        <div id="wa-header-media-preview" style="margin-bottom: 10px; display: none; width: 100%; max-height: 200px; overflow: hidden; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); position: relative;">
                            <img src="" style="width: 100%; height: auto; object-fit: cover; display: block;" alt="Selected Header Image">
                            <button id="wa-header-media-clear" title="Remove image" style="position:absolute;top:8px;right:8px;border:none;background:rgba(0,0,0,0.6);color:#fff;border-radius:50%;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;backdrop-filter:blur(4px);transition:background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.8)'" onmouseout="this.style.background='rgba(0,0,0,0.6)'">
                                <i data-lucide="x" style="width:16px;height:16px;"></i>
                            </button>
                        </div>
                        <input type="hidden" id="wa-header-media-url" value="">
                        <div class="form-group">
                            <button id="wa-open-media-picker-btn" class="wa-input" type="button" style="text-align: left; display: flex; align-items: center; justify-content: space-between; cursor: pointer; color: rgba(255,255,255,0.6);">
                                <span style="display:flex; align-items:center; gap: 8px;">
                                    <i data-lucide="image" style="width:16px;height:16px;"></i> 
                                    <span id="wa-media-btn-text">Select or upload image...</span>
                                </span>
                                <i data-lucide="chevron-right" style="width:16px;height:16px;opacity:0.5;"></i>
                            </button>
                        </div>
                    </div>
                `;
            }

            if (uniqueVars.length > 0) {
                html += `
                    <label style="display:block; margin-bottom: 8px; font-weight: 500;">Template Variables</label>
                    ${uniqueVars.map(v => `
                        <div class="form-group" style="margin-bottom: 10px;">
                            <input type="text" class="wa-input wa-var-input" data-var="${v}" placeholder="Value for {{${v}}}" oninput="window.whatsAppSender.updatePreviewText()">
                        </div>
                    `).join('')}
                `;
            } 
            
            varsContainer.innerHTML = html;
            if (window.lucide) window.lucide.createIcons();

            // Bind picker button with event listener (NOT inline onclick - avoids CSP issues)
            const pickerBtn = document.getElementById('wa-open-media-picker-btn');
            if (pickerBtn) {
                pickerBtn.addEventListener('click', function () {
                    window.whatsAppSender.openMediaPickerModal();
                });
            }
            const clearBtn = document.getElementById('wa-header-media-clear');
            if (clearBtn) {
                clearBtn.addEventListener('click', function () {
                    window.whatsAppSender.setHeaderMediaUrl('');
                });
            }
        }

        this.updatePreviewText(); // run initial replace
    };

    window.whatsAppSender.updatePreviewText = function () {
        const select = document.getElementById('wa-template-select');
        const previewText = document.getElementById('wa-preview-text');
        if (!select || !previewText) return;

        const selectedOption = select.options[select.selectedIndex];
        const contentRaw = selectedOption.getAttribute('data-content');
        const headerImageUrl = selectedOption.getAttribute('data-header-image') || '';
        const footerRaw = selectedOption.getAttribute('data-footer') || '';
        const buttonsRaw = selectedOption.getAttribute('data-buttons') || '';
        if (!contentRaw) return;

        let hydratedText = decodeURIComponent(contentRaw);
        const footerText = footerRaw ? decodeURIComponent(footerRaw) : '';
        let buttons = [];
        try { buttons = buttonsRaw ? JSON.parse(decodeURIComponent(buttonsRaw)) : []; } catch(e) { buttons = []; }

        // Replace body variables with entered values
        const inputs = document.querySelectorAll('.wa-var-input');
        inputs.forEach(function(input) {
            const varNum = input.getAttribute('data-var');
            if (!varNum) return;
            const val = input.value || ('{{' + varNum + '}}');
            const regex = new RegExp('\\{\\{' + varNum + '\\}\\}', 'g');
            hydratedText = hydratedText.replace(regex, val);
        });

        // --- Header ---
        const headerInput = document.getElementById('wa-header-media-url');
        const customMediaUrl = headerInput ? headerInput.value : '';
        const displayImageUrl = customMediaUrl || headerImageUrl;
        let html = '';

        if (displayImageUrl) {
            html += '<div style="width:100%;border-radius:6px 6px 0 0;overflow:hidden;margin:-8px -8px 8px -8px;width:calc(100% + 16px);"><img src="' + displayImageUrl + '" style="width:100%;height:auto;display:block;" alt="Header Image" onerror="this.parentElement.innerHTML=\'<div style=background:#1e2530;padding:18px;text-align:center;color:#aaa;font-size:0.75rem;><i>Image preview unavailable</i></div>\'"></div>';
        }

        // --- Body ---
        html += '<div style="padding:0;">' + this.formatWhatsAppText(hydratedText) + '</div>';

        // --- Footer ---
        if (footerText) {
            html += '<div style="margin-top:6px;font-size:0.72rem;color:#9ca3af;border-top:1px solid rgba(255,255,255,0.07);padding-top:5px;">' + this.escapeHtml(footerText) + '</div>';
        }

        // --- Buttons ---
        if (buttons.length > 0) {
            const self = this;
            const btnHtml = buttons.map(function(btn) {
                let icon = '';
                let label = self.escapeHtml(btn.text || '');
                if (btn.type === 'PHONE_NUMBER') {
                    icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:5px;flex-shrink:0;"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.68A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6"/></svg>';
                } else if (btn.type === 'URL') {
                    icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:5px;flex-shrink:0;"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
                } else if (btn.type === 'QUICK_REPLY') {
                    icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:5px;flex-shrink:0;"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
                }
                return '<div style="display:flex;align-items:center;justify-content:center;padding:7px 8px;color:#60a5fa;font-size:0.78rem;font-weight:500;border-top:1px solid rgba(255,255,255,0.09);cursor:default;">' + icon + label + '</div>';
            }).join('');
            html += '<div style="margin:8px -8px -8px -8px;">' + btnHtml + '</div>';
        }

        previewText.innerHTML = html;
    };

    // Opens a full-featured media picker modal
    window.whatsAppSender.openMediaPickerModal = function () {
        // Remove any existing modal
        const existingModal = document.getElementById('wa-media-picker-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'wa-media-picker-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';
        modal.innerHTML = `
            <div style="background:var(--surface,#1a1f2b);border-radius:12px;width:100%;max-width:680px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.6);">
                <div style="padding:20px 24px;border-bottom:1px solid var(--border,#2a3040);display:flex;align-items:center;justify-content:space-between;">
                    <div>
                        <h3 style="margin:0;font-size:1.1rem;">Select Header Image</h3>
                        <p style="margin:4px 0 0;font-size:0.82rem;color:var(--text-dim,#8a9ab5);">Choose from previously uploaded images or upload a new one.</p>
                    </div>
                    <button id="wa-media-modal-close" style="border:none;background:transparent;color:var(--text-dim,#8a9ab5);cursor:pointer;padding:6px;border-radius:6px;font-size:1.3rem;line-height:1;">&times;</button>
                </div>

                <div style="padding:16px 24px;border-bottom:1px solid var(--border,#2a3040);">
                    <button id="wa-media-upload-new-btn" class="btn btn-primary" type="button" style="gap:8px;">
                        <i data-lucide="upload" style="width:15px;height:15px;"></i> Upload New Image
                    </button>
                    <input type="file" id="wa-media-file-input" accept="image/*" style="display:none;">
                </div>

                <div style="padding:16px 24px;flex:1;overflow-y:auto;">
                    <p style="font-size:0.85rem;font-weight:600;margin:0 0 12px;color:var(--text-dim,#8a9ab5);text-transform:uppercase;letter-spacing:0.05em;">Previously Uploaded</p>
                    <div id="wa-media-gallery" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;min-height:80px;">
                        <div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-dim,#8a9ab5);font-size:0.85rem;" id="wa-media-gallery-loading">
                            <i data-lucide="loader-circle" style="width:20px;height:20px;animation:spin 1s linear infinite;"></i><br>Loading images...
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) window.lucide.createIcons({ root: modal });

        // Wire up close button
        document.getElementById('wa-media-modal-close').addEventListener('click', function () {
            modal.remove();
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.remove();
        });

        // Wire up upload new button
        const fileInput = document.getElementById('wa-media-file-input');
        document.getElementById('wa-media-upload-new-btn').addEventListener('click', function () {
            fileInput.click();
        });
        fileInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;
            window.whatsAppSender.uploadMediaFile(file, modal);
        });

        // Load existing images from Firebase Storage
        window.whatsAppSender.loadMediaGallery();
    };

    // Upload a file to Firebase Storage and select it
    window.whatsAppSender.uploadMediaFile = function (file, modal) {
        const btn = document.getElementById('wa-media-upload-new-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-circle" style="width:15px;height:15px;animation:spin 1s linear infinite;"></i>&nbsp; Uploading...'; }
        if (window.lucide && btn) window.lucide.createIcons({ root: btn });

        const fileName = 'whatsapp_headers/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageRef = firebase.storage().ref(fileName);
        storageRef.put(file).then(function (snapshot) {
            return snapshot.ref.getDownloadURL();
        }).then(function (downloadURL) {
            window.whatsAppSender.setHeaderMediaUrl(downloadURL);
            if (modal) modal.remove();
        }).catch(function (error) {
            console.error('Upload failed:', error);
            AppDialog.toast('Upload failed: ' + error.message, 'error');
        }).finally(function () {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="upload" style="width:15px;height:15px;"></i>&nbsp; Upload New Image'; }
            if (window.lucide && btn) window.lucide.createIcons({ root: btn });
        });
    };

    // Load gallery of previously uploaded images from Firebase Storage
    window.whatsAppSender.loadMediaGallery = function () {
        const gallery = document.getElementById('wa-media-gallery');
        if (!gallery) return;

        const listRef = firebase.storage().ref('whatsapp_headers');
        listRef.listAll().then(function (res) {
            const loadingEl = document.getElementById('wa-media-gallery-loading');
            if (loadingEl) loadingEl.remove();

            if (res.items.length === 0) {
                gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-dim,#8a9ab5);font-size:0.85rem;">No images uploaded yet. Upload a new image above.</div>';
                return;
            }

            // Load URLs for each item
            const urlPromises = res.items.map(function (itemRef) {
                return itemRef.getDownloadURL().then(function (url) {
                    return { url: url, name: itemRef.name };
                });
            });

            Promise.all(urlPromises).then(function (items) {
                // Newest first
                items.reverse();
                gallery.innerHTML = '';
                items.forEach(function (item) {
                    const card = document.createElement('div');
                    card.style.cssText = 'border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:border-color 0.15s;aspect-ratio:1;background:#0d1117;position:relative;';
                    card.title = item.name;
                    card.innerHTML = '<img src="' + item.url + '" style="width:100%;height:100%;object-fit:cover;display:block;" alt="' + item.name + '"><div style="position:absolute;inset:0;background:rgba(0,0,0,0);transition:background 0.15s;"></div>';
                    card.addEventListener('mouseenter', function () {
                        card.style.borderColor = 'var(--accent-primary,#e86966)';
                        card.querySelector('div').style.background = 'rgba(232,105,102,0.15)';
                    });
                    card.addEventListener('mouseleave', function () {
                        card.style.borderColor = 'transparent';
                        card.querySelector('div').style.background = 'rgba(0,0,0,0)';
                    });
                    card.addEventListener('click', function () {
                        window.whatsAppSender.setHeaderMediaUrl(item.url);
                        const modal = document.getElementById('wa-media-picker-modal');
                        if (modal) modal.remove();
                    });
                    gallery.appendChild(card);
                });
            });
        }).catch(function (err) {
            console.error('Failed to load media gallery:', err);
            const gallery2 = document.getElementById('wa-media-gallery');
            if (gallery2) gallery2.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#f87171;font-size:0.85rem;">Failed to load images. Check Firebase Storage rules.</div>';
        });
    };

    window.whatsAppSender.setHeaderMediaUrl = function (url) {
        const input = document.getElementById('wa-header-media-url');
        const previewContainer = document.getElementById('wa-header-media-preview');
        const previewImg = previewContainer ? previewContainer.querySelector('img') : null;
        const btnText = document.getElementById('wa-media-btn-text');
        
        if (input) input.value = url || '';

        if (!url) {
            if (previewContainer) previewContainer.style.display = 'none';
            if (previewImg) previewImg.src = '';
            if (btnText) btnText.innerText = 'Select or upload image...';
            this.updatePreviewText();
            return;
        }

        if (previewContainer && previewImg) {
            previewImg.src = url;
            previewImg.onload = function () {
                previewContainer.style.display = 'block';
                if (btnText) btnText.innerText = 'Change selected image...';
                window.whatsAppSender.updatePreviewText();
            };
            previewImg.onerror = function () {
                // Still set it — the image may still be sendable even if blocked by CSP locally
                previewContainer.style.display = 'block';
                previewImg.style.display = 'none';
                if (btnText) btnText.innerText = 'Change selected image...';
                const existing = previewContainer.querySelector('.wa-preview-placeholder');
                if (!existing) {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'wa-preview-placeholder';
                    placeholder.style.cssText = 'padding:16px;text-align:center;color:var(--text-dim,#8a9ab5);font-size:0.8rem;background:#0d1117;border-radius:6px;';
                    placeholder.innerHTML = '<i data-lucide="image-off" style="width:24px;height:24px;margin-bottom:6px;"></i><br>Preview blocked by browser policy.<br>Image URL is saved and will be sent.';
                    previewContainer.appendChild(placeholder);
                    if (window.lucide) window.lucide.createIcons({ root: placeholder });
                }
                window.whatsAppSender.updatePreviewText();
            };
        }
    };

    window.whatsAppSender.updateRecipientCount = function () {
        const select = document.getElementById('wa-broadcast-audience');
        const display = document.getElementById('wa-recipient-count');
        if (select && display) {
            const text = select.options[select.selectedIndex].text;
            // Extract count if available or logic to count
            display.innerText = `Selected Group: ${text} `;
        }
    };


    // --- History View ---

    window.whatsAppSender.renderHistoryView = function () {
        const container = document.getElementById('whatsapp-content-history');
        if (!container) return;

        container.innerHTML = `
            <div class="wa-history-page">
                <div class="wa-history-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="width:40px; height:40px; background:var(--accent-faint); border-radius:12px; display:flex; align-items:center; justify-content:center; color:var(--accent);">
                            <i data-lucide="history" style="width:22px;height:22px;"></i>
                        </div>
                        <div>
                            <h2 style="margin:0; font-size:1.3rem; font-weight:800; color:var(--text-main);">Broadcast History</h2>
                            <p style="margin:0; font-size:0.8rem; color:var(--text-dim);">Track and analyze your campaign performance</p>
                        </div>
                    </div>
                    <button class="btn btn-secondary" onclick="window.whatsAppSender.loadHistory()">
                        <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Sync Logs
                    </button>
                </div>
                
                <div class="table-responsive" style="background:var(--card-bg); border:1px solid var(--border); border-radius:20px; overflow:hidden;">
                    <table class="table" style="width:100%; border-collapse:collapse;">
                        <thead style="background:rgba(255,255,255,0.02); border-bottom:1px solid var(--border);">
                            <tr>
                                <th style="padding:18px 20px; text-align:left; color:var(--text-dim); font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;">Launch Date</th>
                                <th style="padding:18px 20px; text-align:left; color:var(--text-dim); font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;">Campaign & Template</th>
                                <th style="padding:18px 20px; text-align:left; color:var(--text-dim); font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;">Audience</th>
                                <th style="padding:18px 20px; text-align:center; color:var(--text-dim); font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;">Size</th>
                                <th style="padding:18px 20px; text-align:left; color:var(--text-dim); font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;">Performance Metrics</th>
                                <th style="padding:18px 20px; text-align:right; color:var(--text-dim); font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="wa-history-tbody">
                            <tr>
                                <td colspan="6" style="padding:60px; text-align:center; color:var(--text-dim);">
                                    <i data-lucide="loader" style="width:32px;height:32px;animation:spin 1s linear infinite;margin-bottom:12px;opacity:0.5;"></i>
                                    <p style="font-weight:600;">Connecting to log server...</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        this.loadHistory();
    };

    window.whatsAppSender.loadHistory = function () {
        const tbody = document.getElementById('wa-history-tbody');
        if (!tbody) return;

        // Unsubscribe any existing listener
        if (window.whatsAppSender._historyUnsubscribe) {
            window.whatsAppSender._historyUnsubscribe();
        }

        window.whatsAppSender._historyUnsubscribe = firestore
            .collection('modules').doc('whatsapp_sender').collection('history')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .onSnapshot(snapshot => {
                const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (logs.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="6" style="padding:80px; text-align:center; color:var(--text-dim);">
                                <div style="width:64px; height:64px; background:rgba(255,255,255,0.03); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 20px;">
                                    <i data-lucide="inbox" style="width:32px;height:32px;opacity:0.3;"></i>
                                </div>
                                <h3 style="color:var(--text-main); margin-bottom:8px;">No Broadcasts Yet</h3>
                                <p style="margin:0;">Your campaign history will appear here once you launch your first broadcast.</p>
                            </td>
                        </tr>
                    `;
                    if (window.lucide) window.lucide.createIcons();
                    return;
                }

                tbody.innerHTML = logs.map(log => {
                    const ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
                    const date = ts.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    const time = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    const audience = log.listName || log.listId || 'Custom List';
                    const campaignName = log.campaignName || 'Untitled Campaign';
                    const templateName = log.template || '—';

                    const displayRead = log.readCount || 0;
                    const displayDelivered = log.deliveredCount || 0;
                    const displaySent = log.sentCount || 0;
                    const displayFailed = log.failedCount || 0;
                    const total = log.recipientsCount || 0;
                    
                    const now = Date.now();
                    const ageMinutes = (now - ts.getTime()) / (1000 * 60);
                    const isDispatching = log.status === 'dispatching' || log.status === 'dispatching_meta';
                    const isStuck = isDispatching && ageMinutes > 30;

                    const statusHTML = `
                        <div style="display:flex; flex-direction:column; gap:6px; min-width:180px;">
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
                                <div style="display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; background:rgba(59, 130, 246, 0.08); border:1px solid rgba(59,130,246,0.15); color:#3b82f6;" title="Sent (Total processed)">
                                    <i data-lucide="send" style="width:12px;height:12px; opacity:0.8;"></i>
                                    <span style="font-size:0.7rem; font-weight:700;">SENT</span>
                                    <span style="margin-left:auto; font-size:0.8rem; font-weight:800;">${displaySent}</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; background:rgba(37, 211, 102, 0.08); border:1px solid rgba(37,211,102,0.15); color:#25D366; opacity:${displayDelivered > 0 ? '1' : '0.4'};" title="Delivered (Received by device)">
                                    <i data-lucide="check" style="width:12px;height:12px; opacity:0.8;"></i>
                                    <span style="font-size:0.7rem; font-weight:700;">DELIV</span>
                                    <span style="margin-left:auto; font-size:0.8rem; font-weight:800;">${displayDelivered}</span>
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
                                <div style="display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; background:rgba(168, 85, 247, 0.08); border:1px solid rgba(168,85,247,0.15); color:#a855f7; opacity:${displayRead > 0 ? '1' : '0.4'};" title="Read (Opened)">
                                    <i data-lucide="check-check" style="width:12px;height:12px; opacity:0.8;"></i>
                                    <span style="font-size:0.7rem; font-weight:700;">READ</span>
                                    <span style="margin-left:auto; font-size:0.8rem; font-weight:800;">${displayRead}</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239,68,68,0.15); color:#ef4444; opacity:${displayFailed > 0 ? '1' : '0.4'};" title="Failed">
                                    <i data-lucide="alert-circle" style="width:12px;height:12px; opacity:0.8;"></i>
                                    <span style="font-size:0.7rem; font-weight:700;">FAIL</span>
                                    <span style="margin-left:auto; font-size:0.8rem; font-weight:800;">${displayFailed}</span>
                                </div>
                            </div>
                        </div>
                    `;

                    return `
                        <tr style="border-bottom:1px solid var(--border); transition:background 0.2s;"
                            onmouseenter="this.style.background='rgba(255,255,255,0.02)'" onmouseleave="this.style.background=''">
                            <td style="padding:20px;">
                                <div style="font-weight:700; color:var(--text-main); font-size:0.95rem;">${date}</div>
                                <div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px;">${time}</div>
                            </td>
                            <td style="padding:20px;">
                                <div style="font-weight:800; color:var(--text-main); font-size:1rem; margin-bottom:6px;">${campaignName}</div>
                                <div style="display:inline-flex; align-items:center; gap:6px; font-size:0.7rem; color:#38bdf8; font-weight:700; background:rgba(56,189,248,0.1); padding:4px 10px; border-radius:8px; border:1px solid rgba(56,189,248,0.2);">
                                    <i data-lucide="layout-template" style="width:12px;height:12px;"></i> ${templateName}
                                </div>
                            </td>
                            <td style="padding:20px;">
                                <div style="display:flex; align-items:center; gap:8px; font-size:0.9rem; color:var(--text-main); font-weight:600;">
                                    <div style="width:8px;height:8px;border-radius:50%;background:var(--accent);"></div>
                                    ${audience}
                                </div>
                            </td>
                            <td style="padding:20px; text-align:center;">
                                <div style="font-weight:800; font-size:1.1rem; color:var(--text-main);">${total}</div>
                                <div style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; font-weight:700;">Targets</div>
                            </td>
                            <td style="padding:20px;">
                                ${statusHTML}
                            </td>
                            <td style="padding:20px; text-align:right;">
                                <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
                                    ${isDispatching ? `
                                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                            <div style="font-size:0.7rem; color:${isStuck ? '#ef4444' : '#3b82f6'}; font-weight:800; text-transform:uppercase; display:flex; align-items:center; gap:4px;">
                                                <div class="wa-status-pulse" style="width:8px;height:8px;background:currentColor;border-radius:50%;"></div>
                                                ${isStuck ? 'Likely Stuck' : 'Sending...'}
                                            </div>
                                            <button class="btn btn-danger" onclick="event.stopPropagation(); window.whatsAppSender.stopBroadcast('${log.id}')" 
                                                style="padding:4px 8px; font-size:0.65rem; border-radius:6px; height:auto;">
                                                STOP
                                            </button>
                                        </div>
                                    ` : ''}
                                    <button class="btn btn-primary" style="padding:8px 16px; border-radius:10px; font-size:0.8rem; font-weight:700; gap:6px;" 
                                        onclick="window.whatsAppSender.viewBroadcastDetails('${log.broadcastId || ''}', '${log.id}')">
                                        <i data-lucide="bar-chart-3" style="width:14px;height:14px;"></i> View Report
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');

                if (window.lucide) window.lucide.createIcons();
            }, err => {
                console.error("History sync error:", err);
                tbody.innerHTML = `<tr><td colspan="6" style="padding:40px; color:var(--danger); text-align:center; font-weight:600;"><i data-lucide="alert-triangle" style="vertical-align:middle;margin-right:8px;"></i> Failed to sync logs: ${err.message}</td></tr>`;
                if (window.lucide) window.lucide.createIcons();
            });
    };

    window.whatsAppSender._filterReportRows = function (status) {
        document.querySelectorAll('.wa-filter-btn').forEach(btn => {
            if (btn.getAttribute('data-filter') === status) {
                btn.classList.add('wa-filter-active');
            } else {
                btn.classList.remove('wa-filter-active');
            }
        });
        window.whatsAppSender._applyReportFilters();
    };

    // Apply both status and search filters
    window.whatsAppSender._applyReportFilters = function () {
        const activeBtn = document.querySelector('.wa-filter-btn.wa-filter-active');
        const status = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
        const searchInput = document.getElementById('wa-report-search');
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
        
        const rows = document.querySelectorAll('.wa-report-row');
        let visibleCount = 0;

        rows.forEach(row => {
            const rowStatus = row.getAttribute('data-status');
            const phoneEl = row.querySelector('.wa-phone-number');
            const phoneText = phoneEl ? phoneEl.textContent.trim().toLowerCase() : '';
            
            // 1. Status Check
            let statusMatch = status === 'all' || rowStatus === status;
            if (status === 'delivered' && rowStatus === 'read') statusMatch = true;
            if (status === 'sent' && (rowStatus === 'delivered' || rowStatus === 'read')) statusMatch = true;
            if (status === 'failed' && rowStatus === 'error') statusMatch = true;

            // 2. Search Check
            let searchMatch = true;
            if (searchTerm) {
                searchMatch = phoneText.includes(searchTerm);
            }

            const isVisible = statusMatch && searchMatch;

            if (isVisible) {
                visibleCount++;
                row.style.display = 'block';
                setTimeout(() => {
                    row.style.opacity = '1';
                    row.style.transform = 'scale(1)';
                }, 10);
            } else {
                row.style.opacity = '0';
                row.style.transform = 'scale(0.98)';
                setTimeout(() => {
                    row.style.display = 'none';
                }, 200);
            }
        });
        
        const countEl = document.getElementById('wa-report-count');
        if (countEl) {
            countEl.textContent = `Showing ${visibleCount} Recipients`;
        }
    };

    // Lookup recipient name by phone across all custom lists
    window.whatsAppSender.lookupNameInLists = async function (phoneStr, btnElement) {
        if (!phoneStr) return;
        const cleanTargetPhone = phoneStr.replace(/\D/g, '');

        // Update UI to searching state
        const originalHtml = btnElement.innerHTML;
        btnElement.innerHTML = `<i data-lucide="loader" style="width:12px;height:12px;animation:spin 1s linear infinite;margin-right:4px;display:inline-block;vertical-align:middle;"></i><span style="vertical-align:middle;">Searching...</span>`;
        if (window.lucide) window.lucide.createIcons();
        btnElement.disabled = true;

        try {
            // In Firestore, we have to iterate through the lists and then search members
            // This can be optimized but for now we follow the same logic as before but with Firestore
            const listsSnap = await firestore.collection('modules').doc('whatsapp_sender').collection('lists').get();

            let foundName = null;
            let foundListName = null;

            for (const listDoc of listsSnap.docs) {
                const list = listDoc.data();
                const membersSnap = await listDoc.ref.collection('members').get();

                for (const memberDoc of membersSnap.docs) {
                    const member = memberDoc.data();
                    if (!member.phone) continue;
                    const cleanMemberPhone = String(member.phone).replace(/\D/g, '');
                    if (cleanMemberPhone.endsWith(cleanTargetPhone) || cleanTargetPhone.endsWith(cleanMemberPhone)) {
                        foundName = member.name;
                        foundListName = list.name;
                        break;
                    }
                }
                if (foundName) break;
            }

            if (foundName) {
                // Return badge with name
                const badge = document.createElement('span');
                badge.className = 'wa-name-badge';
                badge.style.display = 'inline-block';
                badge.style.marginTop = '6px';
                badge.style.padding = '4px 10px';
                badge.style.fontSize = '0.75rem';
                badge.style.borderRadius = '12px';
                badge.style.background = 'rgba(56, 189, 248, 0.1)';
                badge.style.color = '#38bdf8';
                badge.style.border = '1px solid rgba(56, 189, 248, 0.2)';
                badge.innerHTML = `<i data-lucide="user" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i><span style="vertical-align:middle;font-weight:600;">${foundName}</span> <span style="opacity:0.6;font-size:0.65rem;margin-left:4px;">(in ${foundListName})</span>`;
                btnElement.replaceWith(badge);
                if (window.lucide) window.lucide.createIcons();
            } else {
                // Not found state
                btnElement.innerHTML = `<i data-lucide="user-x" style="width:12px;height:12px;margin-right:4px;display:inline-block;vertical-align:middle;"></i><span style="vertical-align:middle;">Not found</span>`;
                btnElement.style.color = 'var(--text-dim)';
                btnElement.style.borderColor = 'transparent';
                btnElement.style.background = 'rgba(255,255,255,0.05)';
                if (window.lucide) window.lucide.createIcons();
            }
        } catch (e) {
            console.error(e);
            btnElement.innerHTML = originalHtml;
            btnElement.disabled = false;
            if (window.lucide) window.lucide.createIcons();
            AppDialog.toast('Failed to lookup name.', 'danger');
        }
    };
    // --- Lists View ---

    window.whatsAppSender.renderListsView = function () {
        const container = document.getElementById('whatsapp-content-lists');
        if (!container) return;

        const isMaster = window.currentUserData?.isAdmin || window.currentUserData?.permissions?.whatsapp_sender === true || false;
        const canManageLists = isMaster || window.currentUserData?.permissions?.whatsapp_sender?.lists === true;

        container.innerHTML = `
            <div class="wa-lists-page">
                <div class="wa-lists-header">
                    <div class="wa-lists-title">
                        <i data-lucide="contact" style="width:20px;height:20px;color:var(--accent);"></i>
                        <span>Contact Lists</span>
                    </div>
                    ${canManageLists ? `
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-secondary" onclick="window.whatsAppSender.scanListDuplicates(this)" style="border-radius:12px; padding:8px 16px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);">
                            <i data-lucide="scan-search" style="width:15px;height:15px;color:var(--text-main);"></i> Scan for Duplicates
                        </button>
                        <button class="btn btn-primary" onclick="window.whatsAppSender.createListModal()" style="border-radius:12px; padding:8px 16px;">
                            <i data-lucide="plus" style="width:15px;height:15px;"></i> New List
                        </button>
                    </div>
                    ` : ''}
                </div>
                <div id="wa-lists-container" class="wa-lists-body">
                    <div class="wa-lists-loading">
                        <i data-lucide="loader" style="width:22px;height:22px;animation:spin 1s linear infinite;"></i>
                        Loading lists...
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        // Note: lists are kept current by the loadLists() listener started in initialize().
        // renderLists() will be called automatically when this.lists updates.
        this.renderLists();
    };

    window.whatsAppSender.scanListDuplicates = function (btnElement) {
        if (!this.lists || Object.keys(this.lists).length === 0) {
            AppDialog.toast('No custom lists found to scan.', 'info');
            return;
        }

        const originalHtml = btnElement.innerHTML;
        btnElement.innerHTML = `<i data-lucide="loader" style="width:15px;height:15px;animation:spin 1s linear infinite;"></i> Scanning...`;
        btnElement.disabled = true;
        if (window.lucide) window.lucide.createIcons();

        setTimeout(() => {
            const phoneMap = new Map(); // Map base integers to array of objects {listName, name}

            // Phase 1: Aggregation
            Object.values(this.lists).forEach(list => {
                if (!list.members) return;
                Object.values(list.members).forEach(member => {
                    if (!member.phone) return;
                    // Strip to base digits
                    const cleanPhone = String(member.phone).replace(/\D/g, '');
                    if (!cleanPhone) return;

                    // Standardize local comparison logic by matching endings (ignoring varying country tags 91 vs +91)
                    // We'll normalize by keeping the last 10 digits as the unique identifier if length > 10
                    let normalizedId = cleanPhone;
                    if (cleanPhone.length > 10) {
                        normalizedId = cleanPhone.slice(-10);
                    }

                    const entry = { listName: list.name, name: member.name || 'Unknown' };
                    if (phoneMap.has(normalizedId)) {
                        const existing = phoneMap.get(normalizedId);
                        existing.push(entry);
                    } else {
                        phoneMap.set(normalizedId, [entry]);
                    }
                });
            });

            // Phase 2: Filtering
            const duplicates = [];
            for (const [id, occurrences] of phoneMap.entries()) {
                if (occurrences.length > 1) {
                    duplicates.push({ id, occurrences });
                }
            }

            // Phase 3: Reporting View
            btnElement.innerHTML = originalHtml;
            btnElement.disabled = false;
            if (window.lucide) window.lucide.createIcons();

            if (duplicates.length === 0) {
                AppDialog.toast('Great! No duplicates found.', 'success');
                return;
            }

            let reportHtml = `
                <div style="margin-bottom:16px; font-size:0.9rem; color:var(--text-dim);">
                    Found <strong>${duplicates.length}</strong> duplicated phone numbers.
                </div>
                <div style="max-height: 400px; overflow-y:auto; border-radius:12px; border:1px solid rgba(255,255,255,0.05); background:rgba(0,0,0,0.2);">
            `;

            duplicates.forEach(dup => {
                reportHtml += `
                    <div style="padding:16px; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <div style="font-weight:700; font-family:monospace; color:var(--text-main); font-size:1.1rem; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
                            <i data-lucide="alert-triangle" style="width:16px;height:16px;color:#f59e0b;"></i> +xxxxxx${dup.id.slice(-4)}
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; padding-left:24px;">
                `;
                
                dup.occurrences.forEach(occ => {
                    reportHtml += `
                        <div style="display:flex; align-items:center; gap:8px; font-size:0.85rem;">
                            <div style="width:6px;height:6px;border-radius:50%;background:var(--accent);"></div>
                            <span style="color:var(--text-dim); width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${occ.listName}</span>
                            <span style="color:var(--text-main); font-weight:600;">${occ.name}</span>
                        </div>
                    `;
                });
                
                reportHtml += `
                        </div>
                    </div>
                `;
            });

            reportHtml += `</div>`;

            AppDialog.confirm(reportHtml, {
                title: 'Cross-List Duplicates Detected',
                isHtml: true,
                confirmText: 'Acknowledge',
                cancelText: 'Close',
                width: '500px'
            });

        }, 500); // Small UI defer
    };

    window.whatsAppSender.renderLists = function () {
        const container = document.getElementById('wa-lists-container');
        if (!container) return;

        const lists = Object.entries(this.lists).map(([id, list]) => ({ id, ...list }));

        const isMaster = window.currentUserData?.isAdmin || window.currentUserData?.permissions?.whatsapp_sender === true || false;
        const canManageLists = isMaster || window.currentUserData?.permissions?.whatsapp_sender?.lists === true;

        if (lists.length === 0) {
            container.innerHTML = `
                <div class="wa-lists-empty">
                    <div class="wa-lists-empty-icon">
                        <i data-lucide="users" style="width:36px;height:36px;color:var(--accent);opacity:0.5;"></i>
                    </div>
                    <p>No contact lists yet</p>
                    <span>${canManageLists ? 'Create a list to group your contacts for targeted broadcasts.' : 'You do not have lists yet.'}</span>
                    ${canManageLists ? `
                    <button class="btn btn-primary" onclick="window.whatsAppSender.createListModal()">
                        <i data-lucide="plus" style="width:14px;height:14px;"></i> Create First List
                    </button>
                    ` : ''}
                </div>
                `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const newLists = lists.filter(l => l.used !== true);
        const usedLists = lists.filter(l => l.used === true);

        const colors = ['#25d366', '#f97316', '#a78bfa', '#38bdf8', '#fb7185', '#4ade80'];
        
        let htmlStr = '';

        if (newLists.length > 0) {
            htmlStr += `
                <div style="font-size:0.9rem; font-weight:600; color:var(--text-dim); margin-bottom:12px; margin-top:4px;">Active Lists</div>
                <div class="wa-lists-grid">
                    ${newLists.map((list, i) => {
                const color = colors[i % colors.length];
                const initials = (list.name || '?').substring(0, 2).toUpperCase();
                const count = list.contactsCount || list.count || 0;
                const numbersCount = list.numbersCount || count;
                const dateStr = list.createdAt ? (list.createdAt.toDate ? list.createdAt.toDate() : new Date(list.createdAt)).toLocaleDateString() : 'N/A';
                
                return `
                        <div class="wa-list-row" onclick="window.whatsAppSender.viewListDetails('${list.id}')">
                            <div class="wa-list-avatar" style="background:${color}22;color:${color};">${initials}</div>
                            <div class="wa-list-info">
                                <div class="wa-list-name">${list.name}</div>
                                <div class="wa-list-sub" style="display:flex; flex-direction:column; gap:2px;">
                                    <span>${count} contact${count !== 1 ? 's' : ''} • ${numbersCount} unique number${numbersCount !== 1 ? 's' : ''}</span>
                                    <span style="font-size:0.7rem; opacity:0.6; display:flex; align-items:center; gap:4px;">
                                        <i data-lucide="calendar" style="width:10px;height:10px;"></i> Created ${dateStr}
                                    </span>
                                </div>
                            </div>
                            <div class="wa-list-badge" title="Unique Numbers">${numbersCount}</div>
                            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-dim);flex-shrink:0;"></i>
                        </div>
                    `}).join('')}
                </div>
            `;
        }

        if (usedLists.length > 0) {
            htmlStr += `
                <div style="font-size:0.9rem; font-weight:600; color:#ef4444; margin-bottom:12px; margin-top:24px; display:flex; gap:6px; align-items:center;">
                    <i data-lucide="lock" style="width:14px;height:14px;"></i> Locked / Used Lists
                </div>
                <div style="font-size:0.8rem; color:var(--text-dim); margin-bottom:12px;">These lists have been used in past broadcasts and are permanently locked to preserve analytics.</div>
                <div class="wa-lists-grid">
                    ${usedLists.map((list, i) => {
                const color = colors[i % colors.length];
                const initials = (list.name || '?').substring(0, 2).toUpperCase();
                const count = list.contactsCount || list.count || 0;
                const numbersCount = list.numbersCount || count;
                const dateStr = list.createdAt ? (list.createdAt.toDate ? list.createdAt.toDate() : new Date(list.createdAt)).toLocaleDateString() : 'N/A';

                return `
                        <div class="wa-list-row" onclick="window.whatsAppSender.viewListDetails('${list.id}')" style="opacity: 0.7; background: rgba(0,0,0,0.15);">
                            <div class="wa-list-avatar" style="background:${color}22;color:${color};">${initials}</div>
                            <div class="wa-list-info">
                                <div class="wa-list-name">${list.name}</div>
                                <div class="wa-list-sub" style="display:flex; flex-direction:column; gap:2px;">
                                    <span>${count} contact${count !== 1 ? 's' : ''} • ${numbersCount} unique number${numbersCount !== 1 ? 's' : ''}</span>
                                    <span style="font-size:0.7rem; opacity:0.6;">Created ${dateStr}</span>
                                </div>
                            </div>
                            <div class="wa-list-badge" style="background:rgba(255,255,255,0.05);color:var(--text-dim);">${numbersCount}</div>
                            <i data-lucide="lock" style="width:14px;height:14px;color:rgba(239,68,68,0.8);flex-shrink:0;"></i>
                        </div>
                    `}).join('')}
                </div>
            `;
        }

        container.innerHTML = htmlStr;
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.viewListDetails = function (listId) {
        const list = this.lists[listId];
        if (!list) return;

        const container = document.getElementById('whatsapp-content-lists');

        const isMaster = window.currentUserData?.isAdmin || window.currentUserData?.permissions?.whatsapp_sender === true || false;
        const canManageLists = isMaster || window.currentUserData?.permissions?.whatsapp_sender?.lists === true;

        container.innerHTML = `
            <div class="wa-lists-page">
                <!-- Detail header -->
                <div class="wa-lists-header" style="border-bottom:1px solid var(--card-border); padding-bottom:16px; margin-bottom:0;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <button class="btn-icon" onclick="window.whatsAppSender.renderListsView()" title="Back to lists">
                            <i data-lucide="arrow-left" style="width:18px;height:18px;"></i>
                        </button>
                        <div class="wa-list-avatar" style="background:var(--accent-faint);color:var(--accent);font-size:1rem;">
                            ${(list.name || '?').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <div id="wa-list-name-display" style="font-size:1.05rem;font-weight:700;color:var(--text-main);cursor:${canManageLists ? 'pointer' : 'default'};" ${canManageLists ? `onclick="window.whatsAppSender.editListNameInline('${listId}')" title="Click to rename"` : ''}>${list.name}</div>
                                ${canManageLists ? `
                                <button class="btn-icon" onclick="window.whatsAppSender.editListNameInline('${listId}')" title="Rename list" style="color:var(--text-dim);">
                                    <i data-lucide="pencil" style="width:14px;height:14px;"></i>
                                </button>
                                ` : ''}
                            </div>
                            <div style="font-size:0.75rem;color:var(--text-dim); display:flex; flex-direction:column; gap:2px;" id="wa-detail-count">
                                <div>${list.contactsCount || list.count || 0} contacts • ${list.numbersCount || list.count || 0} unique numbers</div>
                                <div style="font-size:0.65rem; opacity:0.7; display:flex; align-items:center; gap:4px;">
                                    <i data-lucide="calendar" style="width:10px;height:10px;"></i>
                                    Created ${list.createdAt ? (list.createdAt.toDate ? list.createdAt.toDate() : new Date(list.createdAt)).toLocaleDateString() : 'N/A'}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        ${canManageLists ? `
                        <button class="btn btn-secondary" onclick="window.whatsAppSender.uploadCsvModal('${listId}')" title="Upload CSV">
                            <i data-lucide="upload" style="width:14px;height:14px;"></i> Upload CSV
                        </button>
                        <button class="btn btn-primary" onclick="window.whatsAppSender.addContactModal('${listId}')">
                            <i data-lucide="user-plus" style="width:14px;height:14px;"></i> Add Contact
                        </button>
                        ${list.used === true ? `
                        <button class="btn-icon" style="color:#ef4444; opacity:0.7; cursor:not-allowed;" title="List locked (used in broadcast)" disabled>
                            <i data-lucide="lock" style="width:16px;height:16px;"></i>
                        </button>
                        ` : `
                        <button class="btn-icon danger" onclick="window.whatsAppSender.deleteList('${listId}')" title="Delete list">
                            <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                        </button>
                        `}
                        ` : ''}
                    </div>
                </div>

                <!-- Members table wrapper -->
                <div class="wa-lists-body" style="padding-top:0;">
                    <div id="wa-list-members-container" class="wa-members-container">
                        <div class="wa-lists-loading">
                            <i data-lucide="loader" style="width:20px;height:20px;animation:spin 1s linear infinite;"></i>
                            Loading members...
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        // Subscribe to members in Firestore
        const membersRef = firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).collection('members');
        if (this._membersUnsubscribe) this._membersUnsubscribe();
        this._membersUnsubscribe = membersRef.onSnapshot((querySnapshot) => {
            const members = {};
            querySnapshot.forEach(doc => {
                members[doc.id] = doc.data();
            });
            this.renderListMembers(listId, list, members);
        }, (error) => {
            console.error("Error loading members:", error);
            AppDialog.toast('Failed to load members.', 'error');
        });
    };

    window.whatsAppSender.editListNameInline = function (listId) {
        const displayEl = document.getElementById('wa-list-name-display');
        if (!displayEl || displayEl.querySelector('input')) return; // already editing

        const currentName = displayEl.textContent.trim();
        displayEl.innerHTML = `
            <input id="wa-list-rename-input" type="text" value="${currentName}" class="wa-modal-input" style="width:200px; padding:4px 8px; font-size:1rem; font-weight:700; margin-bottom:0;" autofocus>
        `;
        const input = displayEl.querySelector('input');
        input.focus();
        input.select();

        const save = () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).update({ name: newName });
            }
            displayEl.innerHTML = `<span style="cursor:pointer;" onclick="window.whatsAppSender.editListNameInline('${listId}')">${newName || currentName}</span>`;
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') {
                displayEl.innerHTML = `<span style="cursor:pointer;" onclick="window.whatsAppSender.editListNameInline('${listId}')">${currentName}</span>`;
            }
        });
    };


    window.whatsAppSender.renderListMembers = function (listId, list, members) {
        const container = document.getElementById('wa-list-members-container');
        if (!container) return;

        const membersList = Object.entries(members).map(([key, m]) => ({ key, ...m }));

        // Update count
        const countEl = document.getElementById('wa-detail-count');
        if (countEl) countEl.textContent = `${membersList.length} contact${membersList.length !== 1 ? 's' : ''}`;

        if (membersList.length === 0) {
            container.innerHTML = `
                <div class="wa-lists-empty" style="padding:40px 0;">
                    <div class="wa-lists-empty-icon">
                        <i data-lucide="user-x" style="width:32px;height:32px;color:var(--accent);opacity:0.5;"></i>
                    </div>
                    <p>No contacts in this list</p>
                    <span>Add contacts to get started with broadcasts.</span>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // Determine the column set: always name and phone, then any extra keys from the first member
        const systemKeys = new Set(['key', 'name', 'phone', 'addedAt']);
        const extraKeys = new Set();
        // Include custom fields defined on the list schema first
        if (list && list.customFields && Array.isArray(list.customFields)) {
            list.customFields.forEach(f => extraKeys.add(f));
        }
        // Also collect any extra keys found on actual member records
        membersList.forEach(m => {
            Object.keys(m).forEach(k => {
                if (!systemKeys.has(k)) extraKeys.add(k);
            });
        });
        const extraCols = Array.from(extraKeys);

        const isMaster = window.currentUserData?.isAdmin || window.currentUserData?.permissions?.whatsapp_sender === true || false;
        const canManageLists = isMaster || window.currentUserData?.permissions?.whatsapp_sender?.lists === true;

        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--card-border);">
                            <th style="text-align:left;padding:8px 12px;color:var(--text-dim);font-weight:600;">Name</th>
                            <th style="text-align:left;padding:8px 12px;color:var(--text-dim);font-weight:600;">Phone</th>
                            ${extraCols.map(col => `<th style="text-align:left;padding:8px 12px;color:var(--text-dim);font-weight:600;">${col}</th>`).join('')}
                            ${canManageLists ? '<th style="padding:8px 12px;"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${membersList.map(m => `
                            <tr style="border-bottom:1px solid var(--card-border);" onmouseenter="this.style.background='var(--surface-hover, rgba(255,255,255,0.03))'" onmouseleave="this.style.background='';">
                                <td style="padding:10px 12px;color:var(--text-main);font-weight:500;">${m.name || '—'}</td>
                                <td style="padding:10px 12px;color:var(--text-dim);font-family:monospace;">${m.phone || '—'}</td>
                                ${extraCols.map(col => `<td style="padding:10px 12px;color:var(--text-dim);">${m[col] !== undefined ? m[col] : '—'}</td>`).join('')}
                                ${canManageLists ? `
                                <td style="padding:10px 12px;display:flex;gap:6px;justify-content:flex-end;">
                                    <button class="btn-icon" onclick="window.whatsAppSender.editMemberModal('${listId}', '${m.key}')" title="Edit" style="color:var(--accent);">
                                        <i data-lucide="pencil" style="width:14px;height:14px;"></i>
                                    </button>
                                    <button class="btn-icon danger" onclick="window.whatsAppSender.removeMemberFromList('${listId}', '${m.key}')" title="Remove">
                                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                                    </button>
                                </td>
                                ` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    };


    window.whatsAppSender.viewBroadcastDetails = async function (broadcastId, logId) {
        this.switchView('history'); // Ensure redirection to history tab
        const container = document.getElementById('whatsapp-content-history');
        if (!container) return;
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:400px; color:var(--text-dim); gap:20px;">
                <i data-lucide="loader" style="width:40px;height:40px;animation:spin 1s linear infinite;"></i>
                <h3>Syncing Live Report...</h3>
            </div>`;
        if (window.lucide) window.lucide.createIcons();

        let meta = {}, recipients = {};
        if (this._historyDetailsUnsubscribe) this._historyDetailsUnsubscribe();
        if (this._logsDetailsUnsubscribe) this._logsDetailsUnsubscribe();

        this._historyDetailsUnsubscribe = firestore.collection('modules').doc('whatsapp_sender').collection('history').doc(logId)
            .onSnapshot(doc => { 
                meta = doc.data() || {}; 
                this.renderBroadcastDetails(broadcastId, logId, meta, recipients); 
            });

        const logsRef = firebase.database().ref('modules/whatsapp_sender/broadcast_logs');
        const query = logsRef.orderByChild('broadcastId').equalTo(broadcastId);
        const listener = query.on('value', snap => { 
            recipients = snap.val() || {}; 
            this.renderBroadcastDetails(broadcastId, logId, meta, recipients); 
        }, err => {
            console.error(err);
            AppDialog.toast('Error loading recipient logs.', 'error');
        });
        this._logsDetailsUnsubscribe = () => query.off('value', listener);
    };

    window.whatsAppSender._getEffectiveStatus = function (m) {
        let status = (m.status || 'unknown').toLowerCase();
        let error = m.error || null;

        // Check statusHistory for hidden failures if top-level is processing
        if (status === 'processing' && m.statusHistory) {
            const history = Object.values(m.statusHistory);
            const failure = history.find(h => h.status === 'failed' || h.status === 'error');
            if (failure) {
                status = 'failed';
                error = failure.error || 'Unknown error in history';
            }
        }
        return { status, error };
    };

    window.whatsAppSender.renderBroadcastDetails = function (broadcastId, logId, meta, recipients) {
        const container = document.getElementById('whatsapp-content-history');
        if (!container) return;
        
        if (!container.querySelector('.wa-report-container') || container.getAttribute('data-active-report') !== logId) {
            container.setAttribute('data-active-report', logId);
            this._renderReportSkeleton(container, broadcastId, logId, meta);
        }

        const recipientsArray = Object.values(recipients).sort((a,b) => (a.timestamp||0)-(b.timestamp||0));
        let processing = 0, sent = 0, read = 0, deliv = 0, fail = 0, excluded = 0, total = recipientsArray.length;
        
        recipientsArray.forEach(m => {
            const { status } = this._getEffectiveStatus(m);
            if (status === 'processing') processing++;
            else if (status === 'failed' || status === 'error') fail++;
            else if (status === 'read') read++;
            else if (status === 'delivered') deliv++;
            else if (status === 'sent') sent++;
            else if (status === 'excluded') excluded++;
        });

        // The 'TOTAL SENT' metric should include everything that reached 'sent', 'delivered' or 'read'
        const totalSentReached = sent + deliv + read;

        this._updateReportLiveProgress(meta);
        this._updateReportStatsDashboard(total, processing, totalSentReached, deliv, read, fail, excluded);
        this._updateRecipientRowsList(recipientsArray);

        if (window.lucide) window.lucide.createIcons({ root: container });
    };

    window.whatsAppSender._renderReportSkeleton = function (container, broadcastId, logId, meta) {
        const dateStr = meta.timestamp ? (meta.timestamp.toDate ? meta.timestamp.toDate() : new Date(meta.timestamp)).toLocaleString() : '—';
        container.innerHTML = `
            <div class="wa-report-container" style="padding:24px;">
                <div class="wa-lists-header" style="margin-bottom:24px; border-bottom:1px solid var(--border); padding-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <button class="btn-icon" onclick="window.whatsAppSender.renderHistoryView()" title="Back"><i data-lucide="arrow-left"></i></button>
                        <div>
                            <h2 id="wa-report-title" style="margin:0; font-size:1.4rem; color:var(--text-main);">${meta.campaignName || 'Broadcast Report'}</h2>
                            <div style="font-size:0.85rem; color:var(--text-dim); margin-top:4px;">
                                <i data-lucide="calendar" style="width:12px;height:12px;margin-right:4px;"></i>${dateStr} • 
                                <i data-lucide="users" style="width:12px;height:12px;margin-right:4px;margin-left:8px;"></i>${meta.listName || 'Custom List'}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-secondary" onclick="window.whatsAppSender.viewBroadcastDetails('${broadcastId}', '${logId}')"><i data-lucide="refresh-cw" style="width:14px;height:14px;margin-right:6px;"></i> Refresh</button>
                    </div>
                </div>

                <div id="wa-live-progress-mount"></div>
                <div id="wa-report-dashboard-mount"></div>

                <div style="background:var(--card-bg); border:1px solid var(--border); border-radius:16px; padding:20px; margin-bottom:24px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                        <div style="display:flex; gap:8px;" id="wa-report-filters">
                            <button class="btn btn-secondary wa-filter-btn wa-filter-active" data-filter="all" onclick="window.whatsAppSender._filterReportRows('all')" style="border-radius:20px; padding:6px 16px;">All</button>
                            <button class="btn btn-secondary wa-filter-btn" data-filter="processing" onclick="window.whatsAppSender._filterReportRows('processing')" style="border-radius:20px; padding:6px 16px;">Processing</button>
                            <button class="btn btn-secondary wa-filter-btn" data-filter="read" onclick="window.whatsAppSender._filterReportRows('read')" style="border-radius:20px; padding:6px 16px;">Read</button>
                            <button class="btn btn-secondary wa-filter-btn" data-filter="failed" onclick="window.whatsAppSender._filterReportRows('failed')" style="border-radius:20px; padding:6px 16px;">Failed</button>
                        </div>
                        <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:280px; justify-content:flex-end;">
                            <div style="position:relative; flex:1; max-width:300px;">
                                <i data-lucide="search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); width:14px; height:14px; color:var(--text-dim);"></i>
                                <input type="text" id="wa-report-search" placeholder="Search phone or name..." oninput="window.whatsAppSender._applyReportFilters()" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); border-radius:20px; padding:8px 16px 8px 34px; color:var(--text-main); font-size:0.85rem; outline:none; width:100%;">
                            </div>
                            <div id="wa-report-count" style="font-size:0.85rem; color:var(--text-dim); font-weight:600; white-space:nowrap;"></div>
                        </div>
                    </div>
                </div>

                <div id="wa-report-recipients-grid" style="display:flex; flex-direction:column; gap:12px;"></div>
            </div>`;
    };

    window.whatsAppSender._updateReportLiveProgress = function (meta) {
        const mount = document.getElementById('wa-live-progress-mount');
        if (!mount) return;
        if (meta.status !== 'dispatching') { mount.innerHTML = ''; return; }
        
        const cPct = Math.round(((meta.processedContactsCount || 0) / (meta.contactsCount || 1)) * 100);
        const nPct = Math.round(((meta.processedNumbersCount || 0) / (meta.recipientsCount || 1)) * 100);
        
        mount.innerHTML = `
            <div style="background:linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(37,211,102,0.05) 100%); border:1px solid rgba(59,130,246,0.2); border-radius:20px; padding:24px; margin-bottom:32px; box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <div class="wa-status-pulse" style="width:48px; height:48px; background:#3b82f6; border-radius:14px; display:flex; align-items:center; justify-content:center; color:white; box-shadow:0 0 20px rgba(59,130,246,0.4);">
                            <i data-lucide="send" style="width:24px;height:24px;"></i>
                        </div>
                        <div>
                            <div style="font-weight:800; color:#3b82f6; font-size:1.1rem; letter-spacing:-0.01em;">Actively Sending Messages</div>
                            <div style="font-size:0.85rem; color:var(--text-dim); margin-top:2px;">Targeting: <strong style="color:var(--text-main);">${meta.currentContactName || 'Calculating...'}</strong></div>
                        </div>
                    </div>
                    <button class="btn btn-danger" style="border-radius:12px; padding:8px 20px; font-weight:700;" onclick="window.whatsAppSender.stopBroadcast('${meta.broadcastId}')">
                        <i data-lucide="square" style="width:14px;height:14px;margin-right:6px;"></i> Stop Broadcast
                    </button>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:32px;">
                    <div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <span style="font-size:0.75rem; color:var(--text-dim); font-weight:700; text-transform:uppercase;">Contacts Reached</span>
                            <span style="font-size:0.75rem; color:var(--text-main); font-weight:800;">${cPct}%</span>
                        </div>
                        <div style="height:10px; background:rgba(255,255,255,0.05); border-radius:5px; overflow:hidden;">
                            <div style="height:100%; background:linear-gradient(90deg, #3b82f6, #60a5fa); width:${cPct}%; transition:width 0.5s ease; box-shadow:0 0 10px rgba(59,130,246,0.5);"></div>
                        </div>
                        <div style="font-size:0.75rem; margin-top:8px; color:var(--text-dim);">${meta.processedContactsCount || 0} of ${meta.contactsCount || 0} unique contacts</div>
                    </div>
                    <div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <span style="font-size:0.75rem; color:var(--text-dim); font-weight:700; text-transform:uppercase;">Messages Delivered</span>
                            <span style="font-size:0.75rem; color:var(--text-main); font-weight:800;">${nPct}%</span>
                        </div>
                        <div style="height:10px; background:rgba(255,255,255,0.05); border-radius:5px; overflow:hidden;">
                            <div style="height:100%; background:linear-gradient(90deg, #38bdf8, #7dd3fc); width:${nPct}%; transition:width 0.5s ease; box-shadow:0 0 10px rgba(56,189,248,0.5);"></div>
                        </div>
                        <div style="font-size:0.75rem; margin-top:8px; color:var(--text-dim);">${meta.processedNumbersCount || 0} of ${meta.recipientsCount || 0} total phone numbers</div>
                    </div>
                </div>
            </div>`;
    };

    window.whatsAppSender._updateReportStatsDashboard = function (total, processing, sent, deliv, read, fail, excluded) {
        const mount = document.getElementById('wa-report-dashboard-mount');
        if (!mount) return;
        
        const billable = total - excluded;
        const readPct = billable > 0 ? Math.round((read/billable)*100) : 0;
        const delivPct = billable > 0 ? Math.round(((deliv+read)/billable)*100) : 0;
        const failPct = billable > 0 ? Math.round((fail/billable)*100) : 0;

        mount.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:20px; margin-bottom:32px;">
                <div class="wa-stat-card" style="background:var(--card-bg); border:1px solid var(--border); border-radius:20px; padding:24px; position:relative; overflow:hidden;">
                    <div style="position:absolute; top:0; right:0; padding:16px; opacity:0.1;"><i data-lucide="eye" style="width:48px;height:48px;color:#a855f7;"></i></div>
                    <div style="color:#a855f7; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Open Rate</div>
                    <div style="font-size:2.4rem; font-weight:900; color:var(--text-main); line-height:1; margin-bottom:4px;">${readPct}%</div>
                    <div style="font-size:0.85rem; color:var(--text-dim);">${read} messages read</div>
                </div>
                <div class="wa-stat-card" style="background:var(--card-bg); border:1px solid var(--border); border-radius:20px; padding:24px; position:relative; overflow:hidden;">
                    <div style="position:absolute; top:0; right:0; padding:16px; opacity:0.1;"><i data-lucide="check-check" style="width:48px;height:48px;color:#3b82f6;"></i></div>
                    <div style="color:#3b82f6; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Delivery Rate</div>
                    <div style="font-size:2.4rem; font-weight:900; color:var(--text-main); line-height:1; margin-bottom:4px;">${delivPct}%</div>
                    <div style="font-size:0.85rem; color:var(--text-dim);">${deliv + read} delivered</div>
                </div>
                <div class="wa-stat-card" style="background:var(--card-bg); border:1px solid var(--border); border-radius:20px; padding:24px; position:relative; overflow:hidden;">
                    <div style="position:absolute; top:0; right:0; padding:16px; opacity:0.1;"><i data-lucide="loader" style="width:48px;height:48px;color:#f59e0b;"></i></div>
                    <div style="color:#f59e0b; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Processing</div>
                    <div style="font-size:2.4rem; font-weight:900; color:var(--text-main); line-height:1; margin-bottom:4px;">${processing}</div>
                    <div style="font-size:0.85rem; color:var(--text-dim);">Awaiting confirmation</div>
                </div>
                <div class="wa-stat-card" style="background:var(--card-bg); border:1px solid var(--border); border-radius:20px; padding:24px; position:relative; overflow:hidden;">
                    <div style="position:absolute; top:0; right:0; padding:16px; opacity:0.1;"><i data-lucide="alert-circle" style="width:48px;height:48px;color:#ef4444;"></i></div>
                    <div style="color:#ef4444; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Failed</div>
                    <div style="font-size:2.4rem; font-weight:900; color:${fail > 0 ? '#ef4444' : 'var(--text-main)'}; line-height:1; margin-bottom:4px;">${fail}</div>
                    <div style="font-size:0.85rem; color:var(--text-dim);">${excluded > 0 ? `${excluded} excluded • ` : ''}${failPct}% error rate</div>
                </div>
            </div>`;

        const countEl = document.getElementById('wa-report-count');
        if (countEl) countEl.innerText = `${total} Recipients`;
    };

    window.whatsAppSender._updateRecipientRowsList = function (recipients) {
        const grid = document.getElementById('wa-report-recipients-grid');
        if (!grid) return;
        
        const statusConfig = {
            processing: { color: '#f59e0b', icon: 'loader', label: 'Processing', bg: 'rgba(245,158,11,0.1)' },
            sent: { color: '#38bdf8', icon: 'send', label: 'Sent', bg: 'rgba(56,189,248,0.1)' },
            delivered: { color: '#3b82f6', icon: 'check', label: 'Delivered', bg: 'rgba(59,130,246,0.1)' },
            read: { color: '#a855f7', icon: 'eye', label: 'Read', bg: 'rgba(168,85,247,0.1)' },
            failed: { color: '#ef4444', icon: 'alert-circle', label: 'Failed', bg: 'rgba(239,68,68,0.1)' },
            error: { color: '#ef4444', icon: 'alert-circle', label: 'Failed', bg: 'rgba(239,68,68,0.1)' },
            excluded: { color: '#94a3b8', icon: 'slash', label: 'Excluded', bg: 'rgba(148,163,184,0.1)' }
        };
        
        recipients.forEach(m => {
            const { status, error } = this._getEffectiveStatus(m);
            const cleanPhone = String(m.phone || m.recipientId || '').replace(/\D/g, '');
            const rowId = `wa-row-${m.messageId ? m.messageId.replace(/[.#$/[\]]/g, "_") : cleanPhone}`;
            let row = document.getElementById(rowId);
            
            if (!row) {
                row = document.createElement('div');
                row.id = rowId;
                row.className = 'wa-report-item';
                grid.appendChild(row);
            }
            
            // Optimization: Only re-render if status, error, or timestamp changed
            const currentStatus = row.getAttribute('data-status');
            const currentError = row.getAttribute('data-error');
            const currentUpdated = row.getAttribute('data-updated');
            
            if (currentStatus === status && currentError === String(error) && currentUpdated === String(m.timestamp)) return;
            
            const isExpanded = row.classList.contains('expanded');
            row.setAttribute('data-status', status);
            row.setAttribute('data-error', String(error));
            row.setAttribute('data-updated', String(m.timestamp));
            
            const conf = statusConfig[status] || { color: '#94a3b8', icon: 'circle', label: status, bg: 'rgba(148,163,184,0.1)' };
            
            row.innerHTML = `
                <div class="wa-status-stripe" style="background:${conf.color};"></div>
                
                <div class="wa-report-tab-header" onclick="window.whatsAppSender.toggleRecipientExpansion('${rowId}')">
                    <div style="display:flex; align-items:center; gap:16px; flex:1;">
                        <div style="width:36px; height:36px; border-radius:10px; background:${conf.bg}; color:${conf.color}; display:flex; align-items:center; justify-content:center;">
                            <i data-lucide="${conf.icon}" style="width:18px;height:18px;"></i>
                        </div>
                        <div>
                            <div style="font-weight:700; color:var(--text-main); font-size:0.95rem;">${m.name || 'Unknown Recipient'}</div>
                            <div style="font-size:0.8rem; color:var(--text-dim); font-family:monospace;">+${cleanPhone}</div>
                        </div>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:16px;">
                        <div style="background:${conf.bg}; color:${conf.color}; font-size:0.65rem; font-weight:800; padding:4px 10px; border-radius:8px; text-transform:uppercase; letter-spacing:0.02em; border:1px solid ${conf.color}22;">
                            ${conf.label}
                        </div>
                        <i data-lucide="chevron-down" class="wa-chevron" style="width:16px;height:16px;"></i>
                    </div>
                </div>

                <div class="wa-report-tab-content">
                    ${error ? `
                        <div style="color:#ef4444; font-size:0.8rem; padding:12px 16px; background:rgba(239,68,68,0.06); border-radius:12px; border:1px solid rgba(239,68,68,0.15); margin-bottom:20px; line-height:1.4;">
                            <div style="font-weight:700; display:flex; align-items:center; gap:6px; margin-bottom:4px;"><i data-lucide="alert-triangle" style="width:14px;height:14px;"></i> Delivery Error</div>
                            ${error}
                        </div>
                    ` : ''}
                    
                    <div class="wa-pipeline-container">
                        <div style="display:flex; justify-content:space-between; align-items:center; position:relative; padding:0 4px;">
                            <div style="position:absolute; top:6px; left:12px; right:12px; height:2px; background:rgba(255,255,255,0.05); z-index:0;"></div>
                            
                            ${['sent', 'delivered', 'read'].map((step, si) => {
                                const ts = step === 'sent' ? m.sentAt : step === 'delivered' ? m.deliveredAt : m.readAt;
                                const active = !!ts;
                                const stepColor = active ? statusConfig[step].color : 'var(--border)';
                                
                                return `
                                    <div class="wa-pipeline-step ${active ? 'active' : ''}" style="color:${active ? stepColor : 'var(--text-dim)'}">
                                        <div class="wa-step-circle" style="background:${active ? stepColor : 'var(--card-bg)'}; border:2px solid ${active ? stepColor : 'rgba(255,255,255,0.1)'};"></div>
                                        <span style="font-size:0.6rem; font-weight:700; text-transform:uppercase;">${step}</span>
                                        <span style="font-size:0.55rem; opacity:0.8;">${ts ? new Date(ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
            
            if (isExpanded) row.classList.add('expanded');
        });
        
        if (window.lucide) window.lucide.createIcons({ root: grid });
    };

    window.whatsAppSender.toggleRecipientExpansion = function (rowId) {
        const row = document.getElementById(rowId);
        if (!row) return;
        
        const isExpanding = !row.classList.contains('expanded');
        
        // Optional: Close others
        // document.querySelectorAll('.wa-report-item.expanded').forEach(el => {
        //     if (el !== row) el.classList.remove('expanded');
        // });
        
        row.classList.toggle('expanded');
    };

    window.whatsAppSender.stopBroadcast = async function (logId) {
        if (!logId) return;
        const confirmStop = await AppDialog.confirm('Stop this broadcast? This will prevent any further messages from being sent.');
        if (!confirmStop) return;
        try {
            await firebase.database().ref(`modules/whatsapp_sender/broadcast_history/${logId}`).update({ stopRequested: true });
            AppDialog.toast('Stop signal sent.', 'info');
        } catch (e) { AppDialog.toast('Failed to stop: ' + e.message, 'error'); }
    };
}
