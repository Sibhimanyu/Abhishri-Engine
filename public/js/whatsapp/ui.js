
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

        // Update URL hash only if needed
        let hash = `whatsapp/${viewName}`;
        if (window.location.hash !== `#${hash}`) {
            window.location.hash = hash;
        }

        // Update Sidebar and UI visibility
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
                                ${Object.entries(this.lists).map(([id, list]) => `<option value="list:${id}">${list.name} (${list.count || 0})</option>`).join('')}
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
                    const name = t.template_name || t.name;
                    const components = t.components || [];
                    const bodyComp = components.find(c => c.type === 'BODY') || {};
                    const content = bodyComp.text || '';
                    const category = t.category || t.previous_category || 'UNKNOWN';
                    const headerComp = components.find(c => c.type === 'HEADER' && c.format === 'IMAGE');
                    const headerImageUrl = headerComp && headerComp.example && headerComp.example.header_handle ? (headerComp.example.header_handle[0] || '') : '';
                    const hasImageHeader = !!headerComp;
                    const footerComp = components.find(c => c.type === 'FOOTER') || {};
                    const footerText = footerComp.text || '';
                    const buttonsComp = components.find(c => c.type === 'BUTTONS') || {};
                    const buttonsJson = buttonsComp.buttons ? encodeURIComponent(JSON.stringify(buttonsComp.buttons)) : '';
                    return `<option value="${name}" data-content="${encodeURIComponent(content)}" data-category="${category}" data-header-image="${headerImageUrl}" data-needs-image="${hasImageHeader}" data-footer="${encodeURIComponent(footerText)}" data-buttons="${buttonsJson}">${name} (${category} - ${t.language || 'en'})</option>`;
                }).join('') : `<option value="" disabled selected>No templates found from API</option>`}
                            </select>                        </div>

                        <!-- Frequency Protection -->
                        <div class="bcast-field-group" style="padding-top:0;">
                            <label class="bcast-label">
                                <i data-lucide="shield" style="width:14px;height:14px;"></i> Shield
                            </label>
                            <button class="btn btn-secondary full-width" onclick="window.whatsAppSender.openFrequencyProtection()" 
                                style="height: 44px; border-radius: 12px; background: rgba(102, 200, 200, 0.06); border: 1px solid rgba(102, 200, 200, 0.2); color: var(--accent-secondary); font-weight: 700; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.2s;"
                                onmouseenter="this.style.background='rgba(102, 200, 200, 0.12)'; this.style.borderColor='rgba(102, 200, 200, 0.4)';"
                                onmouseleave="this.style.background='rgba(102, 200, 200, 0.06)'; this.style.borderColor='rgba(102, 200, 200, 0.2)';"
                            >
                                <i data-lucide="shield-check" style="width:18px;height:18px;"></i> Smart Protection Scanner
                            </button>
                        </div>

                        <!-- Variables (injected dynamically) -->
                        <div id="wa-template-variables"></div>

                    </div>

                    <!-- Send Button pinned at bottom -->
                    <div class="broadcast-form-footer">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:0 4px;">
                            <span style="font-size:0.85rem; color:var(--text-dim); display:flex; align-items:center; gap:8px;">
                                <i data-lucide="flask-conical" style="width:14px;height:14px;color:#f59e0b;"></i> Simulation Mode
                            </span>
                            <label class="wa-switch">
                                <input type="checkbox" id="wa-broadcast-simulate">
                                <span class="wa-slider" style="border-radius:34px;">
                                    <span style="position:absolute; content:''; height:14px; width:14px; left:4px; bottom:3px; background-color:white; transition:.3s; border-radius:50%;" class="wa-slider-dot"></span>
                                </span>
                            </label>
                        </div>
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
        const needsImageHeader = select.options[select.selectedIndex].getAttribute('data-needs-image') === 'true';
        const headerImageUrl = select.options[select.selectedIndex].getAttribute('data-header-image');

        // Find existing numeric ID from the template data
        const templateData = this.templates.find(t => (t.template_name || t.name) === select.value || t.id === select.value) || {};

        if (currentInputs.length !== uniqueVars.length || !varsContainer.querySelector('.wa-media-upload-section') || varsContainer.getAttribute('data-active-template') !== select.value) {
            varsContainer.setAttribute('data-active-template', select.value);
            let html = '';

            // 1. Add Media Upload section if needed
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
        try { buttons = buttonsRaw ? JSON.parse(decodeURIComponent(buttonsRaw)) : []; } catch (e) { buttons = []; }

        // Replace body variables with entered values
        const inputs = document.querySelectorAll('.wa-var-input');
        inputs.forEach(function (input) {
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
            const btnHtml = buttons.map(function (btn) {
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
            let html = `<div style="display:flex; flex-direction:column; gap:4px; margin-top:8px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid var(--border);">
                <div style="font-size:0.75rem; color:var(--text-dim); font-weight:600;">Selection: <span style="color:var(--text-main);">${text}</span></div>`;

            if (this.excludedNumbers && this.excludedNumbers.length > 0) {
                html += `<div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; color:#ef4444; font-weight:700; background:rgba(239, 68, 68, 0.1); padding:4px 8px; border-radius:6px; margin-top:4px;">
                    <i data-lucide="shield-check" style="width:12px;height:12px;"></i>
                    ${this.excludedNumbers.length} recipients excluded via Frequency Protection
                    <button onclick="window.whatsAppSender.excludedNumbers=[]; window.whatsAppSender.updateRecipientCount()" style="margin-left:auto; background:none; border:none; color:#ef4444; cursor:pointer; font-weight:800; text-decoration:underline;">Reset</button>
                </div>`;
            }

            html += `</div>`;
            display.innerHTML = html;
            if (window.lucide) window.lucide.createIcons({ root: display });
        }
    };


    // --- History View (Remastered Campaign Center) ---

    window.whatsAppSender.renderHistoryView = function () {
        const container = document.getElementById('whatsapp-content-history');
        if (!container) return;

        // Clean up listeners
        if (this._historyDetailsUnsubscribe) { this._historyDetailsUnsubscribe(); this._historyDetailsUnsubscribe = null; }
        if (this._logsDetailsUnsubscribe) { this._logsDetailsUnsubscribe(); this._logsDetailsUnsubscribe = null; }
        container.removeAttribute('data-active-report');

        const cachedLogs = this._cachedHistoryLogs || [];
        this._currentHistoryTab = this._currentHistoryTab || 'all';

        container.innerHTML = `
            <div class="wa-history-page">
                <div class="wa-history-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 32px;">
                    <div>
                        <h2 style="margin:0; font-size:1.6rem; font-weight:900; color:var(--text-main); letter-spacing:-0.02em;">Campaign Center</h2>
                        <p style="margin:4px 0 0; font-size:0.9rem; color:var(--text-dim); font-weight:500;">Monitor and optimize your broadcast performance</p>
                    </div>
                    <div style="display:flex; gap:12px;">
                        <div class="search-group" style="position:relative; width:260px;">
                            <i data-lucide="search" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--text-dim);"></i>
                            <input type="text" id="wa-history-search" class="wa-input" placeholder="Search campaigns..." 
                                style="padding-left:40px; border-radius:14px; background:rgba(255,255,255,0.03);"
                                oninput="window.whatsAppSender._filterHistory()">
                        </div>
                        <button class="btn btn-secondary" onclick="window.whatsAppSender.loadHistory()" style="border-radius:14px; padding:0 20px;">
                            <i data-lucide="refresh-cw" style="width:16px;height:16px;"></i>
                        </button>
                    </div>
                </div>

                <!-- Master Analytics Snapshot -->
                <div id="wa-history-metrics" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:20px; margin-bottom:40px;">
                    <!-- Populated by _renderMasterMetrics -->
                </div>

                <!-- Tab Navigation -->
                <div class="wa-history-tabs">
                    <div class="wa-history-tab ${this._currentHistoryTab === 'all' ? 'active' : ''}" onclick="window.whatsAppSender._switchHistoryTab('all')">
                        <i data-lucide="layout-grid" style="width:16px;height:16px;"></i> All Campaigns
                    </div>
                    <div class="wa-history-tab ${this._currentHistoryTab === 'active' ? 'active' : ''}" onclick="window.whatsAppSender._switchHistoryTab('active')">
                        <i data-lucide="play-circle" style="width:16px;height:16px;"></i> Ongoing <span class="tab-count" id="count-active">0</span>
                    </div>
                    <div class="wa-history-tab ${this._currentHistoryTab === 'completed' ? 'active' : ''}" onclick="window.whatsAppSender._switchHistoryTab('completed')">
                        <i data-lucide="check-circle" style="width:16px;height:16px;"></i> Completed <span class="tab-count" id="count-completed">0</span>
                    </div>
                    <div class="wa-history-tab ${this._currentHistoryTab === 'stopped' ? 'active' : ''}" onclick="window.whatsAppSender._switchHistoryTab('stopped')">
                        <i data-lucide="pause-circle" style="width:16px;height:16px;"></i> Stopped <span class="tab-count" id="count-stopped">0</span>
                    </div>
                </div>

                <!-- Campaign Grid -->
                <div id="wa-campaign-grid" class="wa-campaign-grid">
                    ${cachedLogs.length > 0 ? this._renderCampaignCards(cachedLogs) : `
                        <div style="grid-column: 1/-1; padding:100px 0; text-align:center;">
                            <i data-lucide="loader" class="animation-spin" style="width:40px;height:40px;opacity:0.2;margin-bottom:16px;"></i>
                            <p style="color:var(--text-dim); font-weight:600;">Syncing campaign data...</p>
                        </div>
                    `}
                </div>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
        this.loadHistory();
    };

    window.whatsAppSender._renderMasterMetrics = function (logs) {
        const mount = document.getElementById('wa-history-metrics');
        if (!mount) return;

        let totalSentOnly = 0, totalDeliveredOnly = 0, totalRead = 0, totalFailed = 0;
        logs.forEach(log => {
            totalSentOnly += (log.sentCount || 0);
            totalDeliveredOnly += (log.deliveredCount || 0);
            totalRead += (log.readCount || 0);
            totalFailed += (log.failedCount || 0);
        });

        const totalDispatched = totalSentOnly + totalDeliveredOnly + totalRead;
        const totalDelivered = totalDeliveredOnly + totalRead;
        const deliveryRate = totalDispatched > 0 ? Math.round((totalDelivered / totalDispatched) * 100) : 0;
        const openRate = totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0;

        mount.innerHTML = `
            <div class="wa-metric-card" style="background:linear-gradient(135deg, rgba(59, 130, 246, 0.1), transparent); border:1px solid rgba(59, 130, 246, 0.15); border-radius:24px; padding:24px; position:relative; overflow:hidden;">
                <div style="color:#3b82f6; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                    <i data-lucide="send" style="width:14px;height:14px;"></i> Total Dispatched
                </div>
                <div style="font-size:2rem; font-weight:900; color:var(--text-main); line-height:1; margin-bottom:4px;">${totalDispatched.toLocaleString()}</div>
                <div style="font-size:0.8rem; color:var(--text-dim); font-weight:500;">Across ${logs.length} campaigns</div>
            </div>
            <div class="wa-metric-card" style="background:linear-gradient(135deg, rgba(34, 197, 94, 0.1), transparent); border:1px solid rgba(34, 197, 94, 0.15); border-radius:24px; padding:24px; position:relative; overflow:hidden;">
                <div style="color:#22c55e; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                    <i data-lucide="check-check" style="width:14px;height:14px;"></i> Delivery Health
                </div>
                <div style="font-size:2rem; font-weight:900; color:var(--text-main); line-height:1; margin-bottom:4px;">${deliveryRate}%</div>
                <div style="font-size:0.8rem; color:var(--text-dim); font-weight:500;">${totalDelivered} successful drops</div>
            </div>
            <div class="wa-metric-card" style="background:linear-gradient(135deg, rgba(168, 85, 247, 0.1), transparent); border:1px solid rgba(168, 85, 247, 0.15); border-radius:24px; padding:24px; position:relative; overflow:hidden;">
                <div style="color:#a855f7; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                    <i data-lucide="eye" style="width:14px;height:14px;"></i> Audience Reach
                </div>
                <div style="font-size:2rem; font-weight:900; color:var(--text-main); line-height:1; margin-bottom:4px;">${openRate}%</div>
                <div style="font-size:0.8rem; color:var(--text-dim); font-weight:500;">${totalRead} total read receipts</div>
            </div>
            <div class="wa-metric-card" style="background:linear-gradient(135deg, rgba(239, 68, 68, 0.1), transparent); border:1px solid rgba(239, 68, 68, 0.15); border-radius:24px; padding:24px; position:relative; overflow:hidden;">
                <div style="color:#ef4444; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                    <i data-lucide="alert-circle" style="width:14px;height:14px;"></i> Blocked/Failed
                </div>
                <div style="font-size:2rem; font-weight:900; color:${totalFailed > 0 ? '#ef4444' : 'var(--text-main)'}; line-height:1; margin-bottom:4px;">${totalFailed.toLocaleString()}</div>
                <div style="font-size:0.8rem; color:var(--text-dim); font-weight:500;">Action required for some</div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons({ root: mount });
    };

    window.whatsAppSender._renderCampaignCards = function (logs) {
        if (!logs || logs.length === 0) return this._renderEmptyHistory();

        const activeTab = this._currentHistoryTab || 'all';
        const filtered = logs.filter(log => {
            if (activeTab === 'all') return true;
            if (activeTab === 'active') return log.status === 'dispatching' || log.status === 'processing';
            if (activeTab === 'completed') return log.status === 'dispatched' || (log.sentCount + log.failedCount + (log.excludedCount || 0)) >= log.recipientsCount;
            if (activeTab === 'stopped') return log.status === 'stopped';
            return true;
        });

        if (filtered.length === 0) return this._renderEmptyHistory(true);

        return filtered.map(log => {
            const ts = log._parsedTimestamp;
            const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

            const campaignName = log.campaignName || 'Untitled Campaign';
            const templateName = log.template || '—';
            const audience = log.listName || log.listId || 'Custom List';

            const total = log.recipientsCount || 0;
            const excl = log.excludedCount || 0;
            const billable = total - excl;

            // Counts are now exclusive in DB
            const read = log.readCount || 0;
            const deliv = log.deliveredCount || 0;
            const sent = log.sentCount || 0;
            const fail = log.failedCount || 0;
            const proc = log.processingCount || 0;
            const queued = log.queuedCount || Math.max(0, billable - (log.processedNumbersCount || 0) - proc);

            const readPct = billable > 0 ? (read / billable * 100) : 0;
            const delivPct = billable > 0 ? (deliv / billable * 100) : 0;
            const sentPct = billable > 0 ? (sent / billable * 100) : 0;
            const procPct = billable > 0 ? (proc / billable * 100) : 0;
            const queuedPct = billable > 0 ? (queued / billable * 100) : 0;
            const failPct = billable > 0 ? (fail / billable * 100) : 0;

            let statusClass = 'completed', statusLabel = 'Completed';
            if (log.status === 'dispatching' || log.status === 'processing') {
                statusClass = 'active';
                statusLabel = 'Sending';
            } else if (log.status === 'stopped') {
                statusClass = 'stopped';
                statusLabel = 'Stopped';
            }

            return `
                <div class="wa-campaign-card" onclick="window.whatsAppSender.viewBroadcastDetails('${log.broadcastId || ''}', '${log.id}')">
                    <div class="wa-card-header">
                        <div class="wa-card-status ${statusClass}">
                            ${statusClass === 'active' ? '<div class="wa-status-pulse"></div>' : ''}
                            ${statusLabel}
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-dim); font-weight:600;">${dateStr}</div>
                    </div>

                    <div>
                        <h3 class="wa-card-title">${campaignName}</h3>
                        <div class="wa-card-meta">
                            <div class="wa-meta-item"><i data-lucide="layout-template"></i> <b>Template:</b> ${templateName}</div>
                            <div class="wa-meta-item"><i data-lucide="users"></i> <b>Audience:</b> ${audience}</div>
                        </div>
                    </div>

                    <div class="wa-health-container">
                        <div class="wa-health-header">
                            <div style="color:var(--text-main); font-weight:800;">Campaign Health</div>
                            <div style="color:var(--text-dim);">${total - excl - queued} / ${billable}</div>
                        </div>
                        <div class="wa-health-bar">
                            <div class="wa-health-fill read" style="width:${readPct}%" title="Read">${read > 0 && readPct > 5 ? read : ''}</div>
                            <div class="wa-health-fill delivered" style="width:${delivPct}%" title="Delivered">${deliv > 0 && delivPct > 5 ? deliv : ''}</div>
                            <div class="wa-health-fill sent" style="width:${sentPct}%" title="Sent">${sent > 0 && sentPct > 5 ? sent : ''}</div>
                            <div class="wa-health-fill processing" style="width:${procPct}%" title="Processing">${proc > 0 && procPct > 5 ? proc : ''}</div>
                            <div class="wa-health-fill queued" style="width:${queuedPct}%" title="Queued">${queued > 0 && queuedPct > 5 ? queued : ''}</div>
                            <div class="wa-health-fill failed" style="width:${failPct}%" title="Failed">${fail > 0 && failPct > 5 ? fail : ''}</div>
                        </div>
                    </div>

                    <div class="wa-card-stats">
                        <div class="wa-mini-stat">
                            <span class="label">Sent</span>
                            <span class="value">${read + deliv + sent}</span>
                        </div>
                        <div class="wa-mini-stat">
                            <span class="label">Delivered</span>
                            <span class="value">${read + deliv}</span>
                        </div>
                        <div class="wa-mini-stat">
                            <span class="label">Read</span>
                            <span class="value" style="color:#a855f7;">${read}</span>
                        </div>
                        <div class="wa-mini-stat">
                            <span class="label">Failed</span>
                            <span class="value" style="color:${fail > 0 ? '#ef4444' : 'var(--text-main)'};">${fail}</span>
                        </div>
                    </div>

                    <div class="wa-card-actions">
                        <button class="wa-action-btn primary">
                            <i data-lucide="bar-chart-3"></i> View Report
                        </button>
                        ${statusClass === 'active' ? `
                            <button class="wa-action-btn secondary" onclick="event.stopPropagation(); window.whatsAppSender.stopBroadcast('${log.id}')">
                                <i data-lucide="square" style="color:#ef4444;"></i> Stop
                            </button>
                        ` : `
                            <button class="wa-action-btn secondary" onclick="event.stopPropagation(); window.whatsAppSender.deleteBroadcastHistory('${log.id}', '${log.broadcastId || ''}')">
                                <i data-lucide="trash-2"></i>
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    };

    window.whatsAppSender._renderEmptyHistory = function (isFilter = false) {
        return `
            <div style="grid-column: 1/-1; padding:80px 20px; text-align:center; background:rgba(255,255,255,0.02); border:2px dashed var(--card-border); border-radius:24px;">
                <div style="width:64px; height:64px; background:rgba(255,255,255,0.03); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 20px;">
                    <i data-lucide="${isFilter ? 'search' : 'inbox'}" style="width:32px;height:32px;opacity:0.3;"></i>
                </div>
                <h3 style="color:var(--text-main); margin-bottom:8px;">${isFilter ? 'No matching campaigns' : 'No Broadcasts Yet'}</h3>
                <p style="margin:0; color:var(--text-dim); max-width:300px; margin:0 auto;">${isFilter ? 'Try adjusting your search or filters to find what you are looking for.' : 'Your campaign history will appear here once you launch your first broadcast.'}</p>
            </div>
        `;
    };

    window.whatsAppSender.loadHistory = function () {
        const grid = document.getElementById('wa-campaign-grid');
        if (!grid) return;

        // Unsubscribe any existing listener
        if (window.whatsAppSender._historyUnsubscribe) {
            window.whatsAppSender._historyUnsubscribe();
        }

        window.whatsAppSender._historyUnsubscribe = firestore
            .collection('modules').doc('whatsapp_sender').collection('history')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .onSnapshot(snapshot => {
                const logs = snapshot.docs.map(doc => {
                    const data = doc.data();
                    let ts;
                    if (!data.timestamp) ts = new Date();
                    else if (data.timestamp.toDate) ts = data.timestamp.toDate();
                    else ts = new Date(data.timestamp);

                    return { id: doc.id, ...data, _parsedTimestamp: ts };
                });

                logs.sort((a, b) => b._parsedTimestamp - a._parsedTimestamp);

                this._cachedHistoryLogs = logs;
                this._renderMasterMetrics(logs);
                this._updateTabCounts(logs);

                grid.innerHTML = this._renderCampaignCards(logs);
                if (window.lucide) window.lucide.createIcons({ root: grid });
            }, err => {
                console.error("History sync error:", err);
                grid.innerHTML = `<div style="grid-column: 1/-1; padding:40px; color:var(--danger); text-align:center;"><i data-lucide="alert-triangle"></i> Sync failed: ${err.message}</div>`;
                if (window.lucide) window.lucide.createIcons();
            });
    };

    window.whatsAppSender._updateTabCounts = function (logs) {
        const counts = { active: 0, completed: 0, stopped: 0 };
        logs.forEach(log => {
            if (log.status === 'dispatching' || log.status === 'processing') counts.active++;
            else if (log.status === 'stopped') counts.stopped++;
            else if (log.status === 'dispatched' || (log.sentCount + log.failedCount + (log.excludedCount || 0)) >= log.recipientsCount) counts.completed++;
        });

        Object.keys(counts).forEach(key => {
            const el = document.getElementById(`count-${key}`);
            if (el) el.innerText = counts[key];
        });
    };

    window.whatsAppSender._switchHistoryTab = function (tab) {
        this._currentHistoryTab = tab;

        // Update UI
        document.querySelectorAll('.wa-history-tab').forEach(el => {
            if (el.innerText.toLowerCase().includes(tab) || (tab === 'all' && el.innerText.toLowerCase().includes('all'))) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        const grid = document.getElementById('wa-campaign-grid');
        if (grid && this._cachedHistoryLogs) {
            grid.innerHTML = this._renderCampaignCards(this._cachedHistoryLogs);
            if (window.lucide) window.lucide.createIcons({ root: grid });
        }
    };

    window.whatsAppSender._filterHistory = function () {
        const searchTerm = document.getElementById('wa-history-search')?.value.toLowerCase() || '';
        const grid = document.getElementById('wa-campaign-grid');
        if (!grid || !this._cachedHistoryLogs) return;

        const filtered = this._cachedHistoryLogs.filter(log => {
            const name = (log.campaignName || '').toLowerCase();
            const template = (log.template || '').toLowerCase();
            const audience = (log.listName || log.listId || '').toLowerCase();
            return name.includes(searchTerm) || template.includes(searchTerm) || audience.includes(searchTerm);
        });

        grid.innerHTML = this._renderCampaignCards(filtered);
        if (window.lucide) window.lucide.createIcons({ root: grid });
    };

    window.whatsAppSender._getRelativeTime = function (date) {
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return date.toLocaleDateString();
    };


    window.whatsAppSender._filterReportRows = function (status) {
        const btn = document.querySelector(`#wa-report-filters .wa-history-tab[data-filter="${status}"]`);
        if (!btn) return;

        // Toggle active state
        btn.classList.toggle('active');

        // Show/Hide Error Type filter based on 'failed' status being active
        const errorFilter = document.getElementById('wa-report-error-filter-container');
        if (errorFilter) {
            const isFailedActive = document.querySelector(`#wa-report-filters .wa-history-tab[data-filter="failed"].active`);
            errorFilter.style.display = isFailedActive ? 'flex' : 'none';
        }

        window.whatsAppSender._applyReportFilters();
    };

    window.whatsAppSender.toggleAllExpansions = function () {
        const rows = document.querySelectorAll('.wa-recipient-card:not([style*="display: none"])');
        const expandText = document.getElementById('wa-expand-all-text');
        const isCurrentlyExpanded = expandText && expandText.innerText === 'Collapse All';

        rows.forEach(row => {
            if (isCurrentlyExpanded) {
                row.classList.remove('expanded');
                const chevron = row.querySelector('.wa-card-chevron');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            } else {
                row.classList.add('expanded');
                const chevron = row.querySelector('.wa-card-chevron');
                if (chevron) chevron.style.transform = 'rotate(180deg)';
            }
        });

        if (expandText) {
            expandText.innerText = isCurrentlyExpanded ? 'Expand All' : 'Collapse All';
            const icon = expandText.parentElement.querySelector('i');
            if (icon) icon.setAttribute('data-lucide', isCurrentlyExpanded ? 'expand' : 'shrink');
            if (window.lucide) window.lucide.createIcons({ root: expandText.parentElement });
        }
    };

    // Apply both status and search filters
    window.whatsAppSender._applyReportFilters = function () {
        const activeBtns = document.querySelectorAll('#wa-report-filters .wa-history-tab.active');
        const activeStatuses = Array.from(activeBtns).map(btn => btn.getAttribute('data-filter'));

        const searchInput = document.getElementById('wa-report-search');
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const errorType = document.getElementById('wa-report-error-filter')?.value || 'all';

        const rows = document.querySelectorAll('.wa-recipient-card');
        let visibleCount = 0;

        rows.forEach(row => {
            const rowStatus = row.getAttribute('data-status');
            const rowError = (row.getAttribute('data-error') || '').toLowerCase();
            const phoneEl = row.querySelector('.wa-recipient-card-header div div div:nth-child(2)');
            const nameEl = row.querySelector('.wa-recipient-card-header div div div:nth-child(1)');

            const phoneText = phoneEl ? phoneEl.textContent.trim().toLowerCase() : '';
            const nameText = nameEl ? nameEl.textContent.trim().toLowerCase() : '';

            // 1. Status Check
            let statusMatch = false;
            if (activeStatuses.length === 0) {
                statusMatch = false;
            } else {
                activeStatuses.forEach(s => {
                    if (s === 'sent' && (rowStatus === 'sent' || rowStatus === 'delivered' || rowStatus === 'read')) statusMatch = true;
                    if (s === 'delivered' && (rowStatus === 'delivered' || rowStatus === 'read')) statusMatch = true;
                    if (s === 'read' && rowStatus === 'read') statusMatch = true;
                    if (s === 'failed' && (rowStatus === 'failed' || rowStatus === 'error')) statusMatch = true;
                    if (s === 'excluded' && rowStatus === 'excluded') statusMatch = true;
                    if (s === 'queued' && (rowStatus === 'queued' || rowStatus === 'processing')) statusMatch = true;
                });
            }

            // 2. Error Type Sub-filter (only if status is failed)
            let errorMatch = true;
            if (activeStatuses.includes('failed') && errorType !== 'all') {
                errorMatch = rowError.includes(errorType.toLowerCase());
            }

            // 3. Search Check
            let searchMatch = true;
            if (searchTerm) {
                searchMatch = phoneText.includes(searchTerm) || nameText.includes(searchTerm);
            }

            const isVisible = statusMatch && errorMatch && searchMatch;

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

    window.whatsAppSender.viewBroadcastDetails = async function (broadcastId, logId) {
        const container = document.getElementById('whatsapp-content-history');
        if (!container) return;

        const isAlreadyActive = container.getAttribute('data-active-report') === logId;

        if (this.currentView !== 'history') {
            this.switchView('history');
        }

        const refreshBtn = document.querySelector('button[onclick*="viewBroadcastDetails"]');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = `<i data-lucide="loader" class="animation-spin" style="width:14px;height:14px;margin-right:6px;"></i> Syncing...`;
            if (window.lucide) window.lucide.createIcons({ root: refreshBtn });
        }

        if (!isAlreadyActive) {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:400px; color:var(--text-dim); gap:20px;">
                    <i data-lucide="loader" style="width:40px;height:40px;animation:spin 1s linear infinite;"></i>
                    <h3>Syncing Live Report...</h3>
                </div>`;
            if (window.lucide) window.lucide.createIcons();
        }

        if (this._historyDetailsUnsubscribe) this._historyDetailsUnsubscribe();
        if (this._logsDetailsUnsubscribe) this._logsDetailsUnsubscribe();

        const metaDoc = await firestore.collection('modules').doc('whatsapp_sender').collection('history').doc(logId).get();
        const initialMeta = metaDoc.data() || {};

        container.setAttribute('data-active-report', logId);

        if (!isAlreadyActive) {
            this._renderReportSkeleton(container, broadcastId, logId, initialMeta);
        }

        let meta = initialMeta, recipients = {};

        this._historyDetailsUnsubscribe = firestore.collection('modules').doc('whatsapp_sender').collection('history').doc(logId)
            .onSnapshot(doc => {
                meta = doc.data() || {};
                this.renderBroadcastDetails(broadcastId, logId, meta, recipients);
            });

        const logsRef = firebase.database().ref(`modules/whatsapp_sender/broadcast_logs/${broadcastId}`);
        const listener = logsRef.on('value', snap => {
            recipients = snap.val() || {};
            this.renderBroadcastDetails(broadcastId, logId, meta, recipients);
        }, err => {
            console.error(err);
            AppDialog.toast('Error loading recipient logs.', 'error');
        });
        this._logsDetailsUnsubscribe = () => logsRef.off('value', listener);

        if (refreshBtn) {
            setTimeout(() => {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = `<i data-lucide="refresh-cw" style="width:16px;height:16px;margin-right:8px;"></i> Sync Live`;
                if (window.lucide) window.lucide.createIcons({ root: refreshBtn });
            }, 500);
        }
    };

    window.whatsAppSender.deleteIndividualLog = async function (logId, broadcastId, logKey, recipientName, status) {
        const confirmed = await AppDialog.confirm(`Are you sure you want to delete the delivery record for "${recipientName}"? This will remove it from the report and update the campaign progress counts.`, {
            title: 'Delete Record',
            danger: true,
            confirmText: 'Delete Record'
        });

        if (!confirmed) return;

        try {
            await firebase.database().ref(`modules/whatsapp_sender/broadcast_logs/${broadcastId}/${logKey}`).remove();

            const update = {
                processedNumbersCount: firebase.firestore.FieldValue.increment(-1),
                recipientsCount: firebase.firestore.FieldValue.increment(-1)
            };

            if (status === 'read') {
                update.readCount = firebase.firestore.FieldValue.increment(-1);
                update.deliveredCount = firebase.firestore.FieldValue.increment(-1);
                update.sentCount = firebase.firestore.FieldValue.increment(-1);
                update.dispatchedCount = firebase.firestore.FieldValue.increment(-1);
            } else if (status === 'delivered') {
                update.deliveredCount = firebase.firestore.FieldValue.increment(-1);
                update.sentCount = firebase.firestore.FieldValue.increment(-1);
                update.dispatchedCount = firebase.firestore.FieldValue.increment(-1);
            } else if (status === 'sent') {
                update.sentCount = firebase.firestore.FieldValue.increment(-1);
                update.dispatchedCount = firebase.firestore.FieldValue.increment(-1);
            } else if (status === 'processing') {
                update.dispatchedCount = firebase.firestore.FieldValue.increment(-1);
            } else if (status === 'failed' || status === 'error') {
                update.failedCount = firebase.firestore.FieldValue.increment(-1);
            } else if (status === 'excluded') {
                update.excludedCount = firebase.firestore.FieldValue.increment(-1);
            }

            await firestore.collection('modules').doc('whatsapp_sender').collection('history').doc(logId).update(update);
            AppDialog.toast('Record deleted successfully.', 'success');
        } catch (error) {
            console.error("Log Delete Failed:", error);
            AppDialog.toast('Failed to delete record: ' + error.message, 'error');
        }
    };

    window.whatsAppSender._getEffectiveStatus = function (m) {
        const STATUS_RANK = { 'queued': 1, 'processing': 2, 'sent': 3, 'delivered': 4, 'read': 5, 'failed': 6, 'error': 6 };

        let status = (m.status || 'unknown').toLowerCase();
        let error = m.error || (status === 'excluded' ? m.message : null);
        let highestRank = STATUS_RANK[status] || 0;

        if (m.statusHistory) {
            Object.values(m.statusHistory).forEach(h => {
                const hStatus = (h.status || '').toLowerCase();
                const hRank = STATUS_RANK[hStatus] || 0;

                if (hRank > highestRank) {
                    highestRank = hRank;
                    status = hStatus;
                    if (hStatus === 'failed' || hStatus === 'error') {
                        error = h.error || h.status_description || error || 'Delivery failed';
                    }
                }
            });
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

        const titleEl = document.getElementById('wa-report-title');
        const dateEl = document.getElementById('wa-report-date');
        const listEl = document.getElementById('wa-report-list');

        if (titleEl && meta.campaignName) titleEl.innerText = meta.campaignName;
        if (dateEl && meta.timestamp) {
            const dateStr = meta.timestamp.toDate ? meta.timestamp.toDate().toLocaleString() : new Date(meta.timestamp).toLocaleString();
            if (dateEl.innerText !== dateStr) dateEl.innerText = dateStr;
        }
        if (listEl && (meta.listName || meta.listId)) {
            const listName = meta.listName || meta.listId;
            if (listEl.innerText !== listName) listEl.innerText = listName;
        }

        const sortVal = document.getElementById('wa-report-sort')?.value || 'oldest';
        const recipientsArray = Object.entries(recipients).map(([key, val]) => ({ key, ...val }));

        recipientsArray.sort((a, b) => {
            if (sortVal === 'newest') return (b.timestamp || 0) - (a.timestamp || 0);
            if (sortVal === 'name') return (a.name || '').localeCompare(b.name || '');
            if (sortVal === 'failed') {
                const statusA = this._getEffectiveStatus(a).status;
                const statusB = this._getEffectiveStatus(b).status;
                const isAFail = (statusA === 'failed' || statusA === 'error');
                const isBFail = (statusB === 'failed' || statusB === 'error');
                if (isAFail && !isBFail) return -1;
                if (!isAFail && isBFail) return 1;
                return (a.timestamp || 0) - (b.timestamp || 0);
            }
            return (a.timestamp || 0) - (b.timestamp || 0);
        });

        // EXCLUSIVE Counting: Each recipient counts for exactly ONE state
        let queued = 0, processing = 0, sent = 0, read = 0, deliv = 0, fail = 0, excluded = 0, total = recipientsArray.length;

        recipientsArray.forEach(m => {
            const { status } = this._getEffectiveStatus(m);
            if (status === 'queued') queued++;
            else if (status === 'processing') processing++;
            else if (status === 'failed' || status === 'error') fail++;
            else if (status === 'read') read++;
            else if (status === 'delivered') deliv++;
            else if (status === 'sent') sent++;
            else if (status === 'excluded') excluded++;
        });

        const liveStats = { total, queued, processing, sent, deliv, read, fail, excluded };

        const errorFilter = document.getElementById('wa-report-error-filter');
        if (errorFilter) {
            const currentSelection = errorFilter.value;
            const uniqueErrors = new Set();
            recipientsArray.forEach(m => {
                const { status, error } = this._getEffectiveStatus(m);
                if ((status === 'failed' || status === 'error') && error) {
                    const shortError = error.split(':')[0].split('.')[0].trim();
                    uniqueErrors.add(shortError);
                }
            });

            let errorHtml = '<option value="all">All Error Types</option>';
            uniqueErrors.forEach(err => {
                errorHtml += `<option value="${err}" ${currentSelection === err ? 'selected' : ''}>${err}</option>`;
            });
            errorFilter.innerHTML = errorHtml;
        }

        this._updateReportLiveProgress(logId, meta, liveStats);
        this._updateReportStatsDashboard(total, processing, sent, deliv, read, fail, excluded, queued);
        this._updateRecipientRowsList(recipientsArray, broadcastId, logId);

        // SYNC: Update Firestore with EXCLUSIVE counts
        if (meta.readCount !== read || meta.deliveredCount !== deliv || meta.sentCount !== sent || meta.failedCount !== fail || meta.recipientsCount !== total) {
            firestore.collection('modules').doc('whatsapp_sender').collection('history').doc(logId).update({
                readCount: read,
                deliveredCount: deliv,
                sentCount: sent,
                failedCount: fail,
                excludedCount: excluded,
                processingCount: processing,
                queuedCount: queued,
                processedNumbersCount: total - processing - queued - excluded,
                recipientsCount: total
            }).catch(e => console.warn("Background stats sync failed:", e));
        }

        if (window.lucide) window.lucide.createIcons({ root: container });
    };

    window.whatsAppSender._renderReportSkeleton = function (container, broadcastId, logId, meta) {
        const dateStr = meta.timestamp ? (meta.timestamp.toDate ? meta.timestamp.toDate() : new Date(meta.timestamp)).toLocaleString() : '—';
        container.innerHTML = `
            <div class="wa-report-container" style="padding:0;">
                <div class="wa-lists-header" style="margin-bottom:32px; padding:24px 32px; background:rgba(255,255,255,0.02); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:20px;">
                        <button class="btn btn-secondary btn-icon" onclick="window.whatsAppSender.renderHistoryView()" 
                            style="width:40px; height:40px; border-radius:12px; border:1px solid var(--border); background:rgba(255,255,255,0.05);">
                            <i data-lucide="arrow-left"></i>
                        </button>
                        <div>
                            <div style="display:flex; align-items:center; gap:12px;">
                                <h2 id="wa-report-title" style="margin:0; font-size:1.5rem; font-weight:900; color:var(--text-main); letter-spacing:-0.02em;">${meta.campaignName || 'Broadcast Report'}</h2>
                                ${meta.isSimulation ? `
                                <span style="background:rgba(245, 158, 11, 0.1); color:#f59e0b; border:1px solid rgba(245, 158, 11, 0.2); font-size:0.65rem; font-weight:800; text-transform:uppercase; padding:4px 10px; border-radius:8px; letter-spacing:0.05em; display:flex; align-items:center; gap:6px;">
                                    <i data-lucide="flask-conical" style="width:12px;height:12px;"></i> Simulation
                                </span>
                                ` : ''}
                            </div>
                            <div style="font-size:0.85rem; color:var(--text-dim); margin-top:6px; font-weight:500;">
                                <span style="display:inline-flex; align-items:center; gap:6px;">
                                    <i data-lucide="calendar" style="width:14px;height:14px;opacity:0.6;"></i> <span id="wa-report-date">${dateStr}</span>
                                </span>
                                <span style="margin:0 12px; opacity:0.2;">|</span>
                                <span style="display:inline-flex; align-items:center; gap:6px;">
                                    <i data-lucide="users" style="width:14px;height:14px;opacity:0.6;"></i> <span id="wa-report-list">${meta.listName || 'Custom List'}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; gap:12px;">
                        <button class="btn btn-secondary" onclick="window.whatsAppSender.viewBroadcastDetails('${broadcastId}', '${logId}')" style="border-radius:12px; padding:0 20px;">
                            <i data-lucide="refresh-cw" style="width:16px;height:16px;margin-right:8px;"></i> Sync Live
                        </button>
                        <button class="btn btn-secondary danger" onclick="window.whatsAppSender.deleteBroadcastHistory('${logId}', '${broadcastId}')" 
                            style="border-radius:12px; width:44px; height:44px; display:flex; align-items:center; justify-content:center; padding:0;">
                            <i data-lucide="trash-2" style="width:18px;height:18px;"></i>
                        </button>
                    </div>
                </div>

                <div style="padding:0 32px 40px;">
                    <div id="wa-live-progress-mount" style="margin-bottom:32px;"></div>
                    <div id="wa-report-dashboard-mount" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:20px; margin-bottom:40px;"></div>

                    <div style="background:var(--card-bg); border:1px solid var(--border); border-radius:24px; overflow:hidden;">
                        <div style="padding:24px 32px; background:rgba(255,255,255,0.01); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px;">
                            <div class="wa-history-tabs" id="wa-report-filters" style="margin-bottom:0; background:rgba(0,0,0,0.2);">
                                <div class="wa-history-tab active" data-filter="sent" onclick="window.whatsAppSender._filterReportRows('sent')">Sent</div>
                                <div class="wa-history-tab active" data-filter="delivered" onclick="window.whatsAppSender._filterReportRows('delivered')">Delivered</div>
                                <div class="wa-history-tab active" data-filter="read" onclick="window.whatsAppSender._filterReportRows('read')">Read</div>
                                <div class="wa-history-tab active" data-filter="failed" onclick="window.whatsAppSender._filterReportRows('failed')">Failed</div>
                                <div class="wa-history-tab active" data-filter="queued" onclick="window.whatsAppSender._filterReportRows('queued')">Queued</div>
                                <div class="wa-history-tab" data-filter="excluded" onclick="window.whatsAppSender._filterReportRows('excluded')">Excluded</div>
                            </div>
                            
                            <div style="display:flex; align-items:center; gap:16px;">
                                <div class="search-group" style="position:relative; width:240px;">
                                    <i data-lucide="search" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--text-dim);"></i>
                                    <input type="text" id="wa-report-search" class="wa-input" placeholder="Search recipients..." 
                                        style="padding-left:40px; border-radius:12px; background:rgba(255,255,255,0.03);"
                                        oninput="window.whatsAppSender._applyReportFilters()">
                                </div>
                                <select id="wa-report-sort" onchange="window.whatsAppSender.viewBroadcastDetails('${broadcastId}', '${logId}')" 
                                    style="background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:12px; padding:10px 16px; color:var(--text-main); font-size:0.85rem; font-weight:600; outline:none; cursor:pointer;">
                                    <option value="oldest">Time: Oldest First</option>
                                    <option value="newest">Time: Newest First</option>
                                    <option value="failed">Priority: Failures First</option>
                                    <option value="name">Alpha: Name (A-Z)</option>
                                </select>
                            </div>
                        </div>

                        <div style="padding:16px 32px; background:rgba(0,0,0,0.1); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:16px;">
                                <div style="display:flex; align-items:center; gap:10px; padding-right:16px; border-right:1px solid rgba(255,255,255,0.1);">
                                    <input type="checkbox" id="wa-report-select-all" onclick="window.whatsAppSender.toggleAllSelections(this.checked)" 
                                        style="width:18px; height:18px; cursor:pointer; accent-color:var(--accent);">
                                    <span style="font-size:0.75rem; color:var(--text-dim); font-weight:800; text-transform:uppercase; letter-spacing:0.05em;">Select All</span>
                                </div>
                                
                                <div id="wa-report-count" style="font-size:0.75rem; color:var(--text-dim); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; padding-right:16px; border-right:1px solid rgba(255,255,255,0.1);">0 Recipients</div>

                                <div id="wa-bulk-actions" style="display:none; align-items:center; gap:12px; padding:6px 14px; background:rgba(239, 94, 73, 0.1); border-radius:12px; border:1px solid rgba(239, 94, 73, 0.2);">
                                    <span id="wa-selection-count" style="font-size:0.75rem; font-weight:900; color:var(--accent); text-transform:uppercase;">0 Selected</span>
                                    <div style="width:1px; height:14px; background:rgba(239, 94, 73, 0.2);"></div>
                                    <button class="btn btn-icon" onclick="window.whatsAppSender.bulkDeleteSelected('${logId}', '${broadcastId}')" title="Delete Selected" style="color:#ef4444; width:24px; height:24px; padding:0;"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                                </div>

                                <button class="btn btn-secondary" onclick="window.whatsAppSender.toggleAllExpansions()" style="border-radius:12px; padding:8px 16px; font-size:0.8rem; display:flex; align-items:center; gap:8px; font-weight:700;">
                                    <i data-lucide="expand" style="width:14px;height:14px;"></i> <span id="wa-expand-all-text">Expand All</span>
                                </button>
                            </div>

                            <div id="wa-report-error-filter-container" style="display:none; align-items:center; gap:10px;">
                                <span style="font-size:0.7rem; color:var(--text-dim); font-weight:800; text-transform:uppercase; letter-spacing:0.05em;">Error Type:</span>
                                <select id="wa-report-error-filter" onchange="window.whatsAppSender._applyReportFilters()" 
                                    style="background:rgba(239, 68, 68, 0.05); border:1px solid rgba(239, 68, 68, 0.1); border-radius:10px; padding:6px 12px; color:#ef4444; font-size:0.8rem; font-weight:600; outline:none; cursor:pointer;">
                                    <option value="all">All Error Types</option>
                                </select>
                            </div>
                        </div>

                        <div id="wa-recipient-list" style="padding: 24px; max-height:800px; overflow-y:auto;">
                            <!-- Populated by _updateRecipientRowsList -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender._updateReportLiveProgress = function (logId, meta, liveStats) {
        const mount = document.getElementById('wa-live-progress-mount');
        if (!mount) return;

        const isDispatching = meta.status === 'dispatching' || meta.status === 'processing';
        const isStopped = meta.status === 'stopped';
        const isCompleted = meta.status === 'dispatched' || meta.status === 'completed';

        const total = liveStats ? liveStats.total : (meta.recipientsCount || 0);
        const excl = liveStats ? liveStats.excluded : (meta.excludedCount || 0);
        const billable = total - excl;

        // Exclusive counts for health bar
        let read, deliv, sent, fail, proc, queued;
        if (liveStats) {
            read = liveStats.read;
            deliv = liveStats.deliv;
            sent = liveStats.sent;
            fail = liveStats.fail;
            proc = liveStats.processing;
            queued = liveStats.queued;
        } else {
            read = meta.readCount || 0;
            deliv = meta.deliveredCount || 0;
            sent = meta.sentCount || 0;
            fail = meta.failedCount || 0;
            proc = meta.processingCount || 0;
            queued = meta.queuedCount || Math.max(0, billable - (meta.processedNumbersCount || 0) - proc);
        }

        const readPct = billable > 0 ? (read / billable * 100) : 0;
        const delivPct = billable > 0 ? (deliv / billable * 100) : 0;
        const sentPct = billable > 0 ? (sent / billable * 100) : 0;
        const procPct = billable > 0 ? (proc / billable * 100) : 0;
        const queuedPct = billable > 0 ? (queued / billable * 100) : 0;
        const failPct = billable > 0 ? (fail / billable * 100) : 0;

        let statusConfig = {
            title: 'Actively Sending Messages',
            subtitle: `Targeting: <strong style="color:var(--text-main);">${meta.currentContactName || 'Calculating...'}</strong>`,
            icon: 'send',
            bg: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(37,211,102,0.05) 100%)',
            border: 'rgba(59,130,246,0.2)',
            accent: '#3b82f6'
        };

        if (isStopped) {
            statusConfig = {
                title: 'Broadcast Stopped',
                subtitle: 'The campaign was manually stopped by an administrator.',
                icon: 'square',
                bg: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(239,68,68,0.05) 100%)',
                border: 'rgba(239,68,68,0.2)',
                accent: '#ef4444'
            };
        } else if (isCompleted) {
            statusConfig = {
                title: 'Broadcast Completed',
                subtitle: 'All messages have been successfully dispatched to the queue.',
                icon: 'check-circle',
                bg: 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(34,197,94,0.05) 100%)',
                border: 'rgba(34,197,94,0.2)',
                accent: '#22c55e'
            };
        }

        mount.innerHTML = `
            <div style="background:${statusConfig.bg}; border:1px solid ${statusConfig.border}; border-radius:20px; padding:24px; margin-bottom:32px; box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <div class="${isDispatching ? 'wa-status-pulse' : ''}" style="width:48px; height:48px; background:${statusConfig.accent}; border-radius:14px; display:flex; align-items:center; justify-content:center; color:white; box-shadow:0 0 20px ${statusConfig.accent}66;">
                            <i data-lucide="${statusConfig.icon}" style="width:24px;height:24px;"></i>
                        </div>
                        <div>
                            <div style="font-weight:800; color:${statusConfig.accent}; font-size:1.1rem; letter-spacing:-0.01em;">${statusConfig.title}</div>
                            <div style="font-size:0.85rem; color:var(--text-dim); margin-top:2px;">${statusConfig.subtitle}</div>
                        </div>
                    </div>
                    ${isDispatching ? `
                    <button class="btn btn-danger" style="border-radius:12px; padding:8px 20px; font-weight:700;" onclick="window.whatsAppSender.stopBroadcast('${logId}')">
                        <i data-lucide="square" style="width:14px;height:14px;margin-right:6px;"></i> Stop Broadcast
                    </button>
                    ` : ''}
                </div>
                
                <div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <span style="font-size:0.75rem; color:var(--text-dim); font-weight:700; text-transform:uppercase;">Campaign Progress Lifecycle</span>
                        <span style="font-size:0.75rem; color:var(--text-main); font-weight:800;">${Math.round(100 - queuedPct)}% Processed</span>
                    </div>
                    <div class="wa-health-bar" style="height:28px; background:rgba(255,255,255,0.05); border-radius:14px; overflow:hidden;">
                        <div class="wa-health-fill read" style="width:${readPct}%" title="Read">${read > 0 && readPct > 5 ? read : ''}</div>
                        <div class="wa-health-fill delivered" style="width:${delivPct}%" title="Delivered">${deliv > 0 && delivPct > 5 ? deliv : ''}</div>
                        <div class="wa-health-fill sent" style="width:${sentPct}%" title="Sent">${sent > 0 && sentPct > 5 ? sent : ''}</div>
                        <div class="wa-health-fill processing" style="width:${procPct}%" title="Processing">${proc > 0 && procPct > 5 ? proc : ''}</div>
                        <div class="wa-health-fill queued" style="width:${queuedPct}%" title="Queued">${queued > 0 && queuedPct > 5 ? queued : ''}</div>
                        <div class="wa-health-fill failed" style="width:${failPct}%" title="Failed">${fail > 0 && failPct > 5 ? fail : ''}</div>
                    </div>
                    <div style="display:flex; gap:16px; margin-top:12px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:6px; font-size:0.7rem; font-weight:700; color:#a855f7;"><div style="width:8px;height:8px;border-radius:2px;background:#a855f7;"></div> READ</div>
                        <div style="display:flex; align-items:center; gap:6px; font-size:0.7rem; font-weight:700; color:#22c55e;"><div style="width:8px;height:8px;border-radius:2px;background:#22c55e;"></div> DELIVERED</div>
                        <div style="display:flex; align-items:center; gap:6px; font-size:0.7rem; font-weight:700; color:#3b82f6;"><div style="width:8px;height:8px;border-radius:2px;background:#3b82f6;"></div> SENT</div>
                        <div style="display:flex; align-items:center; gap:6px; font-size:0.7rem; font-weight:700; color:#f59e0b;"><div style="width:8px;height:8px;border-radius:2px;background:#f59e0b;"></div> PROCESSING</div>
                        <div style="display:flex; align-items:center; gap:6px; font-size:0.7rem; font-weight:700; color:#64748b;"><div style="width:8px;height:8px;border-radius:2px;background:#64748b;"></div> QUEUED</div>
                        <div style="display:flex; align-items:center; gap:6px; font-size:0.7rem; font-weight:700; color:#ef4444;"><div style="width:8px;height:8px;border-radius:2px;background:#ef4444;"></div> FAILED</div>
                    </div>
                </div>
            </div>`;
        if (window.lucide) window.lucide.createIcons({ root: mount });
    };

    window.whatsAppSender._updateReportStatsDashboard = function (total, processing, sent, deliv, read, fail, excluded, queued = 0) {
        const mount = document.getElementById('wa-report-dashboard-mount');
        if (!mount) return;

        // Note: counts passed here are already mutually exclusive top-level statuses
        const statsHtml = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:12px; margin-bottom:32px;">
                <div class="wa-mini-stat" style="background:rgba(100, 116, 139, 0.05); border:1px solid rgba(100, 116, 139, 0.1);">
                    <span class="label" style="color:#64748b;">Queued</span>
                    <span class="value">${queued.toLocaleString()}</span>
                </div>
                <div class="wa-mini-stat" style="background:rgba(245, 158, 11, 0.05); border:1px solid rgba(245, 158, 11, 0.1);">
                    <span class="label" style="color:#f59e0b;">Processing</span>
                    <span class="value">${processing.toLocaleString()}</span>
                </div>
                <div class="wa-mini-stat" style="background:rgba(59, 130, 246, 0.05); border:1px solid rgba(59, 130, 246, 0.1);">
                    <span class="label" style="color:#3b82f6;">Sent</span>
                    <span class="value">${sent.toLocaleString()}</span>
                </div>
                <div class="wa-mini-stat" style="background:rgba(34, 197, 94, 0.05); border:1px solid rgba(34, 197, 94, 0.1);">
                    <span class="label" style="color:#22c55e;">Delivered</span>
                    <span class="value">${deliv.toLocaleString()}</span>
                </div>
                <div class="wa-mini-stat" style="background:rgba(168, 85, 247, 0.05); border:1px solid rgba(168, 85, 247, 0.1);">
                    <span class="label" style="color:#a855f7;">Read</span>
                    <span class="value">${read.toLocaleString()}</span>
                </div>
                <div class="wa-mini-stat" style="background:rgba(239, 68, 68, 0.05); border:1px solid rgba(239, 68, 68, 0.1);">
                    <span class="label" style="color:#ef4444;">Failed</span>
                    <span class="value">${fail.toLocaleString()}</span>
                </div>
            </div>
        `;

        mount.innerHTML = statsHtml;
        if (window.lucide) window.lucide.createIcons({ root: mount });

        const countEl = document.getElementById('wa-report-count');
        if (countEl) countEl.innerText = `${total} Total Recipients`;
    };

    window.whatsAppSender._updateRecipientRowsList = function (recipients, broadcastId, logId) {
        const grid = document.getElementById('wa-recipient-list');
        if (!grid) return;

        const currentDataIds = new Set();

        recipients.forEach(m => {
            const cleanPhone = String(m.key || m.phone || m.recipientId || '').replace(/\D/g, '');
            const rowId = `wa-card-${cleanPhone}`;
            currentDataIds.add(rowId);

            const { status, error } = this._getEffectiveStatus(m);
            let card = document.getElementById(rowId);

            if (!card) {
                card = document.createElement('div');
                card.id = rowId;
                card.className = 'wa-recipient-card';
                grid.appendChild(card);
            }

            const currentStatus = card.getAttribute('data-status');
            const currentError = card.getAttribute('data-error');
            const currentUpdated = card.getAttribute('data-updated');

            if (currentStatus === status && currentError === String(error) && currentUpdated === String(m.timestamp)) return;

            const isExpanded = card.classList.contains('expanded');
            card.setAttribute('data-status', status);
            card.setAttribute('data-error', String(error));
            card.setAttribute('data-updated', String(m.timestamp));

            const statusColors = {
                sent: '#3b82f6',
                delivered: '#22c55e',
                read: '#a855f7',
                failed: '#ef4444',
                error: '#ef4444',
                excluded: '#94a3b8',
                processing: '#f59e0b',
                queued: '#64748b'
            };

            const color = statusColors[status] || '#94a3b8';
            const isEngaged = status === 'read';

            card.innerHTML = `
                <div class="wa-recipient-card-header" onclick="window.whatsAppSender.toggleRecipientExpansion('${rowId}')">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <input type="checkbox" class="wa-row-select" value="${m.key}" onclick="event.stopPropagation(); window.whatsAppSender._onRecipientSelectChange()" 
                            style="width:18px; height:18px; cursor:pointer; accent-color:var(--accent);">
                        
                        <div style="width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; color:${color}; font-weight:900;">
                            ${m.name ? m.name.charAt(0).toUpperCase() : '#'}
                        </div>
                        
                        <div>
                            <div style="font-weight:700; color:var(--text-main); font-size:1rem; display:flex; align-items:center; gap:8px;">
                                ${m.name || 'Unknown Recipient'}
                                ${isEngaged ? '<i data-lucide="sparkles" style="width:14px;height:14px;color:#a855f7;"></i>' : ''}
                            </div>
                            <div style="font-size:0.8rem; color:var(--text-dim); margin-top:2px;">+${cleanPhone}</div>
                        </div>
                    </div>

                    <div style="display:flex; align-items:center; gap:20px;">
                        <div style="text-align:right;">
                            <div style="color:${color}; font-size:0.65rem; font-weight:900; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">${status}</div>
                            <div style="font-size:0.75rem; color:var(--text-dim); font-weight:500;">
                                ${m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </div>
                        </div>
                        <i data-lucide="chevron-down" style="width:18px;height:18px;color:var(--text-dim); transition:transform 0.3s; ${isExpanded ? 'transform:rotate(180deg);' : ''}" class="wa-card-chevron"></i>
                    </div>
                </div>

                <div class="wa-recipient-card-content" style="${isExpanded ? 'display:block;' : ''}">
                    <div class="wa-report-timeline" style="grid-template-columns: repeat(5, 1fr);">
                        <div class="wa-timeline-step ${status !== 'excluded' ? 'active' : ''}">
                            <div class="wa-step-dot"></div>
                            <div class="wa-step-info"><span class="wa-step-title">Queued</span></div>
                        </div>
                        <div class="wa-timeline-step ${['processing', 'sent', 'delivered', 'read'].includes(status) ? 'active' : ''}">
                            <div class="wa-step-dot"></div>
                            <div class="wa-step-info"><span class="wa-step-title">Processing</span></div>
                        </div>
                        <div class="wa-timeline-step ${m.sentAt || ['sent', 'delivered', 'read'].includes(status) ? 'active' : ''}">
                            <div class="wa-step-dot"></div>
                            <div class="wa-step-info">
                                <span class="wa-step-title">Sent</span>
                                <span class="wa-step-time">${m.sentAt ? new Date(m.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                            </div>
                        </div>
                        <div class="wa-timeline-step ${m.deliveredAt || ['delivered', 'read'].includes(status) ? 'active' : ''}">
                            <div class="wa-step-dot"></div>
                            <div class="wa-step-info">
                                <span class="wa-step-title">Delivered</span>
                                <span class="wa-step-time">${m.deliveredAt ? new Date(m.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                            </div>
                        </div>
                        <div class="wa-timeline-step ${m.readAt || status === 'read' ? 'active' : ''}">
                            <div class="wa-step-dot"></div>
                            <div class="wa-step-info">
                                <span class="wa-step-title">Read</span>
                                <span class="wa-step-time">${m.readAt ? new Date(m.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                            </div>
                        </div>
                    </div>

                    ${error ? `
                        <div style="margin-top:20px; padding:16px; background:rgba(239, 68, 68, 0.05); border-radius:12px; border:1px solid rgba(239, 68, 68, 0.1); color:#ef4444; font-size:0.85rem;">
                            <div style="font-weight:800; text-transform:uppercase; font-size:0.65rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                                <i data-lucide="alert-triangle" style="width:12px;height:12px;"></i> Delivery Failure Information
                            </div>
                            ${error}
                        </div>
                    ` : ''}

                    <div style="margin-top:20px; display:flex; gap:12px; justify-content:flex-end;">
                        <button class="btn btn-secondary" style="font-size:0.75rem; border-radius:10px; padding:6px 14px;" 
                            onclick="window.whatsAppSender.deleteIndividualLog('${logId}', '${broadcastId}', '${m.key}', '${(m.name || 'Unknown').replace(/'/g, "\\'")}', '${status}')">
                            <i data-lucide="trash-2" style="width:14px;height:14px;margin-right:6px;"></i> Delete Record
                        </button>
                    </div>
                </div>
            `;
            if (isExpanded) card.classList.add('expanded');
        });

        Array.from(grid.children).forEach(child => {
            if (!currentDataIds.has(child.id)) {
                child.remove();
            }
        });

        if (window.lucide) window.lucide.createIcons({ root: grid });

        // Apply filters whenever the list is updated
        window.whatsAppSender._applyReportFilters();
    };

    window.whatsAppSender.toggleRecipientExpansion = function (cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;

        const content = card.querySelector('.wa-recipient-card-content');
        const isExpanded = card.classList.toggle('expanded');

        if (content) {
            content.style.display = isExpanded ? 'block' : 'none';
        }

        const chevron = card.querySelector('.wa-card-chevron');
        if (chevron) {
            chevron.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    };

    window.whatsAppSender.toggleAllSelections = function (checked) {
        const visibleChecks = document.querySelectorAll('.wa-recipient-card:not([style*="display: none"]) .wa-row-select');
        visibleChecks.forEach(c => c.checked = checked);
        this._onRecipientSelectChange();
    };

    window.whatsAppSender._onRecipientSelectChange = function () {
        const checked = document.querySelectorAll('.wa-row-select:checked');
        const bulkBar = document.getElementById('wa-bulk-actions');
        const countEl = document.getElementById('wa-selection-count');
        const selectAll = document.getElementById('wa-report-select-all');

        if (bulkBar) bulkBar.style.display = checked.length > 0 ? 'flex' : 'none';
        if (countEl) countEl.innerText = `${checked.length} Selected`;

        if (selectAll) {
            const allVisible = document.querySelectorAll('.wa-recipient-card:not([style*="display: none"]) .wa-row-select');
            selectAll.checked = allVisible.length > 0 && checked.length === allVisible.length;
            selectAll.indeterminate = checked.length > 0 && checked.length < allVisible.length;
        }
    };

    window.whatsAppSender.bulkExpandSelected = function () {
        const selectedChecks = document.querySelectorAll('.wa-row-select:checked');
        selectedChecks.forEach(check => {
            const card = check.closest('.wa-recipient-card');
            if (card && !card.classList.contains('expanded')) {
                window.whatsAppSender.toggleRecipientExpansion(card.id);
            }
        });
    };

    window.whatsAppSender.bulkDeleteSelected = async function (logId, broadcastId) {
        const selectedChecks = document.querySelectorAll('.wa-row-select:checked');
        if (selectedChecks.length === 0) return;

        const confirmed = await AppDialog.confirm(`Are you sure you want to delete ${selectedChecks.length} selected records? This will update the campaign progress accordingly.`, {
            title: 'Bulk Delete',
            danger: true,
            confirmText: `Delete ${selectedChecks.length} Records`
        });

        if (!confirmed) return;

        try {
            AppDialog.toast(`Deleting ${selectedChecks.length} records...`, 'info');
            const updates = {};
            const keys = Array.from(selectedChecks).map(c => c.value);
            const counts = { read: 0, delivered: 0, sent: 0, processing: 0, failed: 0, excluded: 0 };

            keys.forEach((key, index) => {
                updates[`modules/whatsapp_sender/broadcast_logs/${broadcastId}/${key}`] = null;
                const card = selectedChecks[index].closest('.wa-recipient-card');
                if (card) {
                    const status = card.getAttribute('data-status');
                    if (status === 'read') counts.read++;
                    else if (status === 'delivered') counts.delivered++;
                    else if (status === 'sent') counts.sent++;
                    else if (status === 'processing') counts.processing++;
                    else if (status === 'failed' || status === 'error') counts.failed++;
                    else if (status === 'excluded') counts.excluded++;
                }
            });

            await firebase.database().ref().update(updates);

            const firestoreUpdate = {
                processedNumbersCount: firebase.firestore.FieldValue.increment(-keys.length),
                recipientsCount: firebase.firestore.FieldValue.increment(-keys.length)
            };

            const dRead = counts.read;
            const dDeliv = counts.read + counts.delivered;
            const dSent = counts.read + counts.delivered + counts.sent;
            const dDispatched = dSent + counts.processing;
            const dFailed = counts.failed;
            const dExcluded = counts.excluded;

            if (dRead > 0) firestoreUpdate.readCount = firebase.firestore.FieldValue.increment(-dRead);
            if (dDeliv > 0) firestoreUpdate.deliveredCount = firebase.firestore.FieldValue.increment(-dDeliv);
            if (dSent > 0) firestoreUpdate.sentCount = firebase.firestore.FieldValue.increment(-dSent);
            if (dDispatched > 0) firestoreUpdate.dispatchedCount = firebase.firestore.FieldValue.increment(-dDispatched);
            if (dFailed > 0) firestoreUpdate.failedCount = firebase.firestore.FieldValue.increment(-dFailed);
            if (dExcluded > 0) firestoreUpdate.excludedCount = firebase.firestore.FieldValue.increment(-dExcluded);

            await firestore.collection('modules').doc('whatsapp_sender').collection('history').doc(logId).update(firestoreUpdate);
            AppDialog.toast(`Successfully deleted ${keys.length} records.`, 'success');

            const selectAll = document.getElementById('wa-report-select-all');
            if (selectAll) selectAll.checked = false;
            this._onRecipientSelectChange();

        } catch (error) {
            console.error("Bulk Delete Failed:", error);
            AppDialog.toast('Bulk delete failed: ' + error.message, 'error');
        }
    };

    window.whatsAppSender.stopBroadcast = async function (logId) {
        if (!logId) return;
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
            window.AppLogger.log('STOP_BROADCAST', 'whatsapp_sender', { logId }, logId);
            AppDialog.toast('Stop request sent.', 'info');
        } catch (e) {
            AppDialog.toast('Failed to stop: ' + e.message, 'error');
        }
    };

    window.whatsAppSender.deleteBroadcastHistory = async function (logId, broadcastId) {
        if (!logId) return;

        const confirmed = await AppDialog.confirm('Are you sure you want to delete this broadcast instance? This will remove the history record and all associated delivery logs. This action cannot be undone.', {
            title: 'Delete History',
            danger: true,
            confirmText: 'Delete Permanently'
        });

        if (!confirmed) return;

        try {
            AppDialog.toast('Deleting history...', 'info');
            await firestore.collection('modules').doc('whatsapp_sender').collection('history').doc(logId).delete();

            if (broadcastId) {
                await firebase.database().ref(`modules/whatsapp_sender/broadcast_logs/${broadcastId}`).remove();
            }

            window.AppLogger.log('DELETE_BROADCAST_HISTORY', 'whatsapp_sender', { logId, broadcastId }, logId);
            AppDialog.toast('History instance deleted successfully.', 'success');
            const container = document.getElementById('whatsapp-content-history');
            if (container && container.getAttribute('data-active-report') === logId) {
                this.renderHistoryView();
            }
        } catch (error) {
            console.error("Delete Failed:", error);
            AppDialog.toast('Failed to delete history: ' + error.message, 'error');
        }
    };

    window.whatsAppSender.openFrequencyProtection = async function () {
        const audienceSelect = document.getElementById('wa-broadcast-audience');
        const templateSelect = document.getElementById('wa-template-select');

        const audienceVal = audienceSelect ? audienceSelect.value : 'none';
        const templateName = templateSelect ? templateSelect.value : '';

        if (audienceVal === 'none' || !templateName) {
            AppDialog.toast('Please select an audience and template first.', 'warn');
            return;
        }

        const audienceText = audienceSelect.options[audienceSelect.selectedIndex].text;

        const html = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div style="display:flex; align-items:center; gap:12px; padding-bottom:12px; border-bottom:1px solid var(--border);">
                    <div style="width:42px; height:42px; border-radius:12px; background:rgba(102, 200, 200, 0.1); color:var(--accent-secondary); display:flex; align-items:center; justify-content:center;">
                        <i data-lucide="shield-check" style="width:24px;height:24px;"></i>
                    </div>
                    <div>
                        <div style="font-weight:800; color:var(--text-main); font-size:1.1rem;">Smart Frequency Filter</div>
                        <div style="font-size:0.8rem; color:var(--text-dim);">Ensuring a healthy message cadence</div>
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.02); padding:16px; border-radius:14px; border:1px solid rgba(255,255,255,0.05); display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:700; letter-spacing:0.05em;">Current Audience</span>
                        <span style="font-size:0.8rem; color:var(--text-main); font-weight:600;">${audienceText}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:700; letter-spacing:0.05em;">Template</span>
                        <span style="font-size:0.8rem; color:var(--accent-secondary); font-weight:600;">${templateName}</span>
                    </div>
                </div>

                <div class="form-group" style="background:rgba(255,255,255,0.03); padding:16px; border-radius:14px; border:1px solid rgba(255,255,255,0.05);">
                    <label style="font-size:0.75rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; display:block; margin-bottom:12px; letter-spacing:0.05em;">Lookback Window</label>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <input type="number" id="wa-fp-days" class="wa-input" value="7" min="1" max="30" style="width:80px; text-align:center; font-weight:700; font-size:1.1rem; padding:12px;">
                        <span style="font-size:0.9rem; color:var(--text-main); font-weight:600;">Days</span>
                    </div>
                    <p style="font-size:0.75rem; color:var(--text-dim); margin-top:10px; line-height:1.4;">We will identify recipients who have already received this template in the selected window.</p>
                </div>
            </div>
        `;

        const modalPromise = AppDialog.confirm(html, {
            title: 'Frequency Protection',
            confirmText: 'Run Scanner',
            isHtml: true,
            width: '450px'
        });

        setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
        const confirmed = await modalPromise;

        if (confirmed) {
            const daysInput = document.getElementById('wa-fp-days');
            const days = daysInput ? (parseInt(daysInput.value) || 7) : 7;
            this.runFrequencyCheck(audienceVal, templateName, days);
        }
    };

    window.whatsAppSender.runFrequencyCheck = async function (audienceVal, templateName, days) {
        try {
            AppDialog.toast('Running frequency check...', 'info');
            const recipients = await this._getCurrentlySelectedRecipients();

            if (!recipients || recipients.length === 0) {
                AppDialog.toast('No recipients found in selected audience.', 'error');
                return;
            }

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const historySnap = await firestore.collection('modules').doc('whatsapp_sender').collection('history')
                .where('timestamp', '>=', cutoffDate)
                .get();

            const matchingHistoryDocs = historySnap.docs.filter(doc => doc.data().template === templateName);

            if (matchingHistoryDocs.length === 0) {
                AppDialog.alert('No previous broadcasts found for this template in the last ' + days + ' days. Your entire audience is "fresh".', { title: 'Frequency Protection', type: 'success' });
                return;
            }

            const alreadySentTo = new Set();
            const failuresByError = {};
            const broadcastIds = matchingHistoryDocs.map(doc => doc.id);
            const snapshots = await Promise.all(broadcastIds.map(bId => firebase.database().ref(`modules/whatsapp_sender/broadcast_logs/${bId}`).once('value')));

            const normalize = (phone) => {
                let cleaned = String(phone || '').replace(/\D/g, '');
                if (cleaned.length === 10) cleaned = '91' + cleaned;
                return cleaned;
            };

            snapshots.forEach(snap => {
                const logs = snap.val() || {};
                Object.values(logs).forEach(log => {
                    const status = (log.status || '').toLowerCase();
                    const phone = log.recipientId || log.phone;
                    if (!phone) return;
                    const cleanPhone = normalize(phone);

                    if (['sent', 'delivered', 'read', 'processing'].includes(status)) {
                        alreadySentTo.add(cleanPhone);
                    } else if (status === 'failed' || status === 'error') {
                        let errorMsg = (log.error || 'Unknown Error').split(':')[0].split('.')[0].trim();
                        if (errorMsg.length > 60) errorMsg = errorMsg.substring(0, 57) + '...';
                        if (!failuresByError[errorMsg]) failuresByError[errorMsg] = new Set();
                        failuresByError[errorMsg].add(cleanPhone);
                    }
                });
            });

            const successDuplicates = recipients.filter(r => alreadySentTo.has(r.phone));
            const failureCategories = Object.entries(failuresByError).map(([error, phones]) => {
                const affectedRecipients = recipients.filter(r => phones.has(r.phone) && !alreadySentTo.has(r.phone));
                return { error, recipients: affectedRecipients };
            }).filter(cat => cat.recipients.length > 0);

            if (successDuplicates.length === 0 && failureCategories.length === 0) {
                AppDialog.alert('Found ' + recipients.length + ' recipients. None have received this template in the last ' + days + ' days.', { title: 'Frequency Protection', type: 'success' });
            } else {
                const overlay = document.createElement('div');
                overlay.className = 'app-dialog-overlay';
                overlay.style.zIndex = '100000';

                overlay.innerHTML = `
                    <div class="app-dialog-box" style="max-width: 520px;">
                        <div style="display:flex; flex-direction:column; gap:24px;">
                            <div style="text-align:center;">
                                <div style="font-size:3.5rem; margin-bottom:12px; filter: drop-shadow(0 0 15px rgba(239, 68, 68, 0.3));">🛡️</div>
                                <h3 style="margin:0; color:var(--text-main); font-weight:800; font-size:1.5rem;">Scanner Results</h3>
                                <p style="font-size:0.85rem; color:var(--text-dim); margin-top:6px;">We identified potential duplicates in the last <strong>${days}</strong> days.</p>
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                                <div style="background:rgba(59, 130, 246, 0.08); border:1px solid rgba(59, 130, 246, 0.15); padding:16px; border-radius:18px; text-align:center;">
                                    <div style="font-size:0.7rem; color:#3b82f6; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:4px;">Successful</div>
                                    <div style="font-size:2rem; font-weight:900; color:var(--text-main);">${successDuplicates.length}</div>
                                </div>
                                <div style="background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.15); padding:16px; border-radius:18px; text-align:center;">
                                    <div style="font-size:0.7rem; color:#ef4444; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:4px;">Failures</div>
                                    <div style="font-size:2rem; font-weight:900; color:var(--text-main);">${failureCategories.reduce((sum, c) => sum + c.recipients.length, 0)}</div>
                                </div>
                            </div>

                            <div>
                                ${successDuplicates.length > 0 ? `
                                <div style="margin-bottom:20px;">
                                    <div style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:10px;">Recent Successes (Auto-Selected)</div>
                                    <div style="max-height:150px; overflow-y:auto; border:1px solid var(--border); border-radius:12px; background:rgba(0,0,0,0.15); padding:4px;">
                                        ${successDuplicates.map(r => `
                                            <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:8px; margin-bottom:2px;" class="wa-fp-item">
                                                <input type="checkbox" class="wa-fp-success-check" value="${r.phone}" checked style="width:16px; height:16px; accent-color:#3b82f6;">
                                                <div style="flex:1;">
                                                    <div style="font-size:0.85rem; font-weight:600; color:var(--text-main);">${r.name}</div>
                                                    <div style="font-size:0.7rem; color:var(--text-dim);">+${r.phone}</div>
                                                </div>
                                                <div style="font-size:0.6rem; color:#3b82f6; font-weight:800; text-transform:uppercase;">SENT</div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>` : ''}

                                ${failureCategories.length > 0 ? `
                                <div>
                                    <div style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:10px;">Include Failed Messages by Error:</div>
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        ${failureCategories.map((cat, idx) => `
                                            <div style="background:rgba(239, 68, 68, 0.05); border:1px solid rgba(239, 68, 68, 0.1); border-radius:12px; padding:12px;">
                                                <label style="display:flex; align-items:flex-start; gap:12px; cursor:pointer;">
                                                    <input type="checkbox" class="wa-fp-error-cat-check" data-idx="${idx}" style="width:18px; height:18px; margin-top:2px; accent-color:#ef4444;">
                                                    <div style="flex:1;">
                                                        <div style="font-size:0.85rem; font-weight:700; color:var(--text-main);">${cat.error}</div>
                                                        <div style="font-size:0.75rem; color:#ef4444; font-weight:600; margin-top:2px;">${cat.recipients.length} recipients affected</div>
                                                    </div>
                                                </label>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>` : ''}
                            </div>
                        </div>
                        <div class="app-dialog-actions" style="margin-top:24px;">
                            <button class="btn btn-secondary" id="wa-fp-cancel" style="min-width:100px;">Skip Filtering</button>
                            <button class="btn btn-primary" id="wa-fp-apply" style="min-width:150px;">Apply Exclusions</button>
                        </div>
                    </div>`;

                document.body.appendChild(overlay);
                if (window.lucide) window.lucide.createIcons({ root: overlay });

                overlay.querySelector('#wa-fp-cancel').onclick = () => overlay.remove();

                overlay.querySelector('#wa-fp-apply').onclick = () => {
                    const excluded = new Set();
                    overlay.querySelectorAll('.wa-fp-success-check:checked').forEach(c => excluded.add(c.value));
                    overlay.querySelectorAll('.wa-fp-error-cat-check:checked').forEach(c => {
                        const idx = parseInt(c.getAttribute('data-idx'));
                        failureCategories[idx].recipients.forEach(r => excluded.add(r.phone));
                    });
                    this.excludedNumbers = Array.from(excluded);
                    overlay.remove();
                    AppDialog.toast(`Successfully applied ${this.excludedNumbers.length} exclusions to your broadcast selection.`, 'success');
                    this.updateRecipientCount();
                };
            }
        } catch (error) {
            console.error("Frequency Check Failed:", error);
            AppDialog.toast('Frequency check failed: ' + error.message, 'error');
        }
    };

    window.whatsAppSender.lookupNameInLists = async function (phoneStr, btnElement) {
        if (!phoneStr) return;
        const cleanTargetPhone = phoneStr.replace(/\D/g, '');
        const originalHtml = btnElement.innerHTML;
        btnElement.innerHTML = `<i data-lucide="loader" style="width:12px;height:12px;animation:spin 1s linear infinite;margin-right:4px;display:inline-block;vertical-align:middle;"></i><span style="vertical-align:middle;">Searching...</span>`;
        if (window.lucide) window.lucide.createIcons();
        btnElement.disabled = true;

        try {
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
                const badge = document.createElement('span');
                badge.className = 'wa-name-badge';
                badge.style.cssText = 'display:inline-block;margin-top:6px;padding:4px 10px;font-size:0.75rem;border-radius:12px;background:rgba(56, 189, 248, 0.1);color:#38bdf8;border:1px solid rgba(56, 189, 248, 0.2);';
                badge.innerHTML = `<i data-lucide="user" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i><span style="vertical-align:middle;font-weight:600;">${foundName}</span> <span style="opacity:0.6;font-size:0.65rem;margin-left:4px;">(in ${foundListName})</span>`;
                btnElement.replaceWith(badge);
                if (window.lucide) window.lucide.createIcons();
            } else {
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

    window.whatsAppSender.renderListsView = function () {
        const container = document.getElementById('whatsapp-content-lists');
        if (!container) return;
        const isMaster = window.currentUserData?.isAdmin || window.currentUserData?.permissions?.whatsapp_sender === true || false;
        const canManageLists = isMaster || window.currentUserData?.permissions?.whatsapp_sender?.lists === true;

        container.innerHTML = `
            <div class="wa-lists-page">
                <div class="wa-lists-header">
                    <div class="wa-lists-title"><i data-lucide="contact" style="width:20px;height:20px;color:var(--accent);"></i><span>Contact Lists</span></div>
                    ${canManageLists ? `
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-secondary" onclick="window.whatsAppSender.scanListDuplicates(this)" style="border-radius:12px; padding:8px 16px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);">
                            <i data-lucide="scan-search" style="width:15px;height:15px;color:var(--text-main);"></i> Scan for Duplicates
                        </button>
                        <button class="btn btn-primary" onclick="window.whatsAppSender.createListModal()" style="border-radius:12px; padding:8px 16px;"><i data-lucide="plus" style="width:15px;height:15px;"></i> New List</button>
                    </div>` : ''}
                </div>
                <div id="wa-lists-container" class="wa-lists-body"><div class="wa-lists-loading"><i data-lucide="loader" style="width:22px;height:22px;animation:spin 1s linear infinite;"></i> Loading lists...</div></div>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
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
            const phoneMap = new Map();
            Object.values(this.lists).forEach(list => {
                if (!list.members) return;
                Object.values(list.members).forEach(member => {
                    if (!member.phone) return;
                    const cleanPhone = String(member.phone).replace(/\D/g, '');
                    if (!cleanPhone) return;
                    let normalizedId = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;
                    const entry = { listName: list.name, name: member.name || 'Unknown' };
                    if (phoneMap.has(normalizedId)) phoneMap.get(normalizedId).push(entry);
                    else phoneMap.set(normalizedId, [entry]);
                });
            });

            const duplicates = [];
            for (const [id, occurrences] of phoneMap.entries()) {
                if (occurrences.length > 1) duplicates.push({ id, occurrences });
            }

            btnElement.innerHTML = originalHtml;
            btnElement.disabled = false;
            if (window.lucide) window.lucide.createIcons();

            if (duplicates.length === 0) { AppDialog.toast('Great! No duplicates found.', 'success'); return; }

            let reportHtml = `<div style="margin-bottom:16px; font-size:0.9rem; color:var(--text-dim);">Found <strong>${duplicates.length}</strong> duplicated phone numbers.</div><div style="max-height: 400px; overflow-y:auto; border-radius:12px; border:1px solid rgba(255,255,255,0.05); background:rgba(0,0,0,0.2);">`;
            duplicates.forEach(dup => {
                reportHtml += `<div style="padding:16px; border-bottom:1px solid rgba(255,255,255,0.05);"><div style="font-weight:700; font-family:monospace; color:var(--text-main); font-size:1.1rem; margin-bottom:8px; display:flex; align-items:center; gap:8px;"><i data-lucide="alert-triangle" style="width:16px;height:16px;color:#f59e0b;"></i> +xxxxxx${dup.id.slice(-4)}</div><div style="display:flex; flex-direction:column; gap:6px; padding-left:24px;">`;
                dup.occurrences.forEach(occ => {
                    reportHtml += `<div style="display:flex; align-items:center; gap:8px; font-size:0.85rem;"><div style="width:6px;height:6px;border-radius:50%;background:var(--accent);"></div><span style="color:var(--text-dim); width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${occ.listName}</span><span style="color:var(--text-main); font-weight:600;">${occ.name}</span></div>`;
                });
                reportHtml += `</div></div>`;
            });
            reportHtml += `</div>`;
            AppDialog.confirm(reportHtml, { title: 'Cross-List Duplicates Detected', isHtml: true, confirmText: 'Acknowledge', cancelText: 'Close', width: '500px' });
        }, 500);
    };

    window.whatsAppSender.renderLists = function () {
        const container = document.getElementById('wa-lists-container');
        if (!container) return;
        const lists = Object.entries(this.lists).map(([id, list]) => ({ id, ...list }));
        const isMaster = window.currentUserData?.isAdmin || window.currentUserData?.permissions?.whatsapp_sender === true || false;
        const canManageLists = isMaster || window.currentUserData?.permissions?.whatsapp_sender?.lists === true;

        if (lists.length === 0) {
            container.innerHTML = `<div class="wa-lists-empty"><div class="wa-lists-empty-icon"><i data-lucide="users" style="width:36px;height:36px;color:var(--accent);opacity:0.5;"></i></div><p>No contact lists yet</p><span>${canManageLists ? 'Create a list to group your contacts for targeted broadcasts.' : 'You do not have lists yet.'}</span>${canManageLists ? `<button class="btn btn-primary" onclick="window.whatsAppSender.createListModal()"><i data-lucide="plus" style="width:14px;height:14px;"></i> Create First List</button>` : ''}</div>`;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const colors = ['#25d366', '#f97316', '#a78bfa', '#38bdf8', '#fb7185', '#4ade80'];
        let htmlStr = '';

        htmlStr += `<div style="font-size:0.9rem; font-weight:600; color:var(--text-dim); margin-bottom:12px; margin-top:4px;">Contact Lists</div><div class="wa-lists-grid">${lists.map((list, i) => {
            const color = colors[i % colors.length];
            const initials = (list.name || '?').substring(0, 2).toUpperCase();
            const count = list.contactsCount || list.count || 0;
            const numbersCount = list.numbersCount || count;
            const dateStr = list.createdAt ? (list.createdAt.toDate ? list.createdAt.toDate() : new Date(list.createdAt)).toLocaleDateString() : 'N/A';
            return `<div class="wa-list-row" onclick="window.whatsAppSender.viewListDetails('${list.id}')"><div class="wa-list-avatar" style="background:${color}22;color:${color};">${initials}</div><div class="wa-list-info"><div class="wa-list-name">${list.name}</div><div class="wa-list-sub" style="display:flex; flex-direction:column; gap:2px;"><span>${count} contact${count !== 1 ? 's' : ''} • ${numbersCount} unique number${numbersCount !== 1 ? 's' : ''}</span><span style="font-size:0.7rem; opacity:0.6; display:flex; align-items:center; gap:4px;"><i data-lucide="calendar" style="width:10px;height:10px;"></i> Created ${dateStr}</span></div></div><div class="wa-list-badge" title="Unique Numbers">${numbersCount}</div><i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-dim);flex-shrink:0;"></i></div>`;
        }).join('')}</div>`;

        container.innerHTML = htmlStr;
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.viewListDetails = function (listId) {
        const list = this.lists[listId];
        if (!list) return;
        const container = document.getElementById('whatsapp-content-lists');
        const isMaster = window.currentUserData?.isAdmin || window.currentUserData?.permissions?.whatsapp_sender === true || false;
        const canManageLists = isMaster || window.currentUserData?.permissions?.whatsapp_sender?.lists === true;

        container.innerHTML = `<div class="wa-lists-page"><div class="wa-lists-header" style="border-bottom:1px solid var(--card-border); padding-bottom:16px; margin-bottom:0;"><div style="display:flex;align-items:center;gap:12px;"><button class="btn-icon" onclick="window.whatsAppSender.renderListsView()" title="Back to lists"><i data-lucide="arrow-left" style="width:18px;height:18px;"></i></button><div class="wa-list-avatar" style="background:var(--accent-faint);color:var(--accent);font-size:1rem;">${(list.name || '?').substring(0, 2).toUpperCase()}</div><div><div style="display:flex;align-items:center;gap:6px;"><div id="wa-list-name-display" style="font-size:1.05rem;font-weight:700;color:var(--text-main);cursor:${canManageLists ? 'pointer' : 'default'};" ${canManageLists ? `onclick="window.whatsAppSender.editListNameInline('${listId}')" title="Click to rename"` : ''}>${list.name}</div>${canManageLists ? `<button class="btn-icon" onclick="window.whatsAppSender.editListNameInline('${listId}')" title="Rename list" style="color:var(--text-dim);"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>` : ''}</div><div style="font-size:0.75rem;color:var(--text-dim); display:flex; flex-direction:column; gap:2px;" id="wa-detail-count"><div>${list.contactsCount || list.count || 0} contacts • ${list.numbersCount || list.count || 0} unique numbers</div><div style="font-size:0.65rem; opacity:0.7; display:flex; align-items:center; gap:4px;"><i data-lucide="calendar" style="width:10px;height:10px;"></i>Created ${list.createdAt ? (list.createdAt.toDate ? list.createdAt.toDate() : new Date(list.createdAt)).toLocaleDateString() : 'N/A'}</div></div></div></div><div style="display:flex;gap:8px;align-items:center;">${canManageLists ? `<button class="btn btn-secondary" onclick="window.whatsAppSender.uploadCsvModal('${listId}')" title="Upload CSV"><i data-lucide="upload" style="width:14px;height:14px;"></i> Upload CSV</button><button class="btn btn-primary" onclick="window.whatsAppSender.addContactModal('${listId}')"><i data-lucide="user-plus" style="width:14px;height:14px;"></i> Add Contact</button><button class="btn-icon danger" onclick="window.whatsAppSender.deleteList('${listId}')" title="Delete list"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>` : ''}</div></div><div class="wa-lists-body" style="padding-top:0;"><div id="wa-list-members-container" class="wa-members-container"><div class="wa-lists-loading"><i data-lucide="loader" style="width:20px;height:20px;animation:spin 1s linear infinite;"></i> Loading members...</div></div></div></div>`;
        if (window.lucide) window.lucide.createIcons();
        const membersRef = firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).collection('members');
        if (this._membersUnsubscribe) this._membersUnsubscribe();
        this._membersUnsubscribe = membersRef.onSnapshot(snap => {
            const members = {}; snap.forEach(doc => members[doc.id] = doc.data()); this.renderListMembers(listId, list, members);
        }, err => { console.error(err); AppDialog.toast('Failed to load members.', 'error'); });
    };

    window.whatsAppSender.editListNameInline = function (listId) {
        const displayEl = document.getElementById('wa-list-name-display');
        if (!displayEl || displayEl.querySelector('input')) return;
        const currentName = displayEl.textContent.trim();
        displayEl.innerHTML = `<input id="wa-list-rename-input" type="text" value="${currentName}" class="wa-modal-input" style="width:200px; padding:4px 8px; font-size:1rem; font-weight:700; margin-bottom:0;" autofocus>`;
        const input = displayEl.querySelector('input'); input.focus(); input.select();
        const save = () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).update({ name: newName });
            displayEl.innerHTML = `<span style="cursor:pointer;" onclick="window.whatsAppSender.editListNameInline('${listId}')">${newName || currentName}</span>`;
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') displayEl.innerHTML = `<span style="cursor:pointer;" onclick="window.whatsAppSender.editListNameInline('${listId}')">${currentName}</span>`; });
    };

    window.whatsAppSender.renderListMembers = function (listId, list, members) {
        const container = document.getElementById('wa-list-members-container');
        if (!container) return;
        const membersList = Object.entries(members).map(([key, m]) => ({ key, ...m }));
        const countEl = document.getElementById('wa-detail-count');
        if (countEl) countEl.textContent = `${membersList.length} contact${membersList.length !== 1 ? 's' : ''}`;
        if (membersList.length === 0) {
            container.innerHTML = `<div class="wa-lists-empty" style="padding:40px 0;"><div class="wa-lists-empty-icon"><i data-lucide="user-x" style="width:32px;height:32px;color:var(--accent);opacity:0.5;"></i></div><p>No contacts in this list</p><span>Add contacts to get started with broadcasts.</span></div>`;
            if (window.lucide) window.lucide.createIcons(); return;
        }
        const systemKeys = new Set(['key', 'name', 'phone', 'addedAt']); const extraKeys = new Set();
        if (list && list.customFields && Array.isArray(list.customFields)) list.customFields.forEach(f => extraKeys.add(f));
        membersList.forEach(m => Object.keys(m).forEach(k => { if (!systemKeys.has(k)) extraKeys.add(k); }));
        const extraCols = Array.from(extraKeys);
        const isMaster = window.currentUserData?.isAdmin || window.currentUserData?.permissions?.whatsapp_sender === true || false;
        const canManageLists = isMaster || window.currentUserData?.permissions?.whatsapp_sender?.lists === true;

        container.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.88rem;"><thead><tr style="border-bottom:1px solid var(--card-border);"><th style="text-align:left;padding:8px 12px;color:var(--text-dim);font-weight:600;">Name</th><th style="text-align:left;padding:8px 12px;color:var(--text-dim);font-weight:600;">Phone</th>${extraCols.map(col => `<th style="text-align:left;padding:8px 12px;color:var(--text-dim);font-weight:600;">${col}</th>`).join('')}${canManageLists ? '<th style="padding:8px 12px;"></th>' : ''}</tr></thead><tbody>${membersList.map(m => `<tr style="border-bottom:1px solid var(--card-border);" onmouseenter="this.style.background='var(--surface-hover, rgba(255,255,255,0.03))'" onmouseleave="this.style.background='';"><td style="padding:10px 12px;color:var(--text-main);font-weight:500;">${m.name || '—'}</td><td style="padding:10px 12px;color:var(--text-dim);font-family:monospace;">${m.phone || '—'}</td>${extraCols.map(col => `<td style="padding:10px 12px;color:var(--text-dim);">${m[col] !== undefined ? m[col] : '—'}</td>`).join('')}${canManageLists ? `<td style="padding:10px 12px;display:flex;gap:6px;justify-content:flex-end;"><button class="btn-icon" onclick="window.whatsAppSender.editMemberModal('${listId}', '${m.key}')" title="Edit" style="color:var(--accent);"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button><button class="btn-icon danger" onclick="window.whatsAppSender.removeMemberFromList('${listId}', '${m.key}')" title="Remove"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
        if (window.lucide) window.lucide.createIcons();
    };

    // --- Modal & List Management Helpers ---

    window.whatsAppSender._showModal = function (html, onSubmit) {
        document.getElementById('wa-modal-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'wa-modal-overlay';
        overlay.innerHTML = `<div class="wa-modal">${html}</div>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        setTimeout(() => overlay.querySelector('input')?.focus(), 50);
        const submitBtn = overlay.querySelector('[data-wa-modal-submit]');
        if (submitBtn && onSubmit) submitBtn.addEventListener('click', () => onSubmit(overlay));
        overlay.querySelectorAll('[data-wa-modal-close]').forEach(btn => btn.addEventListener('click', () => overlay.remove()));
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitBtn?.click();
            if (e.key === 'Escape') overlay.remove();
        });
    };

    window.whatsAppSender.createListModal = function () {
        this._showModal(`
            <div class="wa-modal-header"><span class="wa-modal-title"><i data-lucide="plus-circle" style="width:18px;height:18px;color:var(--accent);"></i> Create New List</span><button class="btn-icon" data-wa-modal-close><i data-lucide="x" style="width:16px;height:16px;"></i></button></div>
            <div class="wa-modal-body" style="max-height: 60vh; overflow-y: auto;">
                <label class="wa-modal-label">List Name</label>
                <input id="wa-new-list-name" class="wa-modal-input" type="text" placeholder="e.g. Parents, Staff…" autocomplete="off">
                <div style="margin-top: 24px; border-top: 1px solid var(--border); padding-top: 16px;">
                    <label class="wa-modal-label" style="display:flex; justify-content:space-between; align-items:center;"><span>List Schema (Columns)</span><button type="button" class="btn btn-secondary btn-sm" id="wa-add-field-btn"><i data-lucide="plus" style="width:12px;height:12px;"></i> Add Field</button></label>
                    <div id="wa-schema-fields">
                        <div style="display:flex; gap:8px; margin-bottom:8px;"><input class="wa-modal-input" type="text" value="Name (Required)" disabled style="opacity:0.7;"></div>
                        <div style="display:flex; gap:8px; margin-bottom:8px;"><input class="wa-modal-input" type="text" value="Phone Number (Required)" disabled style="opacity:0.7;"></div>
                    </div>
                </div>
            </div>
            <div class="wa-modal-footer"><button class="btn btn-secondary" data-wa-modal-close>Cancel</button><button class="btn btn-primary" data-wa-modal-submit><i data-lucide="check"></i> Create List</button></div>
        `, (overlay) => {
            const name = overlay.querySelector('#wa-new-list-name').value.trim();
            if (!name) return;
            const customFields = Array.from(overlay.querySelectorAll('.wa-custom-field-input')).map(inp => inp.value.trim()).filter(v => v);
            const listRef = firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc();
            listRef.set({ name, customFields: customFields.length > 0 ? customFields : null, createdAt: firebase.firestore.FieldValue.serverTimestamp(), count: 0 })
                .then(() => { overlay.remove(); AppDialog.toast('List created.', 'success'); setTimeout(() => this.viewListDetails(listRef.id), 500); });
        });
        setTimeout(() => {
            const addBtn = document.getElementById('wa-add-field-btn');
            if (addBtn) addBtn.addEventListener('click', () => {
                const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '8px'; row.style.marginBottom = '8px';
                row.innerHTML = `<input class="wa-modal-input wa-custom-field-input" type="text" placeholder="Field Name"><button class="btn btn-icon btn-danger" type="button" onclick="this.parentElement.remove()"><i data-lucide="trash-2"></i></button>`;
                document.getElementById('wa-schema-fields').appendChild(row);
                if (window.lucide) window.lucide.createIcons({ root: row }); row.querySelector('input').focus();
            });
        }, 50);
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.addContactModal = async function (listId) {
        const listSnap = await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).get();
        const customFields = listSnap.data()?.customFields || [];
        this._showModal(`
            <div class="wa-modal-header"><span class="wa-modal-title"><i data-lucide="user-plus"></i> Add Contact</span><button class="btn-icon" data-wa-modal-close><i data-lucide="x"></i></button></div>
            <div class="wa-modal-body" style="max-height:60vh; overflow-y:auto;">
                <label class="wa-modal-label">Name *</label><input id="wa-contact-name" class="wa-modal-input" type="text" placeholder="Full name">
                <label class="wa-modal-label">Phone *</label><input id="wa-contact-phone" class="wa-modal-input" type="tel" placeholder="+91...">
                ${customFields.map(f => `<label class="wa-modal-label">${f}</label><input class="wa-modal-input wa-add-field-input" type="text" data-fieldname="${f}" placeholder="${f}">`).join('')}
            </div>
            <div class="wa-modal-footer"><button class="btn btn-secondary" data-wa-modal-close>Cancel</button><button class="btn btn-primary" data-wa-modal-submit>Add Contact</button></div>
        `, (overlay) => {
            const name = overlay.querySelector('#wa-contact-name').value.trim();
            const phone = overlay.querySelector('#wa-contact-phone').value.trim();
            if (!name || !phone) return;
            const entry = { name, phone, addedAt: firebase.database.ServerValue.TIMESTAMP };
            overlay.querySelectorAll('.wa-add-field-input').forEach(inp => { const key = inp.getAttribute('data-fieldname'); entry[key] = inp.value.trim(); });
            overlay.remove();
            firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).collection('members').add(entry).then(() => this.recalculateListCounts(listId));
        });
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.editMemberModal = async function (listId, memberKey) {
        const listRef = firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId);
        const [listSnap, memberSnap] = await Promise.all([listRef.get(), listRef.collection('members').doc(memberKey).get()]);
        const listData = listSnap.data(); const memberData = memberSnap.data();
        if (!listData || !memberData) return;
        const allFields = [...new Set([...(listData.customFields || []), ...Object.keys(memberData).filter(k => !['name', 'phone', 'addedAt'].includes(k))])];
        this._showModal(`
            <div class="wa-modal-header"><span class="wa-modal-title"><i data-lucide="user-pen"></i> Edit Contact</span><button class="btn-icon" data-wa-modal-close><i data-lucide="x"></i></button></div>
            <div class="wa-modal-body" style="max-height:60vh; overflow-y:auto;">
                <label class="wa-modal-label">Name *</label><input id="wa-edit-name" class="wa-modal-input" type="text" value="${(memberData.name || '').replace(/"/g, '&quot;')}">
                <label class="wa-modal-label">Phone *</label><input id="wa-edit-phone" class="wa-modal-input" type="tel" value="${(memberData.phone || '').replace(/"/g, '&quot;')}">
                ${allFields.map(f => `<label class="wa-modal-label">${f}</label><input class="wa-modal-input wa-edit-field-input" type="text" data-fieldname="${f}" value="${(memberData[f] || '').replace(/"/g, '&quot;')}">`).join('')}
            </div>
            <div class="wa-modal-footer"><button class="btn btn-secondary" data-wa-modal-close>Cancel</button><button class="btn btn-primary" data-wa-modal-submit>Save Changes</button></div>
        `, (overlay) => {
            const updates = { name: overlay.querySelector('#wa-edit-name').value.trim(), phone: overlay.querySelector('#wa-edit-phone').value.trim() };
            overlay.querySelectorAll('.wa-edit-field-input').forEach(inp => updates[inp.getAttribute('data-fieldname')] = inp.value);
            listRef.collection('members').doc(memberKey).update(updates).then(() => { AppDialog.toast('Updated.', 'success'); this.recalculateListCounts(listId); });
            overlay.remove();
        });
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.uploadCsvModal = async function (listId) {
        const listRef = firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId);
        const listSnap = await listRef.get();
        const customFields = listSnap.data()?.customFields || [];
        this._showModal(`
            <div class="wa-modal-header"><span class="wa-modal-title"><i data-lucide="upload"></i> Upload CSV</span><button class="btn-icon" data-wa-modal-close><i data-lucide="x"></i></button></div>
            <div id="wa-csv-step-1" class="wa-modal-body"><input id="wa-csv-file" class="wa-modal-input" type="file" accept=".csv"><div class="wa-modal-footer"><button class="btn btn-primary" id="wa-csv-next-btn">Next</button></div></div>
            <div id="wa-csv-step-2" style="display:none;" class="wa-modal-body">
                <label>Name Column(s)</label><select id="wa-mapping-name" multiple class="wa-modal-input" style="height:80px;"></select>
                <label>Phone Column(s)</label><select id="wa-mapping-phone" multiple class="wa-modal-input" style="height:80px;"></select>
                ${customFields.map((f, i) => `<label>${f}</label><select id="wa-mapping-custom-${i}" multiple class="wa-mapping-custom-select" data-fieldname="${f}" style="height:60px;width:100%;"></select>`).join('')}
                <div class="wa-modal-footer"><button class="btn btn-secondary" id="wa-csv-back-btn">Back</button><button class="btn btn-primary" id="wa-csv-upload-btn">Upload</button></div>
            </div>
        `);
        const overlay = document.getElementById('wa-modal-overlay'); let headers = [], rows = [];
        overlay.querySelector('#wa-csv-next-btn').onclick = () => {
            const file = overlay.querySelector('#wa-csv-file').files[0]; if (!file) return;
            const reader = new FileReader(); reader.onload = (e) => {
                rows = e.target.result.split('\n'); headers = rows[0].split(',').map(h => h.trim().replace(/[.#$/[\]"]/g, ''));
                overlay.querySelectorAll('select').forEach(sel => headers.forEach((h, i) => { const opt = new Option(h || `Col ${i + 1}`, i); sel.add(opt); }));
                overlay.querySelector('#wa-csv-step-1').style.display = 'none'; overlay.querySelector('#wa-csv-step-2').style.display = 'block';
            }; reader.readAsText(file);
        };
        overlay.querySelector('#wa-csv-upload-btn').onclick = async () => {
            const nameIdx = Array.from(overlay.querySelector('#wa-mapping-name').selectedOptions).map(o => parseInt(o.value));
            const phoneIdx = Array.from(overlay.querySelector('#wa-mapping-phone').selectedOptions).map(o => parseInt(o.value));
            if (!nameIdx.length || !phoneIdx.length) return;
            overlay.querySelector('#wa-csv-upload-btn').disabled = true;
            let batch = firestore.batch(); let count = 0;
            for (let i = 1; i < rows.length; i++) {
                const r = rows[i].split(',').map(c => c.trim().replace(/"/g, ''));
                if (r.length < 2) continue;
                const entry = { name: nameIdx.map(idx => r[idx]).join(' '), phone: phoneIdx.map(idx => r[idx]).join(','), addedAt: firebase.firestore.FieldValue.serverTimestamp() };
                overlay.querySelectorAll('.wa-mapping-custom-select').forEach(sel => {
                    const idxs = Array.from(sel.selectedOptions).map(o => parseInt(o.value));
                    if (idxs.length) entry[sel.getAttribute('data-fieldname')] = idxs.map(idx => r[idx]).join(', ');
                });
                batch.set(listRef.collection('members').doc(), entry); count++;
                if (count % 450 === 0) { await batch.commit(); batch = firestore.batch(); }
            }
            if (count % 450 !== 0) await batch.commit();
            this.recalculateListCounts(listId); overlay.remove(); AppDialog.toast(`Added ${count} contacts.`, 'success');
        };
        if (window.lucide) window.lucide.createIcons({ root: overlay });
    };

    window.whatsAppSender.removeMemberFromList = async function (listId, memberKey) {
        if (await AppDialog.confirm('Remove this contact?')) {
            await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).collection('members').doc(memberKey).delete();
            this.recalculateListCounts(listId);
        }
    };

    window.whatsAppSender.deleteList = async function (listId) {
        if (await AppDialog.confirm('Delete this entire list?', { danger: true })) {
            await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).delete();
            this.renderListsView();
        }
    };

    window.whatsAppSender.recalculateListCounts = async function (listId) {
        const membersSnap = await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).collection('members').get();
        let cCount = 0; const allPhones = new Set();
        membersSnap.forEach(doc => {
            cCount++; const phones = String(doc.data().phone || "").split(/[\/,;]/).map(n => n.trim().replace(/[^\d]/g, '')).filter(n => n.length >= 10);
            phones.forEach(p => allPhones.add(p));
        });
        await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(listId).update({ contactsCount: cCount, numbersCount: allPhones.size, count: cCount });
    };

    window.whatsAppSender._getCurrentlySelectedRecipients = async function () {
        const val = document.getElementById('wa-broadcast-audience').value;
        if (!val.startsWith('list:')) return [];
        const snap = await firestore.collection('modules').doc('whatsapp_sender').collection('lists').doc(val.split(':')[1]).collection('members').get();
        const recipients = []; const seen = new Set();
        snap.docs.forEach(doc => {
            const data = doc.data(); const phone = data.phone;
            if (!phone) return;
            phone.split(/[\/,;]/).forEach(num => {
                let cleaned = num.trim().replace(/[^\d]/g, '');
                if (cleaned.length === 10) cleaned = '91' + cleaned;
                if (cleaned.length >= 10 && !seen.has(cleaned)) { seen.add(cleaned); recipients.push({ phone: cleaned, name: data.name || cleaned }); }
            });
        });
        return recipients;
    };

}