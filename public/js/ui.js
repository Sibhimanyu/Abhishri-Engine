// UI and Navigation Helper Functions

// ─── Global App Dialog System ──────────────────────────────────────────────
// Replaces all native alert() and confirm() calls with styled in-app modals.

window.AppLogger = {
    async log(action, module, details = {}, entityId = null) {
        try {
            await firestore.collection('audit_logs').add({
                action,
                module,
                details,
                entityId,
                performedBy: auth.currentUser?.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { console.warn("Logging failed:", e); }
    }
};

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
                border-radius: 14px; padding: 28px;
                width: 95%; max-width: 420px;
                max-height: 90vh; overflow-y: auto; overflow-x: hidden;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                display: flex; flex-direction: column; gap: 10px;
                animation: dialog-box-in 0.2s cubic-bezier(0.34,1.56,0.64,1);
                position: relative;
            }
            .app-dialog-box::-webkit-scrollbar { width: 6px; }
            .app-dialog-box::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }

            .app-dialog-close {
                position: absolute; top: 15px; right: 15px;
                width: 32px; height: 32px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: all 0.2s; color: var(--text-dim);
                background: rgba(255,255,255,0.03);
            }
            .app-dialog-close:hover { background: rgba(255,255,255,0.08); color: var(--text-main); }

            .app-dialog-header { display: flex; align-items: center; gap: 12px; margin-bottom: 5px; }
            .app-dialog-icon-inline {
                width: 32px; height: 32px; border-radius: 8px;
                display: flex; align-items: center; justify-content: center;
                flex-shrink: 0;
            }

            /* Responsive Grid for Fee Modal */
            .fee-modal-grid {
                display: grid; grid-template-columns: 280px 1fr; gap: 30px; margin-top: 10px;
            }
            @media (max-width: 900px) {
                .fee-modal-grid { grid-template-columns: 1fr; gap: 20px; }
                .fee-modal-left { border-right: none !important; padding-right: 0 !important; border-bottom: 1px solid var(--card-border); padding-bottom: 20px; }
            }
            @media (max-width: 600px) {
                .app-dialog-box { padding: 20px 15px; width: 95%; }
                .component-row { grid-template-columns: 1fr !important; gap: 8px !important; }
            }
            @keyframes dialog-box-in { from { transform: scale(0.92) translateY(8px); } to { transform: scale(1) translateY(0); } }
            
            .app-dialog-title { font-size: 1.15rem; font-weight: 700; color: var(--text-main, #e8eaf0); }
            .app-dialog-msg   { font-size: 0.88rem; color: var(--text-dim, #8b909e); line-height: 1.5; }
            .app-dialog-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px; }
        `;
        document.head.appendChild(style);
    }

    function getToastContainer() {
        let c = document.getElementById('app-toast-container');
        if (!c) { c = document.createElement('div'); c.id = 'app-toast-container'; document.body.appendChild(c); }
        return c;
    }

    function getMeaningfulIcon(title, danger = false) {
        const t = (title || '').toLowerCase();
        if (danger || t.includes('delete') || t.includes('remove') || t.includes('stop')) return 'trash-2';
        if (t.includes('send') || t.includes('launch') || t.includes('broadcast')) return 'send';
        if (t.includes('success') || t.includes('saved') || t.includes('completed')) return 'check-circle';
        if (t.includes('error') || t.includes('fail')) return 'alert-circle';
        if (t.includes('warn') || t.includes('notice') || t.includes('attention')) return 'alert-triangle';
        if (t.includes('payment') || t.includes('fee')) return 'credit-card';
        if (t.includes('expense')) return 'receipt';
        if (t.includes('student') || t.includes('admission') || t.includes('profile')) return 'user';
        if (t.includes('staff')) return 'users';
        if (t.includes('template') || t.includes('structure')) return 'layout';
        return 'help-circle';
    }

    function toast(msg, type = 'info') {
        const icons = { success: 'check-circle', error: 'x-circle', info: 'info', warn: 'alert-triangle' };
        const iconName = icons[type] || 'info';
        const el = document.createElement('div');
        el.className = `app-toast toast-${type}`;
        el.innerHTML = `<span style="font-size:1rem;flex-shrink:0;display:flex;align-items:center;"><i data-lucide="${iconName}" style="width:18px;height:18px;"></i></span><span>${msg}</span>`;
        getToastContainer().appendChild(el);
        if (window.lucide) window.lucide.createIcons({ root: el });
        setTimeout(() => {
            el.classList.add('toast-out');
            el.addEventListener('animationend', () => el.remove());
        }, 3500);
    }

    function alert(msg, opts = {}) {
        return new Promise(resolve => {
            const { title = 'Notice', type = 'info' } = opts;
            const icons = { success: 'check-circle', error: 'x-circle', info: 'info', warn: 'alert-triangle' };
            const colors = { success: '#4ade80', error: '#f87171', info: '#7dd3fc', warn: '#fcd34d' };
            const iconName = icons[type] || 'info';
            const iconColor = colors[type] || colors.info;

            const overlay = document.createElement('div');
            overlay.className = 'app-dialog-overlay';
            overlay.innerHTML = `
                <div class="app-dialog-box">
                    <div class="app-dialog-close" id="app-dialog-close-x"><i data-lucide="x" style="width:18px; height:18px;"></i></div>
                    <div class="app-dialog-header">
                        <div class="app-dialog-icon-inline" style="background: ${iconColor}20">
                            <i data-lucide="${iconName}" style="width:20px; height:20px; color:${iconColor};"></i>
                        </div>
                        <div class="app-dialog-title">${title}</div>
                    </div>
                    <div class="app-dialog-msg">${msg}</div>
                    <div class="app-dialog-actions">
                        <button class="btn btn-primary" id="app-dialog-ok" style="min-width:80px;">OK</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            if (window.lucide) window.lucide.createIcons({ root: overlay });

            const ok = overlay.querySelector('#app-dialog-ok');
            const closeX = overlay.querySelector('#app-dialog-close-x');
            const dismiss = () => { overlay.remove(); resolve(); };
            ok.addEventListener('click', dismiss);
            closeX.addEventListener('click', dismiss);
            overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
            overlay.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); dismiss(); } });
            ok.focus();
        });
    }

    function confirm(msg, opts = {}) {
        if (typeof msg === 'object' && msg !== null && !opts.content) {
            opts = msg;
            msg = opts.content || opts.msg || '';
        }

        return new Promise(resolve => {
            const { title = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, isHtml = false, width = 'auto', onConfirm = null, onOpen = null } = opts;
            const overlay = document.createElement('div');
            overlay.className = 'app-dialog-overlay';
            const safeMsg = (typeof msg === 'string') ? (isHtml ? msg : msg.replace(/\\n/g, '<br>')) : '';
            const iconName = getMeaningfulIcon(title, danger);
            const iconColor = danger ? '#f87171' : '#7dd3fc';

            overlay.innerHTML = `
                <div class="app-dialog-box" style="max-width: ${width};">
                    <div class="app-dialog-close" id="app-dialog-close-x"><i data-lucide="x" style="width:18px; height:18px;"></i></div>
                    <div class="app-dialog-header">
                        <div class="app-dialog-icon-inline" style="background: ${iconColor}20">
                            <i data-lucide="${iconName}" style="width:20px; height:20px; color:${iconColor};"></i>
                        </div>
                        <div class="app-dialog-title">${title}</div>
                    </div>
                    <div class="app-dialog-msg">${safeMsg}</div>
                    <div class="app-dialog-actions">
                        <button class="btn btn-secondary" id="app-dialog-cancel" style="min-width:80px;">${cancelText}</button>
                        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="app-dialog-confirm" style="min-width:80px;">${confirmText}</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            if (window.lucide) window.lucide.createIcons({ root: overlay });

            if (typeof onOpen === 'function') setTimeout(() => onOpen(overlay), 10);

            const confirmed = async () => {
                const btn = overlay.querySelector('#app-dialog-confirm');
                const originalHtml = btn.innerHTML;

                btn.disabled = true;
                btn.innerHTML = '<span class="loading-spinner" style="width:14px; height:14px; border-width:2px; margin-right:8px; display:inline-block;"></span>Processing...';

                try {
                    if (typeof onConfirm === 'function') {
                        const result = await onConfirm();
                        if (result === false) {
                            btn.disabled = false;
                            btn.innerHTML = originalHtml;
                            return;
                        }
                    }
                    overlay.remove();
                    resolve(true);
                } catch (err) {
                    console.error("Confirm error:", err);
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                }
            };
            const cancelled = () => { overlay.remove(); resolve(false); };

            overlay.querySelector('#app-dialog-confirm').addEventListener('click', confirmed);
            overlay.querySelector('#app-dialog-cancel').addEventListener('click', cancelled);
            overlay.querySelector('#app-dialog-close-x').addEventListener('click', cancelled);
            overlay.addEventListener('click', e => { if (e.target === overlay) cancelled(); });
            overlay.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); confirmed(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelled(); }
            });
            overlay.querySelector('#app-dialog-confirm').focus();
        });
    }

    function showImage(url, title = 'Attachment View') {
        confirm({
            title: title,
            content: `
            <div style="text-align:center; padding:10px;">
                <img src="${url}" style="max-width:100%; max-height:65vh; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1);" onerror="this.src='https://placehold.co/600x400?text=Image+Load+Error'">
                <div style="margin-top:20px;">
                    <a href="${url}" target="_blank" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:8px;">
                        <i data-lucide="external-link" style="width:14px;"></i> Open Original
                    </a>
                </div>
            </div>`,
            isHtml: true,
            width: '600px',
            confirmText: 'Close',
            onConfirm: () => true
        });
    }

    return { toast, alert, confirm, showImage };
})();
// ─── Student Data Manager (Centralized) ────────────────────────────────────
window.studentDataManager = {
    students: {},
    dataLoaded: false,
    isSubscribed: false,
    callbacks: [],

    subscribe() {
        if (this.isSubscribed) return;
        this.isSubscribed = true;

        setTimeout(() => {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                console.warn("Student Sync: No user signed in yet, waiting...");
                this.isSubscribed = false;
                return;
            }

            firestore.collection('modules').doc('student_directory').collection('students')
                .onSnapshot((snapshot) => {
                    const data = {};
                    snapshot.forEach(doc => {
                        data[doc.id] = { id: doc.id, ...doc.data() };
                    });
                    this.students = data;
                    this.dataLoaded = true;
                    this.notify();
                }, (error) => {
                    console.error("Student Sync Error:", error);
                    this.isSubscribed = false;
                });
        }, 1000);
    },

    onUpdate(callback) {
        this.callbacks.push(callback);
        if (this.dataLoaded) callback(this.students);
    },

    notify() {
        this.callbacks.forEach(cb => cb(this.students));
    }
};

// ─── Staff Data Manager (Centralized) ───────────────────────────────────────
window.staffDataManager = {
    staff: {},
    dataLoaded: false,
    isSubscribed: false,
    callbacks: [],

    subscribe() {
        if (this.isSubscribed) return;
        this.isSubscribed = true;

        setTimeout(() => {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                console.warn("Staff Sync: No user signed in yet, waiting...");
                this.isSubscribed = false;
                return;
            }

            const email = currentUser.email.toLowerCase();
            
            // Try full sync first
            this._unsubscribe = firestore.collection('modules').doc('staff_directory').collection('staff')
                .onSnapshot((snapshot) => {
                    const data = {};
                    snapshot.forEach(doc => {
                        data[doc.id] = { id: doc.id, ...doc.data() };
                    });
                    this.staff = data;
                    this.dataLoaded = true;
                    this.notify();
                }, (error) => {
                    if (error.code === 'permission-denied') {
                        console.info("Staff Sync: Full access denied, trying email-based fallback...");
                        // Fallback: Query only for own record by email
                        firestore.collection('modules').doc('staff_directory').collection('staff')
                            .where('email', '==', email)
                            .onSnapshot((snap) => {
                                const data = {};
                                snap.forEach(doc => { data[doc.id] = { id: doc.id, ...doc.data() }; });
                                this.staff = data;
                                this.dataLoaded = true;
                                this.notify();
                            }, (err2) => {
                                console.error("Staff Sync Fallback Error:", err2);
                                this.isSubscribed = false;
                            });
                    } else {
                        console.error("Staff Sync Error:", error);
                        this.isSubscribed = false;
                    }
                });
        }, 1000);
    },

    onUpdate(callback) {
        this.callbacks.push(callback);
        if (this.dataLoaded) callback(this.staff);
    },

    notify() {
        this.callbacks.forEach(cb => cb(this.staff));
    }
};

// ─── Global Search Handler ──────────────────────────────────────────────────
function handleGlobalSearch(query) {
    const hash = window.location.hash;
    if (hash.startsWith('#students')) {
        if (window.studentDirectory) window.studentDirectory.handleSearch(query);
    } else if (hash.startsWith('#staff')) {
        if (window.staffDirectory) window.staffDirectory.handleSearch(query);
    }
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────
function formatName(str) {
    if (!str) return '';
    return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'N/A';
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
}

function parseInputDate(dateStr) {
    if (!dateStr || !dateStr.includes('-')) return dateStr || 'N/A';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
}

// ─── Utility: Copy to Clipboard ─────────────────────────────────────────────
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        AppDialog.toast('Copied to clipboard!', 'success');
    } catch (err) {
        console.error('Copy failed:', err);
    }
}

// ─── View Management ────────────────────────────────────────────────────────
function switchAppSubView(viewId, entityId = null) {
    const hash = window.location.hash.substring(1).split('/')[0];
    navigateTo(`${hash}/${viewId}${entityId ? '/' + entityId : ''}`);
}

window.closeSidebar = function () {
    document.querySelector('.app-wrapper.active .console-sidebar')?.classList.remove('open');
    document.querySelector('.app-wrapper.active .sidebar-overlay')?.classList.remove('active');
}

window.toggleSidebar = function () {
    document.querySelector('.app-wrapper.active .console-sidebar')?.classList.toggle('open');
    document.querySelector('.app-wrapper.active .sidebar-overlay')?.classList.toggle('active');
}

// ─── User Dropdown Logic ──────────────────────────────────────────────────
window.toggleUserDropdown = function (event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('user-dropdown');
    dropdown?.classList.toggle('show');
}

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
    const dropdown = document.getElementById('user-dropdown');
    const userPill = document.querySelector('.user-pill');

    if (dropdown?.classList.contains('show') &&
        !dropdown.contains(e.target) &&
        !userPill?.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

window.navigateTo = function (route, updateHash = true) {
    if (updateHash) window.location.hash = route;

    const parts = route.split('/');
    const mainRoute = parts[0];
    const subRoute = parts[1];

    document.getElementById('landing-view').classList.remove('active');
    document.querySelectorAll('.app-wrapper').forEach(el => el.classList.remove('active'));
    document.getElementById('user-dropdown').classList.remove('show');

    const userData = window.currentUserData || {};
    const perms = userData.permissions || {};
    const isAdmin = userData.isAdmin;

    // Student-role accounts are confined to the student portal
    if (userData.role === 'student' && mainRoute !== 'student-portal') {
        window.location.hash = 'student-portal';
        const app = document.getElementById('student-portal-app');
        if (app) app.classList.add('active');
        if (window.studentPortal) window.studentPortal.initialize();
        if (window.lucide) lucide.createIcons();
        return;
    }

    if (mainRoute === 'student-portal') {
        const app = document.getElementById('student-portal-app');
        if (app) app.classList.add('active');
        if (window.studentPortal) window.studentPortal.initialize();
        if (window.lucide) lucide.createIcons();
        return;
    }

    const hasModPerm = (mod) => {
        if (isAdmin) return true;
        const p = perms[mod];
        if (!p) return false;
        if (p === true) return true;
        return Object.values(p).some(v => v === true);
    };

    if (mainRoute === 'portal') {
        document.getElementById('landing-view').classList.add('active');
        renderPortalCards(userData);
    } else if (mainRoute === 'smart-campus') {
        if (hasModPerm('smart_campus')) {
            document.getElementById('smart-campus-app').classList.add('active');
            window.smartCampus.subscribe();
            if (subRoute) window.smartCampus.switchView(subRoute, parts[2]);
            else window.smartCampus.switchView('overview');
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'admin') {
        if (isAdmin) {
            document.getElementById('admin-app').classList.add('active');
            window.smartCampus.subscribe();
            window.smartCampus.currentView = 'admin';
            // Restore the last active tab from the URL, defaulting to 'entities'
            switchAdminView(subRoute || 'entities');
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'people') {
        if (hasModPerm('staff_directory') || hasModPerm('student_directory')) {
            document.getElementById('people-app').classList.add('active');
            window.staffDirectory.subscribe();
            window.studentDirectory.subscribe();
            const view = subRoute || 'preschool';
            if (window.staffDirectory.switchView) window.staffDirectory.switchView(view, parts[2]);
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'attendance') {
        if (hasModPerm('staff_directory') || hasModPerm('student_directory')) {
            document.getElementById('attendance-app').classList.add('active');
            window.attendancePanel.initialize();
            if (subRoute) window.attendancePanel.switchView(subRoute);
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'staff' || mainRoute === 'students') {
        // Legacy redirects
        window.location.hash = mainRoute === 'students' ? 'people/preschool' : 'people/staff';
    } else if (mainRoute === 'fees') {
        if (hasModPerm('fees_accounting')) {
            document.getElementById('fees-app').classList.add('active');
            if (window.feesManager && window.feesManager.resubscribe) {
                window.feesManager.resubscribe();
            } else if (window.feesManager) {
                window.feesManager.subscribe();
            }
            if (subRoute && window.feesManager.switchView) {
                window.feesManager.switchView(subRoute, parts[2]);
            } else if (window.feesManager) {
                const fp = perms.fees_accounting || {};
                if (isAdmin || fp === true || fp.view) window.feesManager.switchView('collections');
                else if (fp.ledger) window.feesManager.switchView('preschool_ledger');
                else if (fp.exp_all || fp.exp_own) window.feesManager.switchView('office_expenses');
                else if (fp.salaries_view) window.feesManager.switchView('salaries');
                else if (fp.wallet_view_own) window.feesManager.switchView('staff_wallets');
                else if (fp.config) window.feesManager.switchView('plans');
                else window.feesManager.switchView('collections');
            }
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'whatsapp') {
        if (hasModPerm('whatsapp_sender')) {
            const waApp = document.getElementById('whatsapp-app');
            if (waApp) {
                waApp.classList.add('active');
                if (window.whatsAppSender && window.whatsAppSender.initialize) {
                    window.whatsAppSender.initialize();
                }
            }

            if (subRoute && window.whatsAppSender && window.whatsAppSender.switchView) {
                window.whatsAppSender.switchView(subRoute);
            } else if (window.whatsAppSender) {
                window.whatsAppSender.switchView('chats');
            }
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    }

    if (window.innerWidth <= 1024) window.closeSidebar();
    lucide.createIcons();
}

function renderPortalCards(userData) {
    const perms = userData.permissions || {};
    const isAdmin = userData.isAdmin;

    const hasModPerm = (mod) => {
        if (isAdmin) return true;
        const p = perms[mod];
        if (!p) return false;
        if (p === true) return true;
        return Object.values(p).some(v => v === true);
    };

    const cards = [
        { id: 'card-smart-campus', access: hasModPerm('smart_campus') },
        { id: 'card-people', access: hasModPerm('staff_directory') || hasModPerm('student_directory') },
        { id: 'card-attendance', access: hasModPerm('staff_directory') || hasModPerm('student_directory') },
        { id: 'card-fees', access: hasModPerm('fees_accounting') },
        { id: 'card-admin', access: isAdmin },
        { id: 'card-whatsapp', access: hasModPerm('whatsapp_sender') }
    ];

    cards.forEach(card => {
        const el = document.getElementById(card.id);
        if (el) {
            if (card.access) el.classList.remove('disabled');
            else el.classList.add('disabled');
        }
    });
}

function getAreaIcon(name) {
    const lower = (name || '').toLowerCase();
    if (lower.includes('ground floor')) return 'home';
    if (lower.includes('first floor')) return 'layers';
    if (lower.includes('terrace')) return 'cloud';
    if (lower.includes('kitchen')) return 'utensils';
    if (lower.includes('auditorium')) return 'mic';
    if (lower.includes('reception')) return 'info';
    if (lower.includes('bathroom') || lower.includes('toilet')) return 'bath';
    if (lower.includes('office')) return 'briefcase';
    if (lower.includes('classroom')) return 'graduation-cap';
    if (lower.includes('library')) return 'book-open';
    if (lower.includes('gym')) return 'dumbbell';
    if (lower.includes('garden')) return 'tree-pine';
    if (lower.includes('gate') || lower.includes('security')) return 'shield';
    return 'box';
}
