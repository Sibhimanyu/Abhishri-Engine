// Admin Panel Module - Entity Visibility and User Management

window.adminPanel = {
    selectedItems: new Set(),
    allowedUsersData: {},
    usersData: {},

    render() {
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
                console.log('Visibility Updated');
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
        });
    },

    renderWhatsAppConfig() {
        const container = document.getElementById('admin-whatsapp-config-container');
        if (!container) return;

        firebase.database().ref('modules/whatsapp_sender/config').once('value').then(snapshot => {
            const config = snapshot.val() || {};
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
                            <button type="submit" class="btn btn-primary" style="width:100%; padding:12px; border-radius:8px; background:var(--accent-primary); color:white; border:none; font-weight:600; cursor:pointer;">Save Configuration</button>
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
    // Update Sidebar
    document.querySelectorAll('#sidebar-nav-admin .nav-item').forEach(item => item.classList.remove('active'));
    const activeItem = document.getElementById(`nav-item-${viewName}`);
    if (activeItem) activeItem.classList.add('active');

    // Update Views
    document.querySelectorAll('.admin-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`admin-content-${viewName}`).classList.add('active');

    // Update Header
    const titleEl = document.getElementById('admin-page-title');
    const subtitleEl = document.getElementById('admin-page-subtitle');

    if (viewName === 'entities') {
        titleEl.innerText = 'Entity Management';
        subtitleEl.innerText = 'Manage visibility and control';
    } else if (viewName === 'users') {
        titleEl.innerText = 'User Management';
        subtitleEl.innerText = 'Manage allowed users and view login history';
        window.adminPanel.renderUserManagement();
    } else if (viewName === 'whatsapp') {
        titleEl.innerText = 'WhatsApp Configuration';
        subtitleEl.innerText = 'Manage API keys and connection settings';
        window.adminPanel.renderWhatsAppConfig();
    }

    lucide.createIcons();

    if (typeof closeSidebar === 'function') closeSidebar();
};

window.addAllowedUser = () => {
    const input = document.getElementById('whitelist-email-input');
    const email = input.value.trim().toLowerCase();

    if (!email) {
        alert('Please enter an email address');
        return;
    }

    if (!email.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }

    const emailKey = encodeEmail(email);
    const currentUser = auth.currentUser;

    db.ref(`allowedUsers/${emailKey}`).once('value', snap => {
        if (snap.exists()) {
            alert('This email is already in the allowed list');
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
            alert(`${email} has been added to the allowed users list`);
        }).catch(err => {
            console.error(err);
            alert('Failed to add user: ' + err.message);
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
    setCheck('perm-student_directory-manage', perms.student_directory?.manage);

    // WhatsApp Sender
    setCheck('perm-whatsapp_sender-access', perms.whatsapp_sender?.access || (perms.whatsapp_sender === true));
    setCheck('perm-whatsapp_sender-broadcast', perms.whatsapp_sender?.broadcast || (perms.whatsapp_sender === true));
    setCheck('perm-whatsapp_sender-connect', perms.whatsapp_sender?.connect || (perms.whatsapp_sender === true));

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
            manage: getVal('perm-student_directory-manage')
        },
        whatsapp_sender: {
            access: getVal('perm-whatsapp_sender-access'),
            broadcast: getVal('perm-whatsapp_sender-broadcast'),
            connect: getVal('perm-whatsapp_sender-connect')
        }
    };

    db.ref(`allowedUsers/${currentEditingEmailKey}/permissions`).set(updatedPerms)
        .then(() => {
            alert('Permissions updated successfully');
            closePermissionModal();
            window.adminPanel.renderWhitelist();
        })
        .catch(err => {
            console.error(err);
            alert('Failed to save permissions: ' + err.message);
        });
};


window.removeAllowedUser = (emailKey) => {
    const userData = window.adminPanel.allowedUsersData[emailKey];
    if (!userData) return;

    if (confirm(`Remove ${userData.email} from allowed users?`)) {
        db.ref(`allowedUsers/${emailKey}`).remove()
            .then(() => {
                window.adminPanel.renderWhitelist();
                alert(`${userData.email} has been removed from the allowed list`);
            })
            .catch(err => {
                console.error(err);
                alert('Failed to remove user: ' + err.message);
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
        const configRef = firebase.database().ref('modules/whatsapp_sender/config');
        await configRef.set({ apiKey, wabaId, phoneNumberId, phoneNumber, updatedAt: firebase.database.ServerValue.TIMESTAMP });
        alert("Configuration Saved!");
        window.adminPanel.renderWhatsAppConfig();
    } catch (error) {
        console.error("Error saving WhatsApp config:", error);
        alert("Failed to save configuration: " + error.message);
    }
};
