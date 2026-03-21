// Admin Panel Module - Entity Visibility and User Management (Firestore Edition)

window.adminPanel = {
    selectedItems: new Set(),
    allowedUsersData: {},
    usersData: {},
    currentAdminView: 'entities',

    switchView(view) {
        this.currentAdminView = view;
        
        // Update URL hash only if needed
        let hash = `admin/${view}`;
        if (window.location.hash !== `#${hash}`) {
            window.location.hash = hash;
        }

        // Update Sidebar
        document.querySelectorAll('#sidebar-nav-admin .nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-item-${view}`);
        if (activeNav) activeNav.classList.add('active');

        // Update View Containers
        document.querySelectorAll('.admin-content').forEach(el => {
            el.style.display = 'none';
            el.classList.remove('active');
        });
        const activeView = document.getElementById(`admin-content-${view}`);
        if (activeView) {
            activeView.style.display = 'block';
            activeView.classList.add('active');
        }

        // Update Page Titles
        const titleEl = document.getElementById('admin-page-title');
        const subtitleEl = document.getElementById('admin-page-subtitle');
        if (view === 'entities') {
            titleEl.innerText = 'Entity Management';
            subtitleEl.innerText = 'Manage visibility and control';
            this.render();
        } else if (view === 'users') {
            titleEl.innerText = 'User Management';
            subtitleEl.innerText = 'Manage authorized emails and permissions';
            this.renderUserManagement();
        } else if (view === 'whatsapp') {
            titleEl.innerText = 'WhatsApp Configuration';
            subtitleEl.innerText = 'Manage API keys and settings';
            this.renderWhatsAppConfig();
        } else if (view === 'scenes') {
            titleEl.innerText = 'Scene Management';
            subtitleEl.innerText = 'Configure smart campus automation';
            window.smartCampus.renderAdminScenes();
        }

        if (window.lucide) lucide.createIcons();
    },

    render() {
        if (this.currentAdminView !== 'entities') return;
        const container = document.getElementById('admin-list');
        if (!container) return;
        container.innerHTML = '';

        const searchTerm = (document.getElementById('admin-search')?.value || '').toLowerCase();

        let allDevices = [];
        Object.keys(window.smartCampus.areas).forEach(areaId => {
            if (areaId === 'no_area' || !window.smartCampus.areas[areaId].devices) return;
            const areaName = formatName(window.smartCampus.areas[areaId].name || areaId);

            Object.keys(window.smartCampus.areas[areaId].devices).forEach(deviceId => {
                const device = window.smartCampus.areas[areaId].devices[deviceId];
                allDevices.push({ areaId, areaName, deviceId, ...device });
            });
        });

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
                <div class="checkbox">${isSelected ? '<i data-lucide="check" style="width:14px; height:14px; color: #0d1117;"></i>' : ''}</div>
                <div class="item-info">
                    <div class="item-name">${formatName(d.name)} <span style="font-weight:400; color:var(--text-dim); font-size:0.8em">(${d.domain})</span></div>
                    <div class="item-detail"><i data-lucide="${getAreaIcon(d.areaName)}" style="width:14px; height:14px;"></i> ${d.areaName}</div>
                    ${isHidden ? '<div style="color:#e86966; font-size:0.75rem; margin-top:4px;">HIDDEN</div>' : ''}
                </div>`;
            container.appendChild(div);
        });
        lucide.createIcons();
    },

    toggleSelection(uniqueId) {
        if (this.selectedItems.has(uniqueId)) this.selectedItems.delete(uniqueId);
        else this.selectedItems.add(uniqueId);
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

        db.ref().update(updates).then(() => {
            this.selectedItems.clear();
            this.render();
        }).catch(err => console.error(err));
    },

    renderUserManagement() {
        this.renderWhitelist();
        this.renderUsersTable();
    },

    renderWhitelist() {
        firestore.collection('allowedUsers').onSnapshot(snap => {
            const container = document.getElementById('whitelist-list');
            if (!container) return;
            container.innerHTML = '';
            this.allowedUsersData = {};

            snap.forEach(doc => {
                const data = doc.data();
                const email = doc.id;
                this.allowedUsersData[email] = data;
                const isAdmin = !!data.isAdmin;
                const perms = data.permissions || {};

                const div = document.createElement('div');
                div.className = 'whitelist-item';
                div.style.flexDirection = 'column';
                div.style.alignItems = 'flex-start';

                const badges = [];
                if (isAdmin) badges.push('<span class="perm-badge perm-badge-admin">Admin</span>');
                else {
                    if (perms.smart_campus?.view || perms.smart_campus === true) badges.push('<span class="perm-badge perm-badge-campus">Campus View</span>');
                    if (perms.smart_campus?.control) badges.push('<span class="perm-badge perm-badge-campus">Campus Ctrl</span>');
                    
                    if (perms.student_directory?.view || perms.student_directory === true) badges.push('<span class="perm-badge perm-badge-student">Student View</span>');
                    if (perms.student_directory?.manage) badges.push('<span class="perm-badge perm-badge-student">Student Ctrl</span>');
                    if (perms.student_directory?.attendance) badges.push('<span class="perm-badge perm-badge-student">Student Attd</span>');
                    if (perms.student_performance?.view) badges.push('<span class="perm-badge perm-badge-student">Student Perf</span>');
                    
                    if (perms.staff_directory?.view || perms.staff_directory === true) badges.push('<span class="perm-badge perm-badge-staff">Staff View</span>');
                    if (perms.staff_directory?.manage) badges.push('<span class="perm-badge perm-badge-staff">Staff Ctrl</span>');
                    if (perms.staff_directory?.attendance) badges.push('<span class="perm-badge perm-badge-staff">Staff Attd</span>');
                    if (perms.staff_directory?.pulse) badges.push('<span class="perm-badge perm-badge-staff">Staff Perf</span>');
                    
                    if (perms.fees_accounting?.view || perms.fees_accounting === true) badges.push('<span class="perm-badge perm-badge-fees">Fee View</span>');
                    if (perms.fees_accounting?.ledger) badges.push('<span class="perm-badge perm-badge-fees">Fee Ledger</span>');
                    if (perms.fees_accounting?.transactions) badges.push('<span class="perm-badge perm-badge-fees">Fee Trans</span>');
                    if (perms.fees_accounting?.config) badges.push('<span class="perm-badge perm-badge-fees">Fee Config</span>');
                    if (perms.fees_accounting?.expenses) badges.push('<span class="perm-badge perm-badge-fees">Fee Exp</span>');
                    
                    if (perms.whatsapp_sender?.access || perms.whatsapp_sender === true) badges.push('<span class="perm-badge perm-badge-whatsapp">WA Access</span>');
                    if (perms.whatsapp_sender?.broadcast) badges.push('<span class="perm-badge perm-badge-whatsapp">WA Broadcast</span>');
                    
                    if (badges.length === 0) badges.push('<span class="perm-badge perm-badge-none">No Access</span>');
                }

                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-bottom:8px;">
                        <div>
                            <div style="font-weight: 600; font-size: 1rem;">${email}</div>
                            <div style="font-size: 0.85rem; color: var(--text-dim);">Added ${data.addedAt?.toDate ? data.addedAt.toDate().toLocaleDateString() : 'N/A'}</div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="btn-icon" onclick="window.adminPanel.showEditUserModal('${email}')"><i data-lucide="edit-3"></i></button>
                            ${email !== 'sibhi.gv@gmail.com' ? `<button class="btn-icon text-danger" onclick="window.adminPanel.removeAllowedUser('${email}')"><i data-lucide="trash-2"></i></button>` : ''}
                        </div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">${badges.join('')}</div>`;
                container.appendChild(div);
            });
            lucide.createIcons();
        });
    },

    renderUsersTable() {
        db.ref('users').once('value', snap => {
            const container = document.getElementById('users-table-body');
            if (!container) return;
            container.innerHTML = '';
            this.usersData = snap.val() || {};

            Object.keys(this.usersData).forEach(uid => {
                const u = this.usersData[uid];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            ${u.photoURL ? `<img src="${u.photoURL}" style="width:24px;height:24px;border-radius:50%">` : `<div style="width:24px;height:24px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:white;">${(u.email ? u.email[0].toUpperCase() : 'U')}</div>`} 
                            <strong>${u.displayName || 'Unknown'}</strong>
                        </div>
                    </td>
                    <td>${u.email}</td>
                    <td>${u.lastSignIn ? new Date(u.lastSignIn).toLocaleString() : 'N/A'}</td>
                    <td>—</td>
                `;
                container.appendChild(tr);
            });
        });
    },

    async renderWhatsAppConfig() {
        const container = document.getElementById('admin-whatsapp-config-container');
        if (!container) return;

        const configSnap = await firestore.collection('modules').doc('whatsapp_sender').collection('config').doc('main').get();
        const config = configSnap.data() || {};
        const isConnected = !!(config.apiKey && config.wabaId);

        container.innerHTML = `
            <div class="whatsapp-connect-container" style="max-width: 800px; margin: 0 auto; padding: 20px;">
                <div style="display: flex; gap: 20px; align-items: stretch; margin-bottom: 20px; flex-wrap: wrap;">
                    <div class="card glass-card status-card" style="flex: 1; min-width: 300px; padding: 20px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 16px;">
                        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                            <div style="display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:20px; background: rgba(255,255,255,0.05); color:${isConnected ? 'var(--success)' : 'var(--accent-primary)'}; font-weight:600; font-size: 0.8rem;">
                                <i data-lucide="${isConnected ? 'check-circle' : 'alert-circle'}" style="width:14px; height:14px;"></i>
                                <span>${isConnected ? 'Connected' : 'Setup Required'}</span>
                            </div>
                            <h2 style="margin:0; font-size: 1.2rem;">API Status</h2>
                        </div>
                        <p style="color: var(--text-dim); line-height:1.5; font-size: 0.85rem;">
                            ${isConnected ? 'WhatsApp Business API via Fast2SMS is active.' : 'Configure your Fast2SMS credentials to enable bulk messaging.'}
                        </p>
                        ${isConnected ? `
                            <button class="btn btn-secondary btn-sm" style="margin-top:15px; width:100%;" id="sync-wa-templates-btn" onclick="window.adminPanel.handleSyncTemplates(this)">
                                <i data-lucide="refresh-cw"></i> Sync Message Templates
                            </button>
                        ` : ''}
                    </div>

                    <div class="card glass-card" style="flex: 1; min-width: 250px; display:flex; flex-direction:column; justify-content:center; padding: 20px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 16px;">
                        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                            <div style="display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:20px; background:rgba(251, 191, 36, 0.1); color: #f59e0b; font-weight:600; font-size: 0.8rem;">
                                <i data-lucide="wallet" style="width:14px; height:14px;"></i>
                                <span>Wallet Balance</span>
                            </div>
                        </div>
                        <div style="font-size: 2rem; font-weight: 800; color: var(--text-main);" id="wa-wallet-balance">--</div>
                        <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">Fast2SMS Credits</div>
                    </div>
                </div>

                <div class="card glass-card" style="padding:32px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 20px;">
                    <h3 style="margin-bottom:24px; font-size: 1.1rem; border-bottom: 1px solid var(--card-border); padding-bottom: 16px;">API Credentials</h3>
                    <form id="whatsapp-config-form" onsubmit="window.adminPanel.handleSaveWhatsAppConfig(event)">
                        <div class="form-group" style="margin-bottom:20px;">
                            <label>Fast2SMS API Key</label>
                            <input type="password" id="wa-api-key" value="${config.apiKey || ''}" class="form-control" placeholder="Enter API Key">
                        </div>
                        <div class="form-group" style="margin-bottom:20px;">
                            <label>WABA ID (WhatsApp Business Account)</label>
                            <input type="text" id="wa-waba-id" value="${config.wabaId || ''}" class="form-control" placeholder="Enter WABA ID">
                        </div>
                        <div class="form-group" style="margin-bottom:20px;">
                            <label>Phone Number ID</label>
                            <input type="text" id="wa-phone-number-id" value="${config.phoneNumberId || ''}" class="form-control" placeholder="Enter Phone Number ID">
                        </div>
                        <div class="form-group" style="margin-bottom:32px;">
                            <label>Display Phone Number</label>
                            <input type="text" id="wa-phone-number" value="${config.phoneNumber || ''}" class="form-control" placeholder="+91 99999 99999">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%; height: 48px; font-weight: 700;">Save Credentials</button>
                    </form>
                </div>
            </div>
        `;
        if (window.lucide) lucide.createIcons({ root: container });

        if (config.apiKey) {
            const balEl = document.getElementById('wa-wallet-balance');
            if (balEl) balEl.innerText = 'Syncing...';
            try {
                const checkWallet = firebase.functions().httpsCallable('checkWhatsAppWallet');
                const result = await checkWallet();
                if (result.data?.wallet !== undefined) balEl.innerText = `₹${result.data.wallet.toLocaleString()}`;
                else balEl.innerText = 'N/A';
            } catch (err) {
                console.warn("Wallet Sync Error:", err);
                balEl.innerText = 'Error';
            }
        }
    },

    async handleSaveWhatsAppConfig(e) {
        e.preventDefault();
        const apiKey = document.getElementById('wa-api-key').value;
        const wabaId = document.getElementById('wa-waba-id').value;
        const phoneNumberId = document.getElementById('wa-phone-number-id').value;
        const phoneNumber = document.getElementById('wa-phone-number').value;

        try {
            await firestore.collection('modules').doc('whatsapp_sender').collection('config').doc('main').set({ 
                apiKey, wabaId, phoneNumberId, phoneNumber, updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
            });
            AppDialog.toast('Configuration saved successfully', 'success');
            this.renderWhatsAppConfig();
        } catch (error) {
            console.error("Error saving WhatsApp config:", error);
            AppDialog.toast('Failed to save: ' + error.message, 'error');
        }
    },

    async handleSyncTemplates(btn) {
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Syncing...';
        if (window.lucide) lucide.createIcons({ root: btn });

        try {
            const syncTemplates = firebase.functions().httpsCallable('syncWhatsAppTemplates');
            const result = await syncTemplates();
            AppDialog.toast(`Successfully synced ${result.data.count} templates`, 'success');
        } catch (err) {
            console.error("Sync Error:", err);
            AppDialog.toast('Failed to sync templates: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            if (window.lucide) lucide.createIcons({ root: btn });
        }
    },

    showAddUserModal() {
        AppDialog.confirm({
            title: 'Authorize New User',
            content: `<div class="form-group"><label>Email Address</label><input type="email" id="new-user-email" class="form-control" placeholder="user@abhishriacademy.in"></div>
                      <div class="form-group" style="margin-top:15px;"><label><input type="checkbox" id="new-user-admin"> Global Administrator</label></div>`,
            onConfirm: async () => {
                const email = document.getElementById('new-user-email').value.toLowerCase().trim();
                if (!email) return false;
                await firestore.collection('allowedUsers').doc(email).set({
                    email, isAdmin: document.getElementById('new-user-admin').checked,
                    permissions: { smart_campus: { view: true }, staff_directory: { view: true }, student_directory: { view: true }, fees_accounting: { view: true } },
                    addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    addedBy: auth.currentUser.email
                });
                return true;
            }
        });
    },

    showEditUserModal(email) {
        const user = this.allowedUsersData[email];
        const p = user.permissions || {};
        
        // Define safe access helpers
        const getPerm = (module, action) => p[module] === true || (p[module] && p[module][action]) ? 'checked' : '';

        AppDialog.confirm({
            title: `Granular Access: ${email}`,
            width: '800px',
            content: `
                <div class="form-group" style="padding-bottom:15px; border-bottom:1px solid var(--card-border); margin-bottom:20px;">
                    <label style="display:flex; align-items:center; gap:10px; font-size:1.1rem; color:var(--accent-primary);">
                        <input type="checkbox" id="edit-admin" ${user.isAdmin ? 'checked' : ''} style="width:20px; height:20px;"> 
                        <strong>Global Administrator (Unrestricted Access)</strong>
                    </label>
                </div>
                
                <div id="granular-permissions-container" style="display:${user.isAdmin ? 'none' : 'block'}; max-height: 50vh; overflow-y: auto; padding-right:15px;">
                    <!-- Smart Campus -->
                    <div class="form-section-title" style="margin-top:0;"><i data-lucide="home"></i> Smart Campus</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px; background:rgba(255,255,255,0.02); padding:15px; border-radius:12px;">
                        <label><input type="checkbox" class="perm-check" data-mod="smart_campus" data-act="view" ${getPerm('smart_campus', 'view')}> View Dashboard & Telemetry</label>
                        <label><input type="checkbox" class="perm-check" data-mod="smart_campus" data-act="control" ${getPerm('smart_campus', 'control')}> Control Devices & Scenes</label>
                    </div>

                    <!-- Student Directory -->
                    <div class="form-section-title"><i data-lucide="users"></i> Student Directory</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px; background:rgba(255,255,255,0.02); padding:15px; border-radius:12px;">
                        <label><input type="checkbox" class="perm-check" data-mod="student_directory" data-act="view" ${getPerm('student_directory', 'view')}> View Student Profiles</label>
                        <label><input type="checkbox" class="perm-check" data-mod="student_directory" data-act="manage" ${getPerm('student_directory', 'manage')}> Manage Admissions (Add/Edit/Delete)</label>
                        <label><input type="checkbox" class="perm-check" data-mod="student_directory" data-act="attendance" ${getPerm('student_directory', 'attendance')}> Mark Daily Attendance</label>
                        <label><input type="checkbox" class="perm-check" data-mod="student_directory" data-act="reports" ${getPerm('student_directory', 'reports')}> View Attendance Reports</label>
                        <label><input type="checkbox" class="perm-check" data-mod="student_performance" data-act="view" ${getPerm('student_performance', 'view')}> Access Performance Pulse</label>
                    </div>

                    <!-- Staff Directory -->
                    <div class="form-section-title"><i data-lucide="contact"></i> Staff Directory</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px; background:rgba(255,255,255,0.02); padding:15px; border-radius:12px;">
                        <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="view" ${getPerm('staff_directory', 'view')}> View Staff Profiles</label>
                        <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="manage" ${getPerm('staff_directory', 'manage')}> Manage Staff (Add/Edit/Delete)</label>
                        <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="attendance" ${getPerm('staff_directory', 'attendance')}> Mark Daily Attendance</label>
                        <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="reports" ${getPerm('staff_directory', 'reports')}> View Attendance Reports</label>
                        <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="pulse" ${getPerm('staff_directory', 'pulse')}> Access Performance Pulse</label>
                    </div>

                    <!-- Fees & Accounting -->
                    <div class="form-section-title"><i data-lucide="wallet"></i> Fees & Accounting</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px; background:rgba(255,255,255,0.02); padding:15px; border-radius:12px;">
                        <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="view" ${getPerm('fees_accounting', 'view')}> View Revenue Dashboard</label>
                        <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="ledger" ${getPerm('fees_accounting', 'ledger')}> View Student Ledgers</label>
                        <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="transactions" ${getPerm('fees_accounting', 'transactions')}> Log & Reverse Payments</label>
                        <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="config" ${getPerm('fees_accounting', 'config')}> Configure Fee Templates & Waivers</label>
                        <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="expenses" ${getPerm('fees_accounting', 'expenses')}> Manage Operational Expenses</label>
                    </div>

                    <!-- WhatsApp Sender -->
                    <div class="form-section-title"><i data-lucide="send"></i> WhatsApp API</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px; background:rgba(255,255,255,0.02); padding:15px; border-radius:12px;">
                        <label><input type="checkbox" class="perm-check" data-mod="whatsapp_sender" data-act="access" ${getPerm('whatsapp_sender', 'access')}> Access Module (View Chats/Lists)</label>
                        <label><input type="checkbox" class="perm-check" data-mod="whatsapp_sender" data-act="broadcast" ${getPerm('whatsapp_sender', 'broadcast')}> Execute Mass Broadcasts</label>
                        <label><input type="checkbox" class="perm-check" data-mod="whatsapp_sender" data-act="manage" ${getPerm('whatsapp_sender', 'manage')}> Manage Contact Lists & History</label>
                    </div>
                </div>`,
            onOpen: (overlay) => {
                if (window.lucide) window.lucide.createIcons({ root: overlay });
                const adminToggle = document.getElementById('edit-admin');
                const permContainer = document.getElementById('granular-permissions-container');
                adminToggle.addEventListener('change', (e) => {
                    permContainer.style.display = e.target.checked ? 'none' : 'block';
                });
            },
            onConfirm: async () => {
                const isAdmin = document.getElementById('edit-admin').checked;
                const permissions = {};
                
                if (!isAdmin) {
                    document.querySelectorAll('.perm-check').forEach(el => {
                        const mod = el.getAttribute('data-mod');
                        const act = el.getAttribute('data-act');
                        if (!permissions[mod]) permissions[mod] = {};
                        permissions[mod][act] = el.checked;
                    });
                }

                await firestore.collection('allowedUsers').doc(email).update({
                    isAdmin,
                    permissions
                });
                AppDialog.toast(`Permissions updated for ${email}`, 'success');
                return true;
            }
        });
    },

    removeAllowedUser(email) {
        AppDialog.confirm({ title: 'Remove User', msg: `Revoke all access for ${email}?`, danger: true, onConfirm: async () => {
            await firestore.collection('allowedUsers').doc(email).delete();
            return true;
        }});
    }
};

window.filterScenesList = () => {
    const q = (document.getElementById('scenes-search')?.value || '').toLowerCase();
    const rows = document.querySelectorAll('#admin-scenes-list tr');
    rows.forEach(row => {
        const name = row.querySelector('td')?.innerText.toLowerCase() || '';
        if (row.parentElement.tagName === 'TBODY') {
            row.style.display = name.includes(q) ? 'table-row' : 'none';
        }
    });
};

function switchAdminView(view) {
    window.adminPanel.switchView(view);
}

function addAllowedUser() {
    window.adminPanel.showAddUserModal();
}




window.openCreateSceneModal = (sceneId = null) => {
    const isEdit = !!sceneId;
    let scene = isEdit ? window.smartCampus.scenes[sceneId] : { name: '', icon: 'zap', devices: {} };
    
    if (isEdit && scene.devices) {
        const unescapedDevices = {};
        Object.keys(scene.devices).forEach(key => {
            unescapedDevices[key.replace(/:/g, '.')] = scene.devices[key];
        });
        scene = { ...scene, devices: unescapedDevices };
    }

    let allDevices = [];
    Object.keys(window.smartCampus.areas).forEach(areaId => {
        if (areaId === 'no_area' || !window.smartCampus.areas[areaId].devices) return;
        const areaName = formatName(window.smartCampus.areas[areaId].name || areaId);
        Object.keys(window.smartCampus.areas[areaId].devices).forEach(deviceId => {
            const device = window.smartCampus.areas[areaId].devices[deviceId];
            if (device.domain === 'sensor' || device.domain === 'binary_sensor') return;
            allDevices.push({ areaId, areaName, deviceId, ...device });
        });
    });

    const content = `
        <div class="form-group">
            <label>Scene Name</label>
            <input type="text" id="scene-name" class="form-control" value="${scene.name}" placeholder="e.g. Morning Routine">
        </div>
        <div class="form-group" style="margin-top:15px;">
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
                            <div style="font-size:0.75rem; color:var(--text-dim);">${d.areaName} (${d.domain})</div>
                        </div>
                        <div class="scene-device-controls" style="display: ${isConfigured ? 'flex' : 'none'}; gap:10px; align-items:center;">
                            <select class="form-control scene-device-state" style="height:30px; font-size:0.8rem; padding:0 8px; width:80px;">
                                <option value="on" ${config.state === 'on' ? 'selected' : ''}>ON</option>
                                <option value="off" ${config.state === 'off' ? 'selected' : ''}>OFF</option>
                            </select>
                            ${d.domain === 'fan' ? `<input type="number" class="form-control scene-device-pct" value="${config.percentage || 100}" min="0" max="100" style="width:60px; height:30px; font-size:0.8rem; padding:0 8px;">` : ''}
                        </div>
                    </div>`;
            }).join('')}
        </div>
    `;

    AppDialog.confirm({
        title: isEdit ? 'Edit Scene' : 'Create New Scene',
        content: content,
        confirmText: isEdit ? 'Save Changes' : 'Create Scene',
        width: '600px',
        isHtml: true,
        onOpen: (overlay) => {
            if (window.lucide) window.lucide.createIcons({ root: overlay });
            window.filterSceneDevices = (query) => {
                const q = query.toLowerCase();
                overlay.querySelectorAll('.scene-device-row').forEach(row => {
                    row.style.display = row.dataset.searchText.includes(q) ? 'flex' : 'none';
                });
            };
        },
        onConfirm: async () => {
            const name = document.getElementById('scene-name').value.trim();
            const icon = document.getElementById('scene-icon').value.trim() || 'zap';
            if (!name) { AppDialog.toast('Scene name is required', 'error'); return false; }

            const devices = {};
            document.querySelectorAll('.scene-device-row').forEach(row => {
                if (row.querySelector('.scene-device-check').checked) {
                    const entityId = row.dataset.entityId;
                    const config = { state: row.querySelector('.scene-device-state').value };
                    const pctInput = row.querySelector('.scene-device-pct');
                    if (pctInput) config.percentage = parseInt(pctInput.value);
                    devices[entityId.replace(/\./g, ':')] = config;
                }
            });

            const sceneData = { name, icon, devices };
            if (isEdit) {
                await db.ref('modules/smart_campus/scenes').child(sceneId).update(sceneData);
            } else {
                await db.ref('modules/smart_campus/scenes').push(sceneData);
            }
            return true;
        }
    });
};


