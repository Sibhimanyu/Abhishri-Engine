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
            titleEl.innerText = 'User Permissions';
            subtitleEl.innerText = 'Assign permission groups to control what each person sees when they log in';
            window.adminPanel.renderUsersWithCleanup();
            if (window.staffDirectory) window.staffDirectory.renderUsers();
        } else if (view === 'attendance') {
            titleEl.innerText = 'Attendance Setup';
            subtitleEl.innerText = 'Configure school location and self check-in settings';
            this.renderAttendanceConfig();
        } else if (view === 'whatsapp') {
            titleEl.innerText = 'WhatsApp Configuration';
            subtitleEl.innerText = 'Manage API keys and settings';
            this.renderWhatsAppConfig();
        } else if (view === 'scenes') {
            titleEl.innerText = 'Scene Management';
            subtitleEl.innerText = 'Configure smart campus automation';
            window.smartCampus.renderAdminScenes();
        } else if (view === 'audit_logs') {
            titleEl.innerText = 'System Activity Log';
            subtitleEl.innerText = 'Detailed activity and access logs';
            if (window.feesManager) window.feesManager.renderAuditLogs();
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
        const deviceNames = [];
        this.selectedItems.forEach(uniqueId => {
            Object.keys(window.smartCampus.areas).forEach(areaId => {
                if (window.smartCampus.areas[areaId].devices) {
                    Object.keys(window.smartCampus.areas[areaId].devices).forEach(devKey => {
                        if ((areaId + '_' + devKey) === uniqueId) {
                            updates[`modules/smart_campus/areas/${areaId}/devices/${devKey}/hidden`] = hide ? true : null;
                            deviceNames.push(window.smartCampus.areas[areaId].devices[devKey].name || devKey);
                        }
                    });
                }
            });
        });

        db.ref().update(updates).then(() => {
            window.AppLogger.log(hide ? 'HIDE_ENTITIES' : 'SHOW_ENTITIES', 'admin_panel', { devices: deviceNames });
            this.selectedItems.clear();
            this.render();
        }).catch(err => console.error(err));
    },

    async renderAttendanceConfig() {
        const container = document.getElementById('admin-attendance-config-container');
        if (!container) return;

        let config = {};
        try {
            const snap = await firestore.collection('modules').doc('staff_directory').collection('config').doc('attendance').get();
            config = snap.exists ? snap.data() : {};
        } catch (err) {
            console.warn('Could not load attendance config:', err);
        }

        container.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto; padding: 20px;">
                <div class="card glass-card" style="padding:32px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 20px;">
                    <div class="form-section-title" style="margin-top:0;"><i data-lucide="map-pin"></i> School Attendance Setup</div>
                    <p style="color:var(--text-dim); margin-bottom:24px;">Teachers can check in only when they are within the configured school location radius.</p>

                    <form id="attendance-config-form" onsubmit="window.adminPanel.handleSaveAttendanceConfig(event)">
                        <div class="form-grid-2">
                            <div class="form-group">
                                <label>School Latitude</label>
                                <input type="number" step="any" id="att-school-lat" class="form-control" value="${config.schoolLatitude || ''}" placeholder="18.5204">
                            </div>
                            <div class="form-group">
                                <label>School Longitude</label>
                                <input type="number" step="any" id="att-school-lng" class="form-control" value="${config.schoolLongitude || ''}" placeholder="73.8567">
                            </div>
                        </div>
                        <div class="form-grid-2">
                            <div class="form-group">
                                <label>Late After</label>
                                <input type="time" id="att-late" class="form-control" value="${config.lateAfter || ''}">
                            </div>
                            <div class="form-group">
                                <label>Timezone</label>
                                <input type="text" id="att-timezone" class="form-control" value="${config.timezone || 'Asia/Kolkata'}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Optional Reference Radius (meters)</label>
                            <input type="number" id="att-radius" class="form-control" value="${config.allowedRadiusMeters || 100}">
                        </div>
                        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:24px;">
                            <button type="button" class="btn btn-secondary" onclick="window.adminPanel.fillAttendanceLocationFromThisDevice()"><i data-lucide="crosshair"></i> Use This Device Location</button>
                            <button type="submit" class="btn btn-primary"><i data-lucide="save"></i> Save Settings</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        if (window.lucide) lucide.createIcons({ root: container });
    },

    async handleSaveAttendanceConfig(e) {
        e.preventDefault();
        const payload = {
            schoolLatitude: parseFloat(document.getElementById('att-school-lat').value),
            schoolLongitude: parseFloat(document.getElementById('att-school-lng').value),
            allowedRadiusMeters: parseFloat(document.getElementById('att-radius').value) || 100,
            lateAfter: document.getElementById('att-late').value || null,
            timezone: document.getElementById('att-timezone').value || 'Asia/Kolkata'
        };

        if (!Number.isFinite(payload.schoolLatitude) || !Number.isFinite(payload.schoolLongitude)) {
            AppDialog.toast('School coordinates are required', 'error');
            return;
        }

        try {
            const callable = firebase.functions().httpsCallable('updateStaffAttendanceConfig');
            await callable(payload);
            AppDialog.toast('Attendance settings saved', 'success');
        } catch (err) {
            AppDialog.toast('Failed to save: ' + err.message, 'error');
        }
    },

    async fillAttendanceLocationFromThisDevice() {
        if (!navigator.geolocation) {
            AppDialog.toast('Location is not available on this device', 'error');
            return;
        }
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = document.getElementById('att-school-lat');
            const lng = document.getElementById('att-school-lng');
            if (lat) lat.value = pos.coords.latitude.toFixed(7);
            if (lng) lng.value = pos.coords.longitude.toFixed(7);
            AppDialog.toast('Filled from current location', 'success');
        }, err => {
            AppDialog.toast(err.message || 'Could not get location', 'error');
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    },


    async renderUsersWithCleanup() {
        // Check for stale student entries (from the old provisioning system)
        // and show a one-time cleanup banner if any are found.
        try {
            const stale = await firestore.collection('allowedUsers').where('role', '==', 'student').limit(1).get();
            if (!stale.empty) {
                const banner = document.getElementById('stale-student-banner');
                if (!banner) {
                    const usersPanel = document.getElementById('admin-content-users');
                    if (usersPanel) {
                        const div = document.createElement('div');
                        div.id = 'stale-student-banner';
                        div.style.cssText = 'background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.3);border-radius:14px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:14px;';
                        div.innerHTML = `
                            <i data-lucide="alert-triangle" style="width:20px;height:20px;color:#fbbf24;flex-shrink:0;"></i>
                            <div style="flex:1;">
                                <div style="font-weight:700;font-size:0.9rem;color:#fbbf24;">Old student login records found in allowedUsers</div>
                                <div style="font-size:0.78rem;color:var(--text-dim);margin-top:2px;">Students now log in directly — these entries are no longer needed and can be safely removed.</div>
                            </div>
                            <button class="btn btn-secondary btn-sm" onclick="window.adminPanel.cleanupStudentAccounts(this)">
                                <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Remove Them
                            </button>`;
                        usersPanel.insertBefore(div, usersPanel.firstChild);
                        if (window.lucide) lucide.createIcons({ root: div });
                    }
                }
            }
        } catch (e) { /* ignore — non-critical */ }
    },

    async cleanupStudentAccounts(btn) {
        if (btn) btn.disabled = true;
        AppDialog.confirm({
            title: 'Remove Student Accounts',
            msg: 'This will delete all student and parent entries from allowedUsers. They will still be able to log in — their access now comes directly from the student directory. This cannot be undone.',
            danger: true,
            confirmLabel: 'Remove All',
            onConfirm: async () => {
                let removed = 0;
                let hasMore = true;
                while (hasMore) {
                    const batch = firestore.batch();
                    const snap = await firestore.collection('allowedUsers').where('role', '==', 'student').limit(400).get();
                    if (snap.empty) { hasMore = false; break; }
                    snap.forEach(doc => { batch.delete(doc.ref); removed++; });
                    await batch.commit();
                }
                document.getElementById('stale-student-banner')?.remove();
                AppDialog.toast(`Removed ${removed} student account${removed !== 1 ? 's' : ''} from allowedUsers`, 'success');
                if (window.staffDirectory) { window.staffDirectory._usersRendered = false; window.staffDirectory.renderUsers(); }
                return true;
            }
        });
    },

    quickAuthorize(email) {
        AppDialog.confirm({
            title: 'Authorize User',
            content: `<p>Authorize <strong>${email}</strong> and set up their permissions?</p>`,
            onConfirm: async () => {
                await firestore.collection('allowedUsers').doc(email.toLowerCase()).set({
                    email: email.toLowerCase(),
                    isAdmin: false,
                    role: 'staff',
                    permissions: {
                        smart_campus: { view: true },
                        staff_directory: { view: true },
                        student_directory: { view: true },
                        fees_accounting: { view: true, ledger: true, transactions: true },
                        whatsapp_sender: { access: true }
                    },
                    addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    addedBy: auth.currentUser.email
                });
                // Remove from pendingUsers now that they're authorised
                firestore.collection('pendingUsers').doc(email.toLowerCase()).delete().catch(() => {});
                AppDialog.toast('User authorized successfully', 'success');
                this.showEditUserModal(email.toLowerCase());
                return true;
            }
        });
    },

    async renderWhatsAppConfig() {
        const container = document.getElementById('admin-whatsapp-config-container');
        if (!container) return;

        const configSnap = await firestore.collection('modules').doc('whatsapp_sender').collection('config').doc('main').get();
        const config = configSnap.data() || {};
        const isConnected = !!(config.apiKey && config.wabaId);

        // Fetch templates for management
        const templatesSnap = await firestore.collection('modules').doc('whatsapp_sender').collection('templates').get();
        const templates = templatesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        container.innerHTML = `
            <div class="whatsapp-connect-container" style="max-width: 900px; margin: 0 auto; padding: 20px;">
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
                            <button class="btn btn-ghost btn-sm text-danger" style="margin-top:10px; width:100%;" onclick="window.adminPanel.handleClearWhatsAppLogs()">
                                <i data-lucide="trash-2"></i> Clear Debug Logs
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
                if (result.data?.wallet !== undefined) balEl.innerText = `₹${result.data.wallet.toLocaleString('en-IN')}`;
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
            window.AppLogger.log('UPDATE_WHATSAPP_CONFIG', 'admin_panel', { phoneNumber });
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

    async handleClearWhatsAppLogs() {
        AppDialog.confirm({
            title: 'Clear Debug Logs?',
            msg: 'This will permanently delete all WhatsApp API debug logs from the Realtime Database. This cannot be undone.',
            danger: true,
            confirmText: 'Clear Logs',
            onConfirm: async () => {
                try {
                    await db.ref('modules/whatsapp_sender/debug_logs').remove();
                    window.AppLogger.log('CLEAR_WHATSAPP_LOGS', 'admin_panel', { module: 'whatsapp_sender' });
                    AppDialog.toast('Debug logs cleared successfully', 'success');
                    return true;
                } catch (error) {
                    console.error("Error clearing logs:", error);
                    AppDialog.toast('Failed to clear logs: ' + error.message, 'error');
                    return false;
                }
            }
        });
    },

    showAddUserModal() {
        AppDialog.confirm({
            title: 'Authorize New User',
            content: `<div class="form-group"><label>Email Address</label><input type="email" id="new-user-email" class="form-control" placeholder="user@example.com"></div>
                      <div class="form-group" style="margin-top:15px;"><label><input type="checkbox" id="new-user-admin"> Global Administrator</label></div>`,
            onConfirm: async () => {
                const email = document.getElementById('new-user-email').value.toLowerCase().trim();
                if (!email) return false;
                await firestore.collection('allowedUsers').doc(email).set({
                    email, isAdmin: document.getElementById('new-user-admin').checked,
                    permissions: { 
                        smart_campus: { view: true }, 
                        staff_directory: { view: true }, 
                        student_directory: { view: true }, 
                        fees_accounting: { view: true, ledger: true },
                        whatsapp_sender: { access: true }
                    },
                    addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    addedBy: auth.currentUser.email
                });
                return true;
            }
        });
    },

    showEditUserModal(email) {
        if (window.staffDirectory?._isSuperAdmin(email)) {
            AppDialog.toast('Super Admin permissions are protected and cannot be changed.', 'error');
            return;
        }
        // allowedUsersData may be stale — prefer the live staffDirectory cache
        const user = window.staffDirectory?.allowedUsers[email] || this.allowedUsersData?.[email] || {};
        const p = user?.permissions || {};

        // Define safe access helpers
        const getPerm = (module, action) => p[module] === true || (p[module] && p[module][action]) ? 'checked' : '';

        const presets = {
            admin: { isAdmin: true },
            manager: {
                isAdmin: false,
                permissions: {
                    smart_campus: { view: true, control: true, scenes: true },
                    student_directory: { view: true, add: true, edit: true, delete: true, attendance_mark: true, attendance_view: true },
                    staff_directory: { view: true, add: true, edit: true, delete: true, attendance_mark: true, attendance_view: true, attendance_self: true },
                    fees_accounting: { view: true, ledger: true, trans_add: true, trans_delete: true, config: true, exp_own: true, exp_all: true, salaries_process: true, salaries_view: true },
                    whatsapp_sender: { access: true, broadcast: true, manage: true, config: true }
                }
            },
            staff: {
                isAdmin: false,
                permissions: {
                    smart_campus: { view: true, control: false, scenes: false },
                    student_directory: { view: true, add: false, edit: false, delete: false, attendance_mark: true, attendance_view: false },
                    staff_directory: { view: true, add: false, edit: false, delete: false, attendance_mark: false, attendance_view: false, attendance_self: true },
                    fees_accounting: { view: false, ledger: false, trans_add: false, trans_delete: false, config: false, exp_own: true, exp_all: false, salaries_process: false, salaries_view: false, wallet_view_own: true },
                    whatsapp_sender: { access: true, broadcast: false, manage: false, config: false }
                }
            },
            wallet_own: {
                isAdmin: false,
                permissions: {
                    fees_accounting: { wallet_view_own: true, wallet_edit_own: true }
                }
            },
            student: { isAdmin: false, role: 'student', permissions: {} },
            none: { isAdmin: false, permissions: {} }
        };

        AppDialog.confirm({
            title: `Minute Access Control: ${email}`,
            width: '900px',
            content: `
                <div style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--card-border);">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Quick Presets</div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-secondary btn-sm preset-btn" data-preset="admin"><i data-lucide="shield"></i> Admin</button>
                        <button class="btn btn-secondary btn-sm preset-btn" data-preset="manager"><i data-lucide="briefcase"></i> Manager</button>
                        <button class="btn btn-secondary btn-sm preset-btn" data-preset="staff"><i data-lucide="user"></i> Staff</button>
                        <button class="btn btn-secondary btn-sm preset-btn" data-preset="student"><i data-lucide="graduation-cap"></i> Student</button>
                        <button class="btn btn-secondary btn-sm preset-btn" data-preset="wallet_own"><i data-lucide="wallet"></i> Wallet Only</button>
                        <button class="btn btn-secondary btn-sm preset-btn" data-preset="none"><i data-lucide="x-circle"></i> Clear All</button>
                    </div>
                </div>

                <div class="form-group" style="padding-bottom:15px; border-bottom:1px solid var(--card-border); margin-bottom:20px;">
                    <label style="display:flex; align-items:center; gap:10px; font-size:1.1rem; color:var(--accent-primary);">
                        <input type="checkbox" id="edit-admin" ${user.isAdmin ? 'checked' : ''} style="width:20px; height:20px;"> 
                        <strong>Global Administrator (Unrestricted Access)</strong>
                    </label>
                </div>
                
                <div class="form-group" style="margin-bottom:20px;">
                    <label style="font-size:0.75rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:8px;">Account Role</label>
                    <select id="edit-role" class="form-control">
                        <option value="staff" ${(user.role || 'staff') === 'staff' ? 'selected' : ''}>Staff / Teacher</option>
                        <option value="student" ${user.role === 'student' ? 'selected' : ''}>Student / Parent</option>
                    </select>
                </div>
                <div id="student-link-section" style="display:${user.role === 'student' ? 'block' : 'none'}; margin-bottom:20px; padding:16px; background:rgba(115,199,200,0.05); border-radius:12px; border:1px solid rgba(115,199,200,0.2);">
                    <label style="font-size:0.75rem; font-weight:700; color:var(--accent-secondary); text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:8px;">Linked Student ID</label>
                    <input type="text" id="edit-linked-student-id" class="form-control" value="${user.linkedStudentId || ''}" placeholder="Paste Firestore student doc ID (optional)">
                    <div style="font-size:0.75rem; color:var(--text-dim); margin-top:8px; line-height:1.5;">Leave blank to auto-match by the mother or father email on the student record.</div>
                </div>

                <div id="granular-permissions-container" style="display:${(user.isAdmin || user.role === 'student') ? 'none' : 'block'}; max-height: 60vh; overflow-y: auto; padding-right:15px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                        <!-- Column 1 -->
                        <div>
                            <div class="form-section-title" style="margin-top:0;"><i data-lucide="home"></i> Smart Campus</div>
                            <div class="perm-grid-compact">
                                <label><input type="checkbox" class="perm-check" data-mod="smart_campus" data-act="view" ${getPerm('smart_campus', 'view')}> View campus dashboard</label>
                                <label><input type="checkbox" class="perm-check" data-mod="smart_campus" data-act="control" ${getPerm('smart_campus', 'control')}> Control devices (lights, fans)</label>
                                <label><input type="checkbox" class="perm-check" data-mod="smart_campus" data-act="scenes" ${getPerm('smart_campus', 'scenes')}> Create & manage scenes</label>
                            </div>

                            <div class="form-section-title"><i data-lucide="graduation-cap"></i> Students</div>
                            <div class="perm-grid-compact">
                                <label><input type="checkbox" class="perm-check" data-mod="student_directory" data-act="view" ${getPerm('student_directory', 'view')}> Browse & search student records</label>
                                <label><input type="checkbox" class="perm-check" data-mod="student_directory" data-act="add" ${getPerm('student_directory', 'add')}> Add new student</label>
                                <label><input type="checkbox" class="perm-check" data-mod="student_directory" data-act="edit" ${getPerm('student_directory', 'edit')}> Edit student data</label>
                                <label><input type="checkbox" class="perm-check" data-mod="student_directory" data-act="delete" ${getPerm('student_directory', 'delete')}> Delete student records</label>
                                <label><input type="checkbox" class="perm-check" data-mod="student_directory" data-act="attendance_mark" ${getPerm('student_directory', 'attendance_mark')}> Mark student attendance</label>
                                <label><input type="checkbox" class="perm-check" data-mod="student_directory" data-act="attendance_view" ${getPerm('student_directory', 'attendance_view')}> View attendance reports</label>
                            </div>

                            <div class="form-section-title"><i data-lucide="message-circle"></i> WhatsApp</div>
                            <div class="perm-grid-compact">
                                <label><input type="checkbox" class="perm-check" data-mod="whatsapp_sender" data-act="access" ${getPerm('whatsapp_sender', 'access')}> View chats & send direct messages</label>
                                <label><input type="checkbox" class="perm-check" data-mod="whatsapp_sender" data-act="broadcast" ${getPerm('whatsapp_sender', 'broadcast')}> Send mass broadcasts <small style="color:var(--text-dim);">(independent of chats)</small></label>
                                <label><input type="checkbox" class="perm-check" data-mod="whatsapp_sender" data-act="manage" ${getPerm('whatsapp_sender', 'manage')}> Manage contact lists, templates & history</label>
                                <label><input type="checkbox" class="perm-check" data-mod="whatsapp_sender" data-act="config" ${getPerm('whatsapp_sender', 'config')}> API configuration & credentials</label>
                            </div>
                        </div>

                        <!-- Column 2 -->
                        <div>
                            <div class="form-section-title" style="margin-top:0;"><i data-lucide="briefcase"></i> Staff & Profiles</div>
                            <div class="perm-grid-compact">
                                <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="view" ${getPerm('staff_directory', 'view')}> Browse staff profiles</label>
                                <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="add" ${getPerm('staff_directory', 'add')}> Create new staff profile</label>
                                <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="edit" ${getPerm('staff_directory', 'edit')}> Edit staff profiles</label>
                                <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="delete" ${getPerm('staff_directory', 'delete')}> Remove staff profiles</label>
                                <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="attendance_self" ${getPerm('staff_directory', 'attendance_self')}> Self check-in (own attendance only)</label>
                                <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="attendance_mark" ${getPerm('staff_directory', 'attendance_mark')}> Mark attendance for all staff</label>
                                <label><input type="checkbox" class="perm-check" data-mod="staff_directory" data-act="attendance_view" ${getPerm('staff_directory', 'attendance_view')}> View staff attendance reports</label>
                            </div>

                            <div class="form-section-title"><i data-lucide="wallet"></i> Fees & Accounting</div>
                            <div class="perm-grid-compact">
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="view" ${getPerm('fees_accounting', 'view')}> Revenue dashboard & income insights</label>
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="ledger" ${getPerm('fees_accounting', 'ledger')}> View student fee ledgers</label>
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="trans_add" ${getPerm('fees_accounting', 'trans_add')}> Record fee payments</label>
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="trans_delete" ${getPerm('fees_accounting', 'trans_delete')}> Reverse / delete payments</label>
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="config" ${getPerm('fees_accounting', 'config')}> Configure fee plan templates</label>
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="exp_own" ${getPerm('fees_accounting', 'exp_own')}> Log own office expenses</label>
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="exp_all" ${getPerm('fees_accounting', 'exp_all')}> View & manage all expenses</label>
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="wallet_view_own" ${getPerm('fees_accounting', 'wallet_view_own')}> View own wallet balance</label>
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="wallet_edit_own" ${getPerm('fees_accounting', 'wallet_edit_own')}> Manage own wallet entries</label>
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="salaries_view" ${getPerm('fees_accounting', 'salaries_view')}> View payroll & salaries</label>
                                <label><input type="checkbox" class="perm-check" data-mod="fees_accounting" data-act="salaries_process" ${getPerm('fees_accounting', 'salaries_process')}> Process & disburse payroll</label>
                            </div>
                        </div>
                    </div>
                </div>
                <style>
                    .perm-grid-compact { display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 20px; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 12px; }
                    .perm-grid-compact label { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: background 0.2s; }
                    .perm-grid-compact label:hover { background: rgba(255,255,255,0.05); }
                    .perm-grid-compact input { width: 16px; height: 16px; }
                </style>`,
            onOpen: (overlay) => {
                if (window.lucide) window.lucide.createIcons({ root: overlay });
                const adminToggle = document.getElementById('edit-admin');
                const roleSelect = document.getElementById('edit-role');
                const permContainer = document.getElementById('granular-permissions-container');
                const studentSection = document.getElementById('student-link-section');

                const syncVisibility = () => {
                    const isAdm = adminToggle.checked;
                    const isStudent = roleSelect.value === 'student';
                    permContainer.style.display = (isAdm || isStudent) ? 'none' : 'block';
                    studentSection.style.display = (!isAdm && isStudent) ? 'block' : 'none';
                };

                adminToggle.addEventListener('change', syncVisibility);
                roleSelect.addEventListener('change', syncVisibility);

                overlay.querySelectorAll('.preset-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const presetName = btn.getAttribute('data-preset');
                        const preset = presets[presetName];

                        adminToggle.checked = preset.isAdmin;
                        if (preset.role) roleSelect.value = preset.role;
                        else if (!preset.isAdmin) roleSelect.value = 'staff';

                        syncVisibility();

                        if (!preset.isAdmin && preset.role !== 'student') {
                            overlay.querySelectorAll('.perm-check').forEach(check => {
                                const mod = check.getAttribute('data-mod');
                                const act = check.getAttribute('data-act');
                                check.checked = !!(preset.permissions[mod] && preset.permissions[mod][act]);
                            });
                        }
                        AppDialog.toast(`Applied ${presetName} preset`, 'info');
                    });
                });
            },
            onConfirm: async () => {
                const isAdmin = document.getElementById('edit-admin').checked;
                const role = document.getElementById('edit-role').value;
                const linkedStudentId = document.getElementById('edit-linked-student-id').value.trim();
                const permissions = {};

                if (!isAdmin && role !== 'student') {
                    document.querySelectorAll('.perm-check').forEach(el => {
                        const mod = el.getAttribute('data-mod');
                        const act = el.getAttribute('data-act');
                        if (!permissions[mod]) permissions[mod] = {};
                        permissions[mod][act] = el.checked;
                    });
                }

                const updateData = { isAdmin, role, permissions };
                if (linkedStudentId) updateData.linkedStudentId = linkedStudentId;
                else updateData.linkedStudentId = firebase.firestore.FieldValue.delete();

                await firestore.collection('allowedUsers').doc(email).update(updateData);
                window.AppLogger.log('EDIT_USER_PERMISSIONS', 'admin_panel', { email, role, isAdmin });
                AppDialog.toast(`Access updated for ${email}`, 'success');
                return true;
            }
        });
    },

    removeAllowedUser(email) {
        if (window.staffDirectory?._isSuperAdmin(email)) {
            AppDialog.toast('Super Admin cannot be removed.', 'error');
            return;
        }
        AppDialog.confirm({
            title: 'Remove User', msg: `Revoke all access for ${email}?`, danger: true, onConfirm: async () => {
                await firestore.collection('allowedUsers').doc(email).delete();
                firestore.collection('pendingUsers').doc(email).delete().catch(() => {});
                return true;
            }
        });
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

window.filterAdminList = () => {
    window.adminPanel.render();
};

window.toggleSelectAll = () => {
    const container = document.getElementById('admin-list');
    const items = container.querySelectorAll('.admin-item');
    if (!items.length) return;

    // Check if all are already selected
    let allSelected = true;
    items.forEach(item => {
        if (!item.classList.contains('selected')) allSelected = false;
    });

    // If all are selected, deselect all. Otherwise, select all.
    items.forEach(item => {
        // Extract uniqueId from the item's stored data or by finding it
        // Since we don't have it easily, we re-run the toggle logic
        // But better: update selectedItems directly and re-render
    });

    // Better implementation:
    const searchTerm = (document.getElementById('admin-search')?.value || '').toLowerCase();
    let allFilteredIds = [];
    Object.keys(window.smartCampus.areas).forEach(areaId => {
        if (areaId === 'no_area' || !window.smartCampus.areas[areaId].devices) return;
        const areaName = formatName(window.smartCampus.areas[areaId].name || areaId);
        Object.keys(window.smartCampus.areas[areaId].devices).forEach(deviceId => {
            const d = window.smartCampus.areas[areaId].devices[deviceId];
            const text = (d.name + ' ' + areaName + ' ' + d.domain).toLowerCase();
            if (text.includes(searchTerm)) {
                allFilteredIds.push(areaId + '_' + deviceId);
            }
        });
    });

    const alreadyAllSelected = allFilteredIds.every(id => window.adminPanel.selectedItems.has(id));

    if (alreadyAllSelected) {
        allFilteredIds.forEach(id => window.adminPanel.selectedItems.delete(id));
    } else {
        allFilteredIds.forEach(id => window.adminPanel.selectedItems.add(id));
    }

    window.adminPanel.render();
};

window.hideSelected = () => {
    window.adminPanel.updateVisibility(true);
};

window.unhideSelected = () => {
    window.adminPanel.updateVisibility(false);
};

window.addAllowedUser = () => {
    window.adminPanel.showAddUserModal();
};

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
                window.AppLogger.log('EDIT_SCENE', 'smart_campus', { name }, sceneId);
            } else {
                const newRef = db.ref('modules/smart_campus/scenes').push();
                await newRef.set(sceneData);
                window.AppLogger.log('ADD_SCENE', 'smart_campus', { name }, newRef.key);
            }
            return true;
        }
    });
};
