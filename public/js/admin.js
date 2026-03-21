// Admin Panel Module - Entity Visibility and User Management

window.adminPanel = {
    selectedItems: new Set(),
    allowedUsersData: {},
    usersData: {},
    currentAdminView: 'entities',

    render() {
        if (this.currentAdminView !== 'entities') return;
        const container = document.getElementById('admin-list');
        container.innerHTML = '';

        const searchTerm = (document.getElementById('admin-search').value || '').toLowerCase();

        // Flatten all devices
        let allDevices = [];
        Object.keys(window.smartCampus.areas).forEach(areaId => {
            if (areaId === 'no_area' || !window.smartCampus.areas[areaId].devices) return;
            const areaName = formatName(window.smartCampus.areas[areaId].name || areaId);

            Object.keys(window.smartCampus.areas[areaId].devices).forEach(deviceId => {
                const device = window.smartCampus.areas[areaId].devices[deviceId];
                allDevices.push({
                    areaId,
                    areaName,
                    deviceId,
                    ...device
                });
            });
        });

        // Filter
        const filtered = allDevices.filter(d => {
            const text = (d.name + ' ' + d.areaName + ' ' + d.domain).toLowerCase();
            return text.includes(searchTerm);
        });

        filtered.sort((a, b) => a.areaName.localeCompare(b.areaName) || a.name.localeCompare(b.name));

        filtered.forEach(d => {
            const uniqueId = d.areaId + '_' + d.deviceId;
            const isSelected = this.selectedItems.has(uniqueId);
            const isHidden = !!d.hidden;

            const div = document.createElement('div');
            div.className = `admin-item ${isSelected ? 'selected' : ''} ${isHidden ? 'hidden-entity' : ''}`;
            div.onclick = () => this.toggleSelection(uniqueId);

            div.innerHTML = `
        <div class="checkbox">
          ${isSelected ? '<i data-lucide="check" style="width:14px; height:14px; color: #0d1117;"></i>' : ''}
        </div>
        <div class="item-info">
          <div class="item-name">${formatName(d.name)} <span style="font-weight:400; color:var(--text-dim); font-size:0.8em">(${d.domain})</span></div>
          <div class="item-detail">
            <i data-lucide="${getAreaIcon(d.areaName)}" style="width:14px; height:14px;"></i>
            ${d.areaName}
          </div>
          ${isHidden ? '<div style="color:#e86966; font-size:0.75rem; margin-top:4px;">HIDDEN</div>' : ''}
        </div>
      `;
            container.appendChild(div);
        });

        lucide.createIcons();
    },

    toggleSelection(uniqueId) {
        if (this.selectedItems.has(uniqueId)) {
            this.selectedItems.delete(uniqueId);
        } else {
            this.selectedItems.add(uniqueId);
        }
        this.render();
    },

    updateVisibility(hide) {
        if (this.selectedItems.size === 0) return;

        const updates = {};
        this.selectedItems.forEach(uniqueId => {
            Object.keys(window.smartCampus.areas).forEach(areaId => {
                if (window.smartCampus.areas[areaId].devices) {
                    Object.keys(window.smartCampus.areas[areaId].devices).forEach(devKey => {
                        if ((areaId + '_' + devKey) === uniqueId) {
                            updates[`modules/smart_campus/areas/${areaId}/devices/${devKey}/hidden`] = hide ? true : null;
                        }
                    });
                }
            });
        });

        db.ref().update(updates)
            .then(() => {
                // Visibility Updated

                this.selectedItems.clear();
                this.render();
            })
            .catch(err => console.error(err));
    },

    renderUserManagement() {
        this.renderWhitelist();
        this.renderUsersTable();
    },

    renderWhitelist() {
        db.ref('allowedUsers').once('value', snap => {
            this.allowedUsersData = snap.val() || {};
            const container = document.getElementById('whitelist-list');
            container.innerHTML = '';

            Object.keys(this.allowedUsersData).forEach(emailKey => {
                const data = this.allowedUsersData[emailKey];
                const isAdmin = !!data.isAdmin;
                const perms = data.permissions || {};

                const div = document.createElement('div');
                div.className = 'whitelist-item';
                div.style.flexDirection = 'column';
                div.style.alignItems = 'flex-start';

                // Generate permission badges
                const badges = [];
                if (isAdmin) {
                    badges.push('<span class="perm-badge perm-badge-admin">Admin</span>');
                } else {
                    if (perms.smart_campus === true || perms.smart_campus?.view) badges.push('<span class="perm-badge perm-badge-campus">Campus</span>');
                    if (perms.staff_directory === true || perms.staff_directory?.view) badges.push('<span class="perm-badge perm-badge-staff">Staff</span>');
                    if (perms.student_directory === true || perms.student_directory?.view) badges.push('<span class="perm-badge perm-badge-student">Students</span>');
                    if (perms.whatsapp_sender === true || perms.whatsapp_sender?.access) badges.push('<span class="perm-badge perm-badge-whatsapp">WhatsApp</span>');
                    if (badges.length === 0) badges.push('<span class="perm-badge perm-badge-none">No Access</span>');
                }

                div.innerHTML = `
          <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-bottom:8px;">
            <div>
              <div style="font-weight: 600; font-size: 1rem;">${data.email}</div>
              <div style="font-size: 0.85rem; color: var(--text-dim);">
                Added ${new Date(data.addedAt).toLocaleDateString()}
              </div>
            </div>
            ${data.email !== 'sibhi.gv@gmail.com' ? `<button class="btn-remove" onclick="removeAllowedUser('${emailKey}')">Remove</button>` : ''}
          </div>

          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
            ${badges.join('')}
          </div>

          <div style="display:flex; gap:24px; flex-wrap:wrap; width:100%; padding-top:8px; border-top:1px solid var(--card-border);">
            <!-- Admin Toggle -->
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; color:var(--accent-primary);">
              <input type="checkbox" ${isAdmin ? 'checked' : ''} 
                     onchange="toggleAdminStatus('${emailKey}', this.checked)"
                     ${data.email === 'sibhi.gv@gmail.com' ? 'disabled' : ''}>
              Admin Access
            </label>

            <!-- Edit Permissions Button -->
            <div style="opacity:${isAdmin ? '0.5' : '1'}; pointer-events:${isAdmin ? 'none' : 'auto'};">
               <button class="btn btn-secondary" onclick="openPermissionModal('${emailKey}')">
                 <i data-lucide="settings-2" style="width:14px; height:14px;"></i>
                 Edit Permissions
               </button>
            </div>
          </div>
        `;
                container.appendChild(div);
            });

            lucide.createIcons();
        });
    },

    renderUsersTable() {
        firebase.database().ref('users').once('value', snap => {
            this.usersData = snap.val() || {};
            const tbody = document.getElementById('users-table-body');
            if (!tbody) return;
            tbody.innerHTML = '';

            Object.keys(this.usersData).forEach(uid => {
                const user = this.usersData[uid];
                const tr = document.createElement('tr');
                tr.innerHTML = `
          <td>
            <div class="user-info">
              ${user.photoURL ? `<img src="${user.photoURL}" class="user-avatar" alt="${user.displayName}">` : ''}
              <span>${user.displayName || 'Unknown'}</span>
            </div>
          </td>
          <td>${user.email}</td>
          <td>${user.lastSignIn ? new Date(user.lastSignIn).toLocaleString() : 'Never'}</td>
          <td>${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}</td>
        `;
                tbody.appendChild(tr);
            });
        }, err => {
            console.warn("Could not load users table:", err.message);
            const tbody = document.getElementById('users-table-body');
            if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-dim);">Access Restricted</td></tr>';
        });
    },

    renderWhatsAppConfig() {
        const container = document.getElementById('admin-whatsapp-config-container');
        if (!container) return;

        firestore.collection('modules').doc('whatsapp_sender').collection('config').doc('main').get().then(snapshot => {
            const config = snapshot.data() || {};
            const isConnected = !!(config.apiKey && config.wabaId && config.phoneNumberId);

            container.innerHTML = `
                <div class="whatsapp-connect-container" style="max-width: 800px; margin: 0 auto; padding: 20px;">
                    <div style="display: flex; gap: 20px; align-items: stretch; margin-bottom: 20px;">
                        <!-- Status Card -->
                        <div class="card glass-card status-card ${isConnected ? 'connected' : 'disconnected'}" style="flex: 1;">
                            <div class="status-header" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                                <div class="status-badge" style="display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:20px; background:var(--bg-secondary); color:var(${isConnected ? '--success' : '--danger'}); font-weight:600;">
                                    <i data-lucide="${isConnected ? 'check-circle' : 'alert-circle'}" style="width:16px; height:16px;"></i>
                                    <span>${isConnected ? 'Connected' : 'Configuration Required'}</span>
                                </div>
                                <h2 style="margin:0;">Status</h2>
                            </div>
                            <p style="color: var(--text-dim); line-height:1.5; font-size: 0.9rem;">
                                ${isConnected ? 'Fast2SMS API is configured.' : 'Connect your Fast2SMS account to enable messaging.'}
                            </p>
                        </div>

                        <!-- Wallet Card -->
                        <div class="card glass-card" style="flex: 1; display:flex; flex-direction:column; justify-content:center;">
                             <div class="status-header" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                                <div class="status-badge" style="display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:20px; background:rgba(251, 191, 36, 0.1); color: #f59e0b; font-weight:600;">
                                    <i data-lucide="wallet" style="width:16px; height:16px;"></i>
                                    <span>Wallet Balance</span>
                                </div>
                            </div>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);" id="wa-wallet-balance">
                                --
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-dim);">Current Fast2SMS Balance</div>
                        </div>
                    </div>

                    <div class="card glass-card config-card" style="padding:24px;">
                        <h3 style="margin-bottom:20px;">API Settings</h3>
                        <form id="whatsapp-config-form" onsubmit="window.handleSaveWhatsAppConfig(event)">
                            <div class="form-group" style="margin-bottom:16px;">
                                <label style="display:block; margin-bottom:8px; font-weight:500;">Fast2SMS API Key</label>
                                <input type="password" id="wa-api-key" value="${config.apiKey || ''}" class="wa-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--card-border); background:var(--input-bg); color:var(--text-primary);" placeholder="Enter API Key">
                            </div>
                            <div class="form-group" style="margin-bottom:16px;">
                                <label style="display:block; margin-bottom:8px; font-weight:500;">WABA ID (WhatsApp Business Account ID)</label>
                                <input type="text" id="wa-waba-id" value="${config.wabaId || ''}" class="wa-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--card-border); background:var(--input-bg); color:var(--text-primary);" placeholder="Enter WABA ID">
                            </div>
                            <div class="form-group" style="margin-bottom:16px;">
                                <label style="display:block; margin-bottom:8px; font-weight:500;">Phone Number ID</label>
                                <input type="text" id="wa-phone-number-id" value="${config.phoneNumberId || ''}" class="wa-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--card-border); background:var(--input-bg); color:var(--text-primary);" placeholder="Enter Phone Number ID">
                            </div>
                            <div class="form-group" style="margin-bottom:24px;">
                                <label style="display:block; margin-bottom:8px; font-weight:500;">Sender Phone Number (For Display)</label>
                                <input type="text" id="wa-phone-number" value="${config.phoneNumber || ''}" class="wa-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--card-border); background:var(--input-bg); color:var(--text-primary);" placeholder="e.g. +91 99999 99999">
                            </div>
                            
                            <div style="display:flex; gap:12px;">
                                <button type="submit" class="btn btn-primary" style="flex:1; padding:12px; border-radius:8px; background:var(--accent-primary); color:white; border:none; font-weight:600; cursor:pointer;">Save Configuration</button>
                                <button type="button" id="wa-sync-templates-btn" class="btn btn-secondary" onclick="window.handleSyncTemplates(this)" style="padding:12px 20px; border-radius:8px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:8px;">
                                    <i data-lucide="refresh-cw" style="width:16px;height:16px;"></i> Sync Templates
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            lucide.createIcons();

            // Fetch Wallet Balance if connected
            if (config.apiKey) {
                const balanceEl = document.getElementById('wa-wallet-balance');
                if (balanceEl) balanceEl.innerText = "Loading...";

                fetch(`https://www.fast2sms.com/dev/wallet?authorization=${config.apiKey}`)
                    .then(res => res.json())
                    .then(data => {
                        // Fast2SMS returns: { return: true, wallet: 100.50 }
                        if (data.wallet !== undefined) {
                            balanceEl.innerText = `₹${data.wallet}`;
                        } else if (data.message) {
                            balanceEl.innerText = 'Err';
                            console.warn(data.message);
                        } else {
                            balanceEl.innerText = 'N/A';
                        }
                    })
                    .catch(err => {
                        console.error("Balance fetch error:", err);
                        balanceEl.innerText = 'Error';
                    });
            }
        });
    },

    renderScenesConfig() {
        const container = document.getElementById('admin-scenes-list');
        if (!container) return;
        container.innerHTML = '';

        const searchTerm = (document.getElementById('scenes-search').value || '').toLowerCase();
        const scenes = window.smartCampus.scenes;

        const filtered = Object.keys(scenes).filter(id => {
            return (scenes[id].name || '').toLowerCase().includes(searchTerm);
        }).sort((a, b) => (scenes[a].name || '').localeCompare(scenes[b].name || ''));

        if (filtered.length === 0) {
            container.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);"><i data-lucide="zap-off" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5;"></i><p>No scenes found.</p></div>`;
            lucide.createIcons({ root: container });
            return;
        }

        filtered.forEach(id => {
            const scene = scenes[id];
            const div = document.createElement('div');
            div.className = 'admin-item';
            div.style.padding = '16px';
            div.style.cursor = 'default';

            const deviceCount = Object.keys(scene.devices || {}).length;

            div.innerHTML = `
                <div class="item-info" style="flex:1;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i data-lucide="${scene.icon || 'zap'}" style="width:18px; height:18px; color:var(--accent-secondary);"></i>
                        <div class="item-name" style="font-size:1.1rem; font-weight:600;">${scene.name}</div>
                    </div>
                    <div class="item-detail" style="margin-top:4px; font-size:0.85rem; color:var(--text-dim);">
                        ${deviceCount} devices configured in this scene
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="openCreateSceneModal('${id}')">
                        <i data-lucide="edit-3" style="width:14px; height:14px;"></i>
                        Edit
                    </button>
                    <button class="btn btn-remove" style="padding: 6px 12px; font-size: 0.85rem; background: rgba(232, 105, 102, 0.1); color: var(--accent-primary);" onclick="deleteScene('${id}')">
                        <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                        Delete
                    </button>
                </div>
            `;
            container.appendChild(div);
        });

        lucide.createIcons({ root: container });
    }
};

// Global Functions for Admin Panel
window.toggleSelectAll = () => {
    const searchTerm = (document.getElementById('admin-search').value || '').toLowerCase();

    let visibleIds = [];
    Object.keys(window.smartCampus.areas).forEach(areaId => {
        if (areaId === 'no_area' || !window.smartCampus.areas[areaId].devices) return;
        const areaName = formatName(window.smartCampus.areas[areaId].name || areaId);
        Object.keys(window.smartCampus.areas[areaId].devices).forEach(deviceId => {
            const d = window.smartCampus.areas[areaId].devices[deviceId];
            const text = (d.name + ' ' + areaName + ' ' + d.domain).toLowerCase();
            if (text.includes(searchTerm)) {
                visibleIds.push(areaId + '_' + deviceId);
            }
        });
    });

    const allSelected = visibleIds.every(id => window.adminPanel.selectedItems.has(id));

    if (allSelected) {
        visibleIds.forEach(id => window.adminPanel.selectedItems.delete(id));
    } else {
        visibleIds.forEach(id => window.adminPanel.selectedItems.add(id));
    }
    window.adminPanel.render();
};

window.filterAdminList = () => {
    window.adminPanel.render();
};

window.hideSelected = () => {
    window.adminPanel.updateVisibility(true);
};

window.unhideSelected = () => {
    window.adminPanel.updateVisibility(false);
};

window.switchAdminView = (viewName) => {
    window.adminPanel.currentAdminView = viewName;
    // Update Sidebar
    document.querySelectorAll('#sidebar-nav-admin .nav-item').forEach(item => item.classList.remove('active'));
    
    // Support for both nav-item-ID and nav-item-ID-admin to avoid collisions
    let activeItem = document.getElementById(`nav-item-${viewName}`);
    if (!activeItem) activeItem = document.getElementById(`nav-item-${viewName}-admin`);
    if (activeItem) activeItem.classList.add('active');

    // Update Views
    document.querySelectorAll('.admin-content').forEach(content => content.classList.remove('active'));
    const contentEl = document.getElementById(`admin-content-${viewName}`);
    if (contentEl) contentEl.classList.add('active');

    // Update Header
    const titleEl = document.getElementById('admin-page-title');
    const subtitleEl = document.getElementById('admin-page-subtitle');

    if (viewName === 'entities') {
        titleEl.innerText = 'Entity Management';
        subtitleEl.innerText = 'Manage visibility and control';
        window.adminPanel.render();
    } else if (viewName === 'users') {
        titleEl.innerText = 'User Management';
        subtitleEl.innerText = 'Manage allowed users and view login history';
        window.adminPanel.renderUserManagement();
    } else if (viewName === 'whatsapp') {
        titleEl.innerText = 'WhatsApp Configuration';
        subtitleEl.innerText = 'Manage API keys and connection settings';
        window.adminPanel.renderWhatsAppConfig();
    } else if (viewName === 'scenes') {
        titleEl.innerText = 'Scenes Manager';
        subtitleEl.innerText = 'Configure groups of device actions';
        window.adminPanel.renderScenesConfig();
    }

    lucide.createIcons();

    if (typeof closeSidebar === 'function') closeSidebar();
};

window.addAllowedUser = () => {
    const input = document.getElementById('whitelist-email-input');
    const email = input.value.trim().toLowerCase();

    if (!email) {
        AppDialog.toast('Please enter an email address', 'warn');
        return;
    }

    if (!email.includes('@')) {
        AppDialog.toast('Please enter a valid email address', 'warn');
        return;
    }

    const emailKey = encodeEmail(email);
    const currentUser = auth.currentUser;

    db.ref(`allowedUsers/${emailKey}`).once('value', snap => {
        if (snap.exists()) {
            AppDialog.toast('This email is already in the allowed list', 'warn');
            return;
        }

        db.ref(`allowedUsers/${emailKey}`).set({
            email: email,
            isAdmin: false,
            permissions: {
                smart_campus: { view: false, control: false },
                staff_directory: { view: false, add: false, manage: false, delete: false, attendance: false },
                student_directory: { view: false, manage: false },
                whatsapp_sender: { access: false }
            },
            addedAt: Date.now(),
            addedBy: currentUser.email
        }).then(() => {
            input.value = '';
            window.adminPanel.renderWhitelist();
            AppDialog.toast(`${email} has been added to the allowed users list`, 'success');
        }).catch(err => {
            console.error(err);
            AppDialog.toast('Failed to add user: ' + err.message, 'error');
        });
    });
};

window.toggleAdminStatus = (emailKey, isAdmin) => {
    db.ref(`allowedUsers/${emailKey}/isAdmin`).set(isAdmin)
        .then(() => {
            window.adminPanel.renderWhitelist();
        });
};

window.updateModulePermission = (emailKey, module, value) => {
    // Value is boolean from checkbox
    db.ref(`allowedUsers/${emailKey}/permissions/${module}`).set(value);
};

// --- NEW MODAL LOGIC ---
let currentEditingEmailKey = null;

window.openPermissionModal = (emailKey) => {
    currentEditingEmailKey = emailKey;
    const userData = window.adminPanel.allowedUsersData[emailKey];
    if (!userData) return;

    document.getElementById('perm-user-email').innerText = `Permissions: ${userData.email}`;
    const perms = userData.permissions || {};

    // Helper to set checkbox
    const setCheck = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!val;
    };

    // Smart Campus
    setCheck('perm-smart_campus-view', perms.smart_campus?.view || (perms.smart_campus === true));
    setCheck('perm-smart_campus-control', perms.smart_campus?.control || (perms.smart_campus === true));

    // Staff Directory
    setCheck('perm-staff_directory-view', perms.staff_directory?.view || (perms.staff_directory === true));
    setCheck('perm-staff_directory-add', perms.staff_directory?.add);
    setCheck('perm-staff_directory-manage', perms.staff_directory?.manage);
    setCheck('perm-staff_directory-delete', perms.staff_directory?.delete);
    setCheck('perm-staff_directory-attendance', perms.staff_directory?.attendance);

    // Student Directory
    setCheck('perm-student_directory-view', perms.student_directory?.view || (perms.student_directory === true));
    setCheck('perm-student_directory-manage', perms.student_directory?.manage || (perms.student_directory === true));
    setCheck('perm-student_directory-attendance', perms.student_directory?.attendance || (perms.student_directory === true));
    setCheck('perm-student_directory-reports', perms.student_directory?.reports || (perms.student_directory === true));

    // Growth Pulse
    setCheck('perm-student_performance-view', perms.student_performance?.view || (perms.student_performance === true));
    setCheck('perm-student_performance-log', perms.student_performance?.log || (perms.student_performance === true));

    // Fees & Accounting
    setCheck('perm-fees_accounting-view', perms.fees_accounting?.view || (perms.fees_accounting === true));
    setCheck('perm-fees_accounting-ledger', perms.fees_accounting?.ledger || (perms.fees_accounting === true));
    setCheck('perm-fees_accounting-transactions', perms.fees_accounting?.transactions || (perms.fees_accounting === true));
    setCheck('perm-fees_accounting-expenses', perms.fees_accounting?.expenses || (perms.fees_accounting === true));
    setCheck('perm-fees_accounting-config', perms.fees_accounting?.config || (perms.fees_accounting === true));

    // WhatsApp Sender
    setCheck('perm-whatsapp_sender-access', perms.whatsapp_sender?.access || (perms.whatsapp_sender === true));
    setCheck('perm-whatsapp_sender-broadcast', perms.whatsapp_sender?.broadcast || (perms.whatsapp_sender === true));
    setCheck('perm-whatsapp_sender-connect', perms.whatsapp_sender?.connect || (perms.whatsapp_sender === true));
    setCheck('perm-whatsapp_sender-lists', perms.whatsapp_sender?.lists || (perms.whatsapp_sender === true));
    setCheck('perm-whatsapp_sender-history', perms.whatsapp_sender?.history || (perms.whatsapp_sender === true));

    document.getElementById('permission-modal').style.display = 'flex';
    lucide.createIcons();
};

window.closePermissionModal = () => {
    document.getElementById('permission-modal').style.display = 'none';
};

document.getElementById('save-permissions-btn').onclick = () => {
    if (!currentEditingEmailKey) return;

    const getVal = (id) => document.getElementById(id)?.checked || false;

    const updatedPerms = {
        smart_campus: {
            view: getVal('perm-smart_campus-view'),
            control: getVal('perm-smart_campus-control')
        },
        staff_directory: {
            view: getVal('perm-staff_directory-view'),
            add: getVal('perm-staff_directory-add'),
            manage: getVal('perm-staff_directory-manage'),
            delete: getVal('perm-staff_directory-delete'),
            attendance: getVal('perm-staff_directory-attendance')
        },
        student_directory: {
            view: getVal('perm-student_directory-view'),
            manage: getVal('perm-student_directory-manage'),
            attendance: getVal('perm-student_directory-attendance'),
            reports: getVal('perm-student_directory-reports')
        },
        student_performance: {
            view: getVal('perm-student_performance-view'),
            log: getVal('perm-student_performance-log')
        },
        fees_accounting: {
            view: getVal('perm-fees_accounting-view'),
            ledger: getVal('perm-fees_accounting-ledger'),
            transactions: getVal('perm-fees_accounting-transactions'),
            expenses: getVal('perm-fees_accounting-expenses'),
            config: getVal('perm-fees_accounting-config')
        },
        whatsapp_sender: {
            access: getVal('perm-whatsapp_sender-access'),
            broadcast: getVal('perm-whatsapp_sender-broadcast'),
            connect: getVal('perm-whatsapp_sender-connect'),
            lists: getVal('perm-whatsapp_sender-lists'),
            history: getVal('perm-whatsapp_sender-history')
        }
    };

    db.ref(`allowedUsers/${currentEditingEmailKey}/permissions`).set(updatedPerms)
        .then(() => {
            AppDialog.toast('Permissions updated successfully', 'success');
            closePermissionModal();
            window.adminPanel.renderWhitelist();
        })
        .catch(err => {
            console.error(err);
            AppDialog.toast('Failed to save permissions: ' + err.message, 'error');
        });
};


window.removeAllowedUser = async (emailKey) => {
    const userData = window.adminPanel.allowedUsersData[emailKey];
    if (!userData) return;

    const confirmed = await AppDialog.confirm(`Remove ${userData.email} from allowed users?`, { danger: true, confirmText: 'Remove', title: 'Remove User' });
    if (confirmed) {
        db.ref(`allowedUsers/${emailKey}`).remove()
            .then(() => {
                window.adminPanel.renderWhitelist();
                AppDialog.toast(`${userData.email} has been removed from the allowed list`, 'success');
            })
            .catch(err => {
                console.error(err);
                AppDialog.toast('Failed to remove user: ' + err.message, 'error');
            });
    }
};

window.handleSaveWhatsAppConfig = async (e) => {
    e.preventDefault();
    const apiKey = document.getElementById('wa-api-key').value;
    const wabaId = document.getElementById('wa-waba-id').value;
    const phoneNumberId = document.getElementById('wa-phone-number-id').value;
    const phoneNumber = document.getElementById('wa-phone-number').value;

    try {
        await firestore.collection('modules').doc('whatsapp_sender').collection('config').doc('main').set({ 
            apiKey, wabaId, phoneNumberId, phoneNumber, updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        AppDialog.toast('Configuration saved successfully to Firestore', 'success');
        window.adminPanel.renderWhatsAppConfig();
    } catch (error) {
        console.error("Error saving WhatsApp config:", error);
        AppDialog.toast('Failed to save configuration: ' + error.message, 'error');
    }
};

window.handleSyncTemplates = async (btn) => {
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" style="width:16px;height:16px;animation:spin 1s linear infinite;"></i> Syncing...';
    if (window.lucide) window.lucide.createIcons({ root: btn });

    try {
        const result = await window.whatsAppSender.syncTemplatesAPI();
        if (result.success) {
            AppDialog.toast(`Successfully synced ${result.count} templates to Firestore.`, 'success');
        } else {
            AppDialog.toast('Template sync failed: Unexpected response structure.', 'error');
        }
    } catch (error) {
        console.error("Sync Error:", error);
        AppDialog.toast('Failed to sync templates: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        if (window.lucide) window.lucide.createIcons({ root: btn });
    }
};

window.openCreateSceneModal = (sceneId = null) => {
    const isEdit = !!sceneId;
    let scene = isEdit ? window.smartCampus.scenes[sceneId] : { name: '', icon: 'zap', devices: {} };
    
    // Unescape keys if loading for edit
    if (isEdit && scene.devices) {
        const unescapedDevices = {};
        Object.keys(scene.devices).forEach(key => {
            unescapedDevices[key.replace(/:/g, '.')] = scene.devices[key];
        });
        scene = { ...scene, devices: unescapedDevices };
    }

    // Prepare all devices list
    let allDevices = [];
    Object.keys(window.smartCampus.areas).forEach(areaId => {
        if (!window.smartCampus.areas[areaId].devices) return;
        const areaName = formatName(window.smartCampus.areas[areaId].name || areaId);
        Object.keys(window.smartCampus.areas[areaId].devices).forEach(devKey => {
            const dev = window.smartCampus.areas[areaId].devices[devKey];
            if (['fan', 'switch', 'light'].includes(dev.domain)) {
                allDevices.push({
                    entity_id: dev.entity_id,
                    name: dev.name,
                    areaName: areaName,
                    domain: dev.domain
                });
            }
        });
    });
    allDevices.sort((a, b) => a.areaName.localeCompare(b.areaName) || a.name.localeCompare(b.name));

    const html = `
        <div class="form-group" style="margin-bottom:16px;">
            <label>Scene Name</label>
            <input type="text" id="scene-name" class="form-control" value="${scene.name}" placeholder="e.g. Cinema Mode">
        </div>
        <div class="form-group" style="margin-bottom:16px;">
            <label>Icon (Lucide name)</label>
            <input type="text" id="scene-icon" class="form-control" value="${scene.icon || 'zap'}" placeholder="zap, moon, sun, coffee...">
        </div>
        <div class="section-title" style="margin-top:20px; font-size:0.9rem; display:flex; justify-content:space-between; align-items:center;">
            <span>Configure Devices</span>
            <div class="search-box" style="max-width:200px; height:32px; padding:0 8px; background:rgba(255,255,255,0.05);">
                <i data-lucide="search" style="width:14px; height:14px; color:var(--text-dim);"></i>
                <input type="text" id="scene-device-search" placeholder="Filter devices..." style="font-size:0.8rem; background:transparent; border:none; color:white; width:100%;" oninput="window.filterSceneDevices(this.value)">
            </div>
        </div>
        <div id="scene-devices-list" style="max-height: 400px; overflow-y: auto; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 8px;">
            ${allDevices.map(d => {
                const isConfigured = scene.devices && scene.devices[d.entity_id] !== undefined;
                const config = isConfigured ? scene.devices[d.entity_id] : { state: 'off' };
                return `
                    <div class="scene-device-row" data-entity-id="${d.entity_id}" data-search-text="${(d.name + ' ' + d.areaName).toLowerCase()}" style="display:flex; align-items:center; gap:12px; padding:10px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <input type="checkbox" class="scene-device-check" ${isConfigured ? 'checked' : ''} onchange="this.parentElement.querySelector('.scene-device-info').style.opacity = this.checked ? 1 : 0.6; this.parentElement.querySelector('.scene-device-controls').style.display = this.checked ? 'flex' : 'none';">
                        <div class="scene-device-info" style="flex:1; opacity: ${isConfigured ? 1 : 0.6}">
                            <div style="font-weight:500; font-size:0.95rem;">${formatName(d.name)}</div>
                            <div style="font-size:0.75rem; color:var(--text-dim);">${d.areaName}</div>
                        </div>
                        <div class="scene-device-controls" style="display: ${isConfigured ? 'flex' : 'none'}; gap:10px; align-items:center;">
                            <select class="form-control scene-device-state" style="padding:4px 8px; font-size:0.8rem; width:80px;">
                                <option value="on" ${config.state === 'on' ? 'selected' : ''}>ON</option>
                                <option value="off" ${config.state === 'off' ? 'selected' : ''}>OFF</option>
                            </select>
                            ${d.domain === 'fan' ? `
                                <input type="number" class="form-control scene-device-percentage" min="0" max="100" step="16" value="${config.percentage || 100}" style="width:60px; padding:4px 8px; font-size:0.8rem;" title="Percentage">
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    AppDialog.confirm(html, {
        title: isEdit ? 'Edit Scene' : 'Create New Scene',
        confirmText: isEdit ? 'Save Changes' : 'Create Scene',
        width: '600px',
        isHtml: true,
        onOpen: (overlay) => {
            if (window.lucide) window.lucide.createIcons({ root: overlay });
            
            // Define the filter function globally so it can be called from oninput
            window.filterSceneDevices = (query) => {
                const q = query.toLowerCase();
                overlay.querySelectorAll('.scene-device-row').forEach(row => {
                    const text = row.dataset.searchText;
                    row.style.display = text.includes(q) ? 'flex' : 'none';
                });
            };
        },
        onConfirm: async () => {
            const name = document.getElementById('scene-name').value.trim();
            const icon = document.getElementById('scene-icon').value.trim() || 'zap';
            if (!name) {
                AppDialog.toast('Scene name is required', 'warn');
                return false;
            }

            const devices = {};
            document.querySelectorAll('.scene-device-row').forEach(row => {
                const cb = row.querySelector('.scene-device-check');
                if (cb.checked) {
                    const entityId = row.dataset.entityId;
                    const state = row.querySelector('.scene-device-state').value;
                    const config = { state };
                    const percentageInput = row.querySelector('.scene-device-percentage');
                    if (percentageInput) {
                        config.percentage = parseInt(percentageInput.value);
                    }
                    // Escape dots for Firebase keys
                    devices[entityId.replace(/\./g, ':')] = config;
                }
            });

            if (Object.keys(devices).length === 0) {
                AppDialog.toast('Please select at least one device', 'warn');
                return false;
            }

            const data = { name, icon, devices, updatedAt: Date.now() };
            const ref = isEdit ? db.ref(`modules/smart_campus/scenes/${sceneId}`) : db.ref('modules/smart_campus/scenes').push();
            
            await ref.set(data);
            AppDialog.toast(`Scene ${isEdit ? 'updated' : 'created'} successfully`, 'success');
            return true;
        }
    });
};

window.deleteScene = async (sceneId) => {
    const scene = window.smartCampus.scenes[sceneId];
    if (!scene) return;

    const confirmed = await AppDialog.confirm(`Are you sure you want to delete the scene "${scene.name}"?`, {
        danger: true,
        title: 'Delete Scene',
        confirmText: 'Delete'
    });

    if (confirmed) {
        await db.ref(`modules/smart_campus/scenes/${sceneId}`).remove();
        AppDialog.toast('Scene deleted', 'success');
    }
};

window.filterScenesList = () => {
    window.adminPanel.renderScenesConfig();
};
