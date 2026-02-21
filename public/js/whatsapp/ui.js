
/**
 * WhatsApp Sender Module - UI Layer
 * Handles DOM manipulation and View Rendering
 */

if (!window.whatsAppSender) {
    console.error("WhatsApp Handler: State not initialized. Load state.js first.");
} else {

    // --- Main Render & Navigation ---

    window.whatsAppSender.switchView = function (viewName) {
        this.currentView = viewName;

        // Update Sidebar
        document.querySelectorAll('#sidebar-nav-whatsapp .nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-whatsapp-${viewName}`);
        if (activeNav) activeNav.classList.add('active');

        // Update View Containers
        document.querySelectorAll('.whatsapp-subview').forEach(el => el.style.display = 'none');
        // valid names: chats, broadcast, connect
        const activeView = document.getElementById(`whatsapp-view-${viewName}`);
        if (activeView) activeView.style.display = 'block';

        this.render();
        if (typeof closeSidebar === 'function') closeSidebar();
    };

    window.whatsAppSender.render = function () {
        if (window.location.hash !== '#whatsapp') return;

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
        const connectNav = document.getElementById('nav-whatsapp-connect'); // Note: connect view implementation missing in original but nav referenced
        if (broadcastNav) broadcastNav.style.display = (isMaster || waPerms.broadcast) ? 'flex' : 'none';
        if (connectNav) connectNav.style.display = (isMaster || waPerms.connect) ? 'flex' : 'none';

        // Fallback if trying to access a restricted view
        if (this.currentView === 'broadcast' && !(isMaster || waPerms.broadcast)) {
            this.currentView = 'chats';
        }

        // Router for sub-views
        if (this.currentView === 'chats') {
            this.renderChatsView();
        } else if (this.currentView === 'broadcast') {
            this.renderBroadcastView();
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

            const initial = convo.displayName ? convo.displayName[0].toUpperCase() : '#';
            const isActive = this.activeConversationId === convo.phoneNumber ? 'active' : '';

            return `
                <div class="conversation-item ${isActive}" onclick="window.whatsAppSender.selectConversation('${convo.phoneNumber}')">
                    <div class="avatar-placeholder">${initial}</div>
                    <div class="conversation-info">
                        <div class="conversation-top">
                            <span class="contact-name">${convo.displayName || convo.phoneNumber}</span>
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

        chatArea.innerHTML = `
            <div class="chat-header">
                <button class="btn-icon mobile-only" onclick="window.whatsAppSender.closeChatMobile()">
                    <i data-lucide="arrow-left"></i>
                </button>
                <div class="avatar-placeholder" style="width: 40px; height: 40px; font-size: 1rem;">
                    ${metadata.displayName?.[0] || '#'}
                </div>
                <div class="chat-header-info">
                    <h3>${metadata.displayName || phoneNumber}</h3>
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

        // 3. Subscribe to specific messages (Logic moved to main.js / event subscription, but triggered here)
        // For simplicity, calling the subscription logic directly if available, or implementing it here as it was in original
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
            const textContent = messageText ? `<div class="message-text">${messageText}</div>` : '';

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
                    return `<option value="${name}" data-content="${encodeURIComponent(content)}">${name} (${t.language || 'en'})</option>`;
                }).join('')
                : `<option value="" disabled selected>No templates found from API</option>`}
                            </select>
                        </div>

                        <!-- Variables (injected dynamically) -->
                        <div id="wa-template-variables"></div>

                    </div>

                    <!-- Send Button pinned at bottom -->
                    <div class="broadcast-form-footer">
                        <button class="btn btn-primary full-width" onclick="window.whatsAppSender.prepareBroadcast()">
                            <i data-lucide="send"></i> Send Broadcast
                        </button>
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
            previewText.innerText = "Select a template to preview content here...";
            return;
        }

        const templateText = decodeURIComponent(contentRaw);

        // Find variables like {{1}}, {{2}} in the text
        const matches = [...templateText.matchAll(/\{\{(\d+)\}\}/g)];
        const uniqueVars = [...new Set(matches.map(m => m[1]))].sort((a, b) => Number(a) - Number(b));

        // Generate Input Fields if this template just got selected (not on every keystroke)
        // We check if the container is empty or we changed templates.
        const currentInputs = varsContainer.querySelectorAll('input');
        if (currentInputs.length !== uniqueVars.length) {
            if (uniqueVars.length > 0) {
                varsContainer.innerHTML = `
                    <label style="display:block; margin-bottom: 8px; font-weight: 500;">Template Variables</label>
                    ${uniqueVars.map(v => `
                        <div class="form-group" style="margin-bottom: 10px;">
                            <input type="text" class="wa-input wa-var-input" data-var="${v}" placeholder="Value for {{${v}}}" oninput="window.whatsAppSender.updatePreviewText()">
                        </div>
                    `).join('')}
                `;
            } else {
                varsContainer.innerHTML = '';
            }
        }

        this.updatePreviewText(); // run initial replace
    };

    window.whatsAppSender.updatePreviewText = function () {
        const select = document.getElementById('wa-template-select');
        const previewText = document.getElementById('wa-preview-text');
        if (!select || !previewText) return;

        const contentRaw = select.options[select.selectedIndex].getAttribute('data-content');
        if (!contentRaw) return;

        let hydratedText = decodeURIComponent(contentRaw);

        // Replace with inputted values
        const inputs = document.querySelectorAll('.wa-var-input');
        inputs.forEach(input => {
            const varNum = input.getAttribute('data-var');
            const val = input.value || `{{${varNum}}}`;
            const regex = new RegExp(`\\{\\{${varNum}\\}\\}`, 'g');
            hydratedText = hydratedText.replace(regex, val);
        });

        previewText.innerText = hydratedText;
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


    // --- Lists View ---

    window.whatsAppSender.renderListsView = function () {
        const container = document.getElementById('whatsapp-content-lists');
        if (!container) return;

        container.innerHTML = `
            <div class="wa-lists-page">
                <div class="wa-lists-header">
                    <div class="wa-lists-title">
                        <i data-lucide="contact" style="width:20px;height:20px;color:var(--accent);"></i>
                        <span>Contact Lists</span>
                    </div>
                    <button class="btn btn-primary" onclick="window.whatsAppSender.createListModal()">
                        <i data-lucide="plus" style="width:15px;height:15px;"></i> New List
                    </button>
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
        this.loadLists();
    };

    window.whatsAppSender.renderLists = function () {
        const container = document.getElementById('wa-lists-container');
        if (!container) return;

        const lists = Object.entries(this.lists).map(([id, list]) => ({ id, ...list }));

        if (lists.length === 0) {
            container.innerHTML = `
                <div class="wa-lists-empty">
                    <div class="wa-lists-empty-icon">
                        <i data-lucide="users" style="width:36px;height:36px;color:var(--accent);opacity:0.5;"></i>
                    </div>
                    <p>No contact lists yet</p>
                    <span>Create a list to group your contacts for targeted broadcasts.</span>
                    <button class="btn btn-primary" onclick="window.whatsAppSender.createListModal()">
                        <i data-lucide="plus" style="width:14px;height:14px;"></i> Create First List
                    </button>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const colors = ['#25d366', '#f97316', '#a78bfa', '#38bdf8', '#fb7185', '#4ade80'];
        container.innerHTML = `
            <div class="wa-lists-grid">
                ${lists.map((list, i) => {
            const color = colors[i % colors.length];
            const initials = (list.name || '?').substring(0, 2).toUpperCase();
            const count = list.count || 0;
            return `
                    <div class="wa-list-row" onclick="window.whatsAppSender.viewListDetails('${list.id}')">
                        <div class="wa-list-avatar" style="background:${color}22;color:${color};">${initials}</div>
                        <div class="wa-list-info">
                            <div class="wa-list-name">${list.name}</div>
                            <div class="wa-list-sub">${count} contact${count !== 1 ? 's' : ''}</div>
                        </div>
                        <div class="wa-list-badge">${count}</div>
                        <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-dim);flex-shrink:0;"></i>
                    </div>
                `}).join('')}
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    };

    window.whatsAppSender.viewListDetails = function (listId) {
        const list = this.lists[listId];
        if (!list) return;

        const container = document.getElementById('whatsapp-content-lists');

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
                            <div style="font-size:1.05rem;font-weight:700;color:var(--text-main);">${list.name}</div>
                            <div style="font-size:0.78rem;color:var(--text-dim);" id="wa-detail-count">${list.count || 0} contacts</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button class="btn btn-primary" onclick="window.whatsAppSender.addContactModal('${listId}')">
                            <i data-lucide="user-plus" style="width:14px;height:14px;"></i> Add Contact
                        </button>
                        <button class="btn-icon danger" onclick="window.whatsAppSender.deleteList('${listId}')" title="Delete list">
                            <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                        </button>
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

        // Subscribe to members
        const membersRef = firebase.database().ref(`modules/whatsapp_sender/custom_lists/${listId}/members`);
        membersRef.on('value', (snapshot) => {
            const members = snapshot.val() || {};
            this.renderListMembers(listId, members);
        });
    };

    window.whatsAppSender.renderListMembers = function (listId, members) {
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

        const colors = ['#25d366', '#f97316', '#a78bfa', '#38bdf8', '#fb7185', '#4ade80'];
        container.innerHTML = `
            <div class="wa-members-list">
                ${membersList.map((m, i) => {
            const color = colors[i % colors.length];
            const initials = (m.name || m.phone || '?').substring(0, 2).toUpperCase();
            return `
                    <div class="wa-member-row">
                        <div class="wa-list-avatar" style="background:${color}22;color:${color};flex-shrink:0;">${initials}</div>
                        <div class="wa-list-info">
                            <div class="wa-list-name">${m.name || '—'}</div>
                            <div class="wa-list-sub">${m.phone}</div>
                        </div>
                        <button class="btn-icon danger" onclick="window.whatsAppSender.removeMemberFromList('${listId}', '${m.key}')" title="Remove">
                            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                        </button>
                    </div>
                `}).join('')}
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    };

}
