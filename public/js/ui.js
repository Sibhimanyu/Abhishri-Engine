// UI and Navigation Helper Functions

// ─── Global App Dialog System ──────────────────────────────────────────────
// Replaces all native alert() and confirm() calls with styled in-app modals.

window.AppDialog = (() => {
    // Inject toast styles once
    const styleId = 'app-dialog-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            #app-toast-container {
                position: fixed; bottom: 24px; right: 24px;
                display: flex; flex-direction: column; gap: 10px;
                z-index: 99999; pointer-events: none;
            }
            .app-toast {
                display: flex; align-items: center; gap: 10px;
                padding: 12px 18px; border-radius: 10px;
                font-size: 0.88rem; font-weight: 500;
                backdrop-filter: blur(12px);
                box-shadow: 0 4px 24px rgba(0,0,0,0.3);
                pointer-events: all; cursor: default;
                animation: toast-in 0.25s ease;
                max-width: 340px; word-break: break-word;
                border: 1px solid rgba(255,255,255,0.07);
            }
            .app-toast.toast-success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border-color: rgba(74,222,128,0.25); }
            .app-toast.toast-error   { background: rgba(239, 68, 68, 0.15);  color: #f87171; border-color: rgba(248,113,113,0.25); }
            .app-toast.toast-info    { background: rgba(56, 189, 248, 0.12); color: #7dd3fc; border-color: rgba(125,211,252,0.2); }
            .app-toast.toast-warn    { background: rgba(251, 191, 36, 0.12); color: #fcd34d; border-color: rgba(252,211,77,0.2); }
            .app-toast.toast-out     { animation: toast-out 0.2s ease forwards; }
            @keyframes toast-in  { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
            @keyframes toast-out { from { opacity:1; } to { opacity:0; transform: translateY(8px); } }

            .app-dialog-overlay {
                position: fixed; inset: 0;
                background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
                z-index: 99990; display: flex; align-items: center; justify-content: center;
                animation: dialog-in 0.18s ease;
            }
            @keyframes dialog-in { from { opacity:0; } to { opacity:1; } }
            .app-dialog-box {
                background: var(--surface, #1e2127);
                border: 1px solid var(--card-border, rgba(255,255,255,0.08));
                border-radius: 14px; padding: 28px 28px 22px;
                min-width: 300px; max-width: 420px; width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                display: flex; flex-direction: column; gap: 10px;
                animation: dialog-box-in 0.2s cubic-bezier(0.34,1.56,0.64,1);
            }
            @keyframes dialog-box-in { from { transform: scale(0.92) translateY(8px); } to { transform: scale(1) translateY(0); } }
            .app-dialog-icon { font-size: 1.8rem; margin-bottom: 2px; }
            .app-dialog-title { font-size: 1rem; font-weight: 700; color: var(--text-main, #e8eaf0); }
            .app-dialog-msg   { font-size: 0.88rem; color: var(--text-dim, #8b909e); line-height: 1.5; }
            .app-dialog-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
        `;
        document.head.appendChild(style);
    }

    function getToastContainer() {
        let c = document.getElementById('app-toast-container');
        if (!c) { c = document.createElement('div'); c.id = 'app-toast-container'; document.body.appendChild(c); }
        return c;
    }

    /**
     * Show a non-blocking toast notification.
     * @param {string} msg - Message to display
     * @param {'success'|'error'|'info'|'warn'} [type='info']
     */
    function toast(msg, type = 'info') {
        const icons = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
        const el = document.createElement('div');
        el.className = `app-toast toast-${type}`;
        el.innerHTML = `<span style="font-size:1rem;flex-shrink:0;">${icons[type] || icons.info}</span><span>${msg}</span>`;
        getToastContainer().appendChild(el);
        setTimeout(() => {
            el.classList.add('toast-out');
            el.addEventListener('animationend', () => el.remove());
        }, 3500);
    }

    /**
     * Show an informational modal (replaces alert).
     * @param {string} msg
     * @param {{ title?: string, type?: 'info'|'success'|'error'|'warn' }} [opts]
     * @returns {Promise<void>}
     */
    function alert(msg, opts = {}) {
        return new Promise(resolve => {
            const { title = 'Notice', type = 'info' } = opts;
            const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
            const overlay = document.createElement('div');
            overlay.className = 'app-dialog-overlay';
            overlay.innerHTML = `
                <div class="app-dialog-box">
                    <div class="app-dialog-icon">${icons[type] || icons.info}</div>
                    <div class="app-dialog-title">${title}</div>
                    <div class="app-dialog-msg">${msg}</div>
                    <div class="app-dialog-actions">
                        <button class="btn btn-primary" id="app-dialog-ok" style="min-width:80px;">OK</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            const ok = overlay.querySelector('#app-dialog-ok');
            const dismiss = () => { overlay.remove(); resolve(); };
            ok.addEventListener('click', dismiss);
            overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
            overlay.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); dismiss(); } });
            ok.focus();
        });
    }

    /**
     * Show a confirmation modal (replaces confirm). Returns a Promise<boolean>.
     * @param {string} msg
     * @param {{ title?: string, confirmText?: string, cancelText?: string, danger?: boolean, isHtml?: boolean, width?: string }} [opts]
     * @returns {Promise<boolean>}
     */
    function confirm(msg, opts = {}) {
        // Support calling with single object: AppDialog.confirm({ title, content, ... })
        if (typeof msg === 'object' && msg !== null && !opts.content) {
            opts = msg;
            msg = opts.content || opts.msg || '';
        }

        return new Promise(resolve => {
            const { 
                title = 'Are you sure?', 
                confirmText = 'Confirm', 
                cancelText = 'Cancel', 
                danger = false, 
                isHtml = false, 
                width = 'auto',
                onConfirm = null
            } = opts;
            
            const overlay = document.createElement('div');
            overlay.className = 'app-dialog-overlay';
            const safeMsg = (typeof msg === 'string') ? (isHtml ? msg : msg.replace(/\\n/g, '<br>')) : '';
            
            overlay.innerHTML = `
                <div class="app-dialog-box" style="max-width: ${width};">
                    <div class="app-dialog-icon">${danger ? '🗑️' : '❓'}</div>
                    <div class="app-dialog-title">${title}</div>
                    <div class="app-dialog-msg">${safeMsg}</div>
                    <div class="app-dialog-actions">
                        <button class="btn btn-secondary" id="app-dialog-cancel" style="min-width:80px;">${cancelText}</button>
                        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="app-dialog-confirm" style="min-width:80px;">${confirmText}</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            
            const confirmed = async () => {
                if (typeof onConfirm === 'function') {
                    const result = await onConfirm();
                    if (result === false) return; // Keep modal open if onConfirm returns false
                }
                overlay.remove(); 
                resolve(true); 
            };
            const cancelled = () => { overlay.remove(); resolve(false); };
            
            overlay.querySelector('#app-dialog-confirm').addEventListener('click', confirmed);
            overlay.querySelector('#app-dialog-cancel').addEventListener('click', cancelled);
            overlay.addEventListener('click', e => { if (e.target === overlay) cancelled(); });
            overlay.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); confirmed(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelled(); }
            });
            overlay.querySelector('#app-dialog-confirm').focus();
        });
    }

    return { toast, alert, confirm };
})();
// ─── End AppDialog ─────────────────────────────────────────────────────────

// ─── Student Data Manager (Centralized) ────────────────────────────────────
window.studentDataManager = {
    students: {},
    dataLoaded: false,
    isSubscribed: false,
    callbacks: [],

    subscribe() {
        if (this.isSubscribed) return;
        this.isSubscribed = true;

        // Small delay to ensure auth state is fully stable across Firebase services
        setTimeout(() => {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                console.warn("Student Sync: No user signed in yet, waiting...");
                this.isSubscribed = false; // Allow retry
                return;
            }
            
            console.log("Student Sync: Subscribing for user:", currentUser.email);
            const modulesCol = firestore.collection('modules');
            const studentDirDoc = modulesCol.doc('student_directory');
            const studentsRef = studentDirDoc.collection('students');
            
            studentsRef.onSnapshot((querySnapshot) => {
                const data = {};
                querySnapshot.forEach((doc) => {
                    data[doc.id] = doc.data();
                });
                this.students = data;
                this.dataLoaded = true;
                this.notify();
            }, (error) => {
                const authState = firebase.auth().currentUser ? 'Authenticated' : 'Unauthenticated';
                console.error(`Firestore Sync Error [${authState}]:`, error.code, error.message);
                
                let userFriendlyMsg = 'Failed to load student records.';
                if (error.code === 'permission-denied') userFriendlyMsg = 'Permission Denied: Access to student records restricted.';
                if (error.code === 'unavailable') userFriendlyMsg = 'Service Unavailable: Check your internet connection.';
                
                AppDialog.toast(`Sync Error: ${userFriendlyMsg} (${error.code || 'unknown'})`, 'error');
            });
        }, 500);
    },

    onUpdate(callback) {
        this.callbacks.push(callback);
        if (this.dataLoaded) callback(this.students);
    },

    notify() {
        this.callbacks.forEach(cb => cb(this.students));
    }
};
// ─── End Student Data Manager ──────────────────────────────────────────────


function getAreaIcon(name) {
    const lower = name.toLowerCase();

    // Floors
    if (lower.includes('ground floor') || lower.includes('ground_floor')) return 'home';
    if (lower.includes('first floor') || lower.includes('first_floor')) return 'layers';
    if (lower.includes('terrace')) return 'cloud';

    // Specific Rooms
    if (lower.includes('kitchen')) return 'utensils';
    if (lower.includes('auditorium')) return 'mic';
    if (lower.includes('central room') || lower.includes('central_room')) return 'grid-3x3';
    if (lower.includes('reception')) return 'info';
    if (lower.includes('bathroom') || lower.includes('toilet')) return 'bath';
    if (lower.includes('exit room') || lower.includes('exit_room')) return 'door-open';
    if (lower.includes('entrance room') || lower.includes('entrance_room')) return 'door-closed';
    if (lower.includes('staircase')) return 'move-vertical';

    // Zones
    if (lower.includes('zone 1') || lower.includes('zone_1')) return 'square-1';
    if (lower.includes('zone 2') || lower.includes('zone_2')) return 'square-2';
    if (lower.includes('zone 3') || lower.includes('zone_3')) return 'square-3';
    if (lower.includes('zone 4') || lower.includes('zone_4')) return 'square-4';
    if (lower.includes('zone')) return 'map-pin';

    // Office/Work Spaces
    if (lower.includes('computer lab') || lower.includes('lab')) return 'monitor';
    if (lower.includes('ceo') || lower.includes('admin') || lower.includes('office')) return 'briefcase';

    // General Categories
    if (lower.includes('living')) return 'sofa';
    if (lower.includes('bedroom')) return 'bed';
    if (lower.includes('classroom')) return 'graduation-cap';
    if (lower.includes('library')) return 'book-open';
    if (lower.includes('gym')) return 'dumbbell';
    if (lower.includes('parking') || lower.includes('garage')) return 'car';
    if (lower.includes('garden')) return 'tree-pine';
    if (lower.includes('server')) return 'server';
    if (lower.includes('maintenance')) return 'wrench';
    if (lower.includes('gate') || lower.includes('security')) return 'shield';

    return 'box';
}

function formatName(name) {
    if (!name) return name;
    return name.split(/[\._ ]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function toggleSidebar() {
    const activeApp = document.querySelector('.app-wrapper.active');
    if (!activeApp) return;

    const sidebar = activeApp.querySelector('.console-sidebar');
    const overlay = activeApp.querySelector('.sidebar-overlay');
    const toggle = activeApp.querySelector('.mobile-nav-toggle');

    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
    if (toggle) toggle.classList.toggle('active');

    // Update icons
    lucide.createIcons();
}

function closeSidebar() {
    if (window.innerWidth <= 1024) {
        document.querySelectorAll('.console-sidebar').forEach(el => el.classList.remove('open'));
        document.querySelectorAll('.sidebar-overlay').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-toggle').forEach(el => el.classList.remove('active'));
    }
}

function switchView(viewId, areaId = null) {
    window.smartCampus.currentView = viewId;
    window.smartCampus.activeAreaId = areaId;

    // Update URL hash to persist state (e.g., #smart-campus/overview or #smart-campus/room/living_room)
    let newHash = `smart-campus/${viewId}`;
    if (areaId) newHash += `/${areaId}`;
    window.location.hash = newHash;

    // Update Sidebar items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (viewId === 'overview' && item.innerText.includes('Overview')) item.classList.add('active');
        if (areaId && item.dataset.areaId === areaId) item.classList.add('active');
    });

    // Update View Visibility - SCOPED TO SMART CAMPUS ONLY
    const smartCampusApp = document.getElementById('smart-campus-app');
    if (smartCampusApp) {
        smartCampusApp.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    }

    if (viewId === 'overview') {
        const overview = document.getElementById('view-overview');
        if (overview) overview.classList.add('active');
        const screenTitle = document.getElementById('screen-title');
        if (screenTitle) screenTitle.innerText = 'Campus Overview';
        const screenSubtitle = document.getElementById('screen-subtitle');
        if (screenSubtitle) screenSubtitle.innerText = 'Monitoring all smart systems';
    } else {
        const area = window.smartCampus.areas[areaId];
        if (area) {
            const areaName = formatName(area.name || areaId);
            const viewRoom = document.getElementById('view-room');
            if (viewRoom) viewRoom.classList.add('active');
            const screenTitle = document.getElementById('screen-title');
            if (screenTitle) screenTitle.innerText = areaName;
            const screenSubtitle = document.getElementById('screen-subtitle');
            if (screenSubtitle) screenSubtitle.innerText = `Controlling ${Object.keys(area.devices || {}).length} items`;
            window.smartCampus.renderAreaDetails(areaId);
        }
    }

    if (window.innerWidth <= 1024) {
        closeSidebar();
    }
    lucide.createIcons();
}

function navigateTo(route, updateHash = true) {
    if (updateHash) window.location.hash = route;

    // Support nested routes like #whatsapp/broadcast
    const parts = route.split('/');
    const mainRoute = parts[0];
    const subRoute = parts[1];

    // Hide all views
    document.getElementById('landing-view').classList.remove('active');
    document.querySelectorAll('.app-wrapper').forEach(el => el.classList.remove('active'));

    // Close user dropdown if open
    document.getElementById('user-dropdown').classList.remove('show');

    // Check Permissions before showing
    const userData = window.currentUserData || {};
    const perms = userData.permissions || {};
    const isAdmin = userData.isAdmin;

    if (mainRoute === 'portal') {
        document.getElementById('landing-view').classList.add('active');
        renderPortalCards(userData);
    } else if (mainRoute === 'smart-campus') {
        if (isAdmin || perms.smart_campus?.view || perms.smart_campus === true) {
            document.getElementById('smart-campus-app').classList.add('active');
            window.smartCampus.subscribe();
            
            // Handle sub-routing for smart-campus
            if (subRoute) {
                // Wait a tiny bit for data to load if needed, but switchView handles missing areas gracefully
                switchView(subRoute, parts[2]); 
            } else {
                switchView('overview');
            }
        } else {
            AppDialog.toast('Access Denied: You do not have permission to access Smart Campus.', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'admin') {
        if (isAdmin) {
            document.getElementById('admin-app').classList.add('active');
            window.smartCampus.subscribe(); // Ensure data is available
            window.smartCampus.currentView = 'admin';
            window.adminPanel.render();
            window.adminPanel.renderUserManagement();
        } else {
            AppDialog.toast('Access Denied: Admin access required.', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'students') {
        if (isAdmin || perms.student_directory?.view || perms.student_directory === true) {
            document.getElementById('student-app').classList.add('active');
            window.studentDirectory.subscribe();
            
            // Handle sub-routing for students
            if (subRoute && window.studentDirectory.switchView) {
                window.studentDirectory.switchView(subRoute, parts[2]);
            } else {
                window.studentDirectory.render();
            }
        } else {
            AppDialog.toast('Access Denied: You do not have permission to access Student Directory.', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'staff') {
        if (isAdmin || perms.staff_directory?.view || perms.staff_directory === true) {
            document.getElementById('staff-app').classList.add('active');
            window.staffDirectory.subscribe();
            
            // Handle sub-routing for staff if applicable
            if (subRoute && window.staffDirectory.switchView) {
                window.staffDirectory.switchView(subRoute);
            } else {
                window.staffDirectory.render();
            }
        } else {
            AppDialog.toast('Access Denied: You do not have permission to access Staff Directory.', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'fees') {
        if (isAdmin || perms.fees_accounting?.view || perms.fees_accounting === true) {
            document.getElementById('fees-app').classList.add('active');
            window.feesManager.subscribe();
            
            if (subRoute && window.feesManager.switchView) {
                window.feesManager.switchView(subRoute, parts[2]);
            } else {
                window.feesManager.switchView('overview');
            }
        } else {
            AppDialog.toast('Access Denied: You do not have permission to access Fees & Accounting.', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'whatsapp') {
        if (isAdmin || perms.whatsapp_sender?.access || perms.whatsapp_sender === true) {
            document.getElementById('whatsapp-app').classList.add('active');
            if (window.whatsAppSender) {
                window.whatsAppSender.initialize();
                // If we have a sub-route, switch to it, otherwise default to chats
                if (subRoute) {
                    window.whatsAppSender.switchView(subRoute);
                } else {
                    window.whatsAppSender.switchView('chats');
                }
            }
        } else {
            AppDialog.toast('Access Denied: You do not have permission to access WhatsApp Sender.', 'error');
            window.location.hash = 'portal';
        }
    }
    if (window.innerWidth <= 1024) {
        closeSidebar();
    }
}

function renderPortalCards(userData) {
    const perms = userData.permissions || {};
    const isAdmin = userData.isAdmin;

    const scCard = document.getElementById('card-smart-campus');
    if (isAdmin || perms.smart_campus?.view || perms.smart_campus === true) scCard.classList.remove('disabled');
    else scCard.classList.add('disabled');

    const stCard = document.getElementById('card-students');
    if (isAdmin || perms.student_directory?.view || perms.student_directory === true) stCard.classList.remove('disabled');
    else stCard.classList.add('disabled');

    const staffCard = document.getElementById('card-staff');
    if (isAdmin || perms.staff_directory?.view || perms.staff_directory === true) staffCard.classList.remove('disabled');
    else staffCard.classList.add('disabled');

    const feesCard = document.getElementById('card-fees');
    if (isAdmin || perms.fees_accounting?.view || perms.fees_accounting === true) feesCard.classList.remove('disabled');
    else feesCard.classList.add('disabled');

    const adminCard = document.getElementById('card-admin');
    if (isAdmin) adminCard.classList.remove('disabled');
    else adminCard.classList.add('disabled');

    const whatsappCard = document.getElementById('card-whatsapp');
    if (isAdmin || perms.whatsapp_sender?.access || perms.whatsapp_sender === true) whatsappCard.classList.remove('disabled');
    else whatsappCard.classList.add('disabled');
}

window.toggleUserDropdown = () => {
    document.getElementById('user-dropdown').classList.toggle('show');
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const widget = document.getElementById('user-widget');
    if (widget && !widget.contains(e.target)) {
        document.getElementById('user-dropdown').classList.remove('show');
    }
});


