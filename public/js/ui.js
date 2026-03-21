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
                if (typeof onConfirm === 'function') {
                    const result = await onConfirm();
                    if (result === false) return;
                }
                overlay.remove(); resolve(true);
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

    return { toast, alert, confirm };
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
function switchView(viewId, entityId = null) {
    const hash = window.location.hash.split('/')[0];
    navigateTo(`${hash.substring(1)}/${viewId}${entityId ? '/' + entityId : ''}`);
}

function closeSidebar() {
    document.querySelector('.console-sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('active');
}

function toggleSidebar() {
    document.querySelector('.console-sidebar')?.classList.toggle('open');
    document.querySelector('.sidebar-overlay')?.classList.toggle('active');
}

function navigateTo(route, updateHash = true) {
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

    if (mainRoute === 'portal') {
        document.getElementById('landing-view').classList.add('active');
        renderPortalCards(userData);
    } else if (mainRoute === 'smart-campus') {
        if (isAdmin || perms.smart_campus?.view || perms.smart_campus === true) {
            document.getElementById('smart-campus-app').classList.add('active');
            window.smartCampus.subscribe();
            if (subRoute) switchView(subRoute, parts[2]); 
            else switchView('overview');
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'admin') {
        if (isAdmin) {
            document.getElementById('admin-app').classList.add('active');
            window.smartCampus.subscribe();
            window.smartCampus.currentView = 'admin';
            window.adminPanel.render();
            window.adminPanel.renderUserManagement();
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'students') {
        if (isAdmin || perms.student_directory?.view || perms.student_directory === true) {
            document.getElementById('student-app').classList.add('active');
            window.studentDirectory.subscribe();
            if (subRoute && window.studentDirectory.switchView) window.studentDirectory.switchView(subRoute, parts[2]);
            else window.studentDirectory.render();
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'staff') {
        if (isAdmin || perms.staff_directory?.view || perms.staff_directory === true) {
            document.getElementById('staff-app').classList.add('active');
            window.staffDirectory.subscribe();
            if (subRoute && window.staffDirectory.switchView) window.staffDirectory.switchView(subRoute);
            else window.staffDirectory.render();
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'fees') {
        if (isAdmin || perms.fees_accounting?.view || perms.fees_accounting === true) {
            document.getElementById('fees-app').classList.add('active');
            window.feesManager.subscribe();
            if (subRoute && window.feesManager.switchView) window.feesManager.switchView(subRoute, parts[2]);
            else window.feesManager.switchView('collections');
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    } else if (mainRoute === 'whatsapp') {
        if (isAdmin || perms.whatsapp_sender?.access || perms.whatsapp_sender === true) {
            document.getElementById('wa-app-wrapper').classList.add('active');
            if (subRoute) window.whatsappMain.switchView(subRoute);
            else window.whatsappMain.switchView('broadcast');
        } else {
            AppDialog.toast('Access Denied', 'error');
            window.location.hash = 'portal';
        }
    }

    if (window.innerWidth <= 1024) closeSidebar();
    lucide.createIcons();
}
