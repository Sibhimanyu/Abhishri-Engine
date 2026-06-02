/**
 * Staff Directory Module
 * Replicated from Student Directory logic for architectural consistency
 */

window.staffDirectory = {
    staff: {},
    allowedUsers: {},
    pendingUsers: {},
    attendance: {},
    isSubscribed: false,
    dataLoaded: false,
    currentView: 'staff', // staff, preschool, tuition, report, student_report
    currentStudentId: null,
    studentWingFilter: 'all', // 'all' | 'preschool' | 'tuition'
    appContext: 'people',     // 'people' | 'attendance'
    _activeGroupFilter: null,
    _usersRendered: false,
    _groupsLoaded: false,

    _toolbar() {
        return document.getElementById(this.appContext === 'attendance' ? 'att-toolbar' : 'people-toolbar');
    },

    _setToolbar(html) {
        const t = this._toolbar();
        if (!t) return;
        // Skip rebuild if the user is actively typing inside this toolbar
        if (t.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
        t.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: t });
    },
    currentStaffId: null,
    searchQuery: '',
    selectedDate: new Date().toISOString().split('T')[0],
    reportType: 'daily', // daily, weekly, monthly
    currentPeopleFilter: 'all', // 'all' | 'staff' | 'students'

    setPeopleFilter(filter) {
        this.currentPeopleFilter = filter;
        this.renderDirectory();
    },

    setStudentWingFilter(wing) {
        this.studentWingFilter = wing;
        this.renderDirectory('people-content-students', 'students');
    },

    initialize() {
        // Any initial setup
    },

    subscribe() {
        if (this.isSubscribed) return;
        this.isSubscribed = true;

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const perms = userData.permissions?.staff_directory || {};
        const isMaster = isAdmin || perms === true;

        this.subscribeAllowedUsers();

        if (isMaster || perms.view || perms.add || perms.edit || perms.delete || perms.attendance_mark || perms.attendance_view || perms.attendance_self) {
            // Use Centralized Data Manager
            window.staffDataManager.subscribe();
            window.staffDataManager.onUpdate((data) => {
                this.staff = data;
                this.dataLoaded = true;
                this.render();
            });
        }

        // Subscribe to student data so the directory view can show students too
        if (!this._studentUpdateRegistered) {
            this._studentUpdateRegistered = true;
            window.studentDataManager.subscribe();
            window.studentDataManager.onUpdate(() => {
                if (this.currentView === 'directory') this.renderDirectory();
            });
        }

        // Initial attendance subscription
        this.subscribeToAttendance(this.selectedDate);
    },

    subscribeAllowedUsers() {
        if (this._allowedUsersUnsubscribe) this._allowedUsersUnsubscribe();
        this._allowedUsersUnsubscribe = firestore.collection('allowedUsers').onSnapshot(snap => {
            const users = {};
            snap.forEach(doc => users[doc.id] = { id: doc.id, ...doc.data() });
            this.allowedUsers = users;
            this.render();
            // Refresh admin users panel if it's open
            const adminUsersPanel = document.getElementById('admin-content-users');
            if (adminUsersPanel?.classList.contains('active')) {
                this._usersRendered = false;
                this._renderUsersContent(document.getElementById('users-panel-root'));
            }
        }, err => console.warn("Staff: Allowed Users sync failed", err));

        if (this._pendingUsersUnsubscribe) this._pendingUsersUnsubscribe();
        this._pendingUsersUnsubscribe = firestore.collection('pendingUsers').onSnapshot(snap => {
            const pending = {};
            snap.forEach(doc => pending[doc.id] = { id: doc.id, ...doc.data() });
            this.pendingUsers = pending;
            const adminPanel = document.getElementById('admin-content-users');
            if (adminPanel?.classList.contains('active')) {
                this._usersRendered = false;
                this._renderUsersContent(document.getElementById('users-panel-root'));
            }
        }, () => {});
    },

    subscribeToAttendance(dateKey) {
        if (this.attendanceRef) {
            this.attendanceRef.off();
        }

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const perms = userData.permissions?.staff_directory || {};
        const isMaster = isAdmin || perms === true;
        const canSelfAttend = isMaster || !!perms.attendance_self || !!this.getOwnStaffId();

        if (isMaster || perms.attendance_mark || perms.attendance_view || perms.attendance_self || canSelfAttend) {
            this.attendanceRef = db.ref(`modules/staff_directory/attendance/${dateKey}`);
            this.attendanceRef.on('value', (snapshot) => {
                this.attendance = snapshot.val() || {};
                if (this.currentView === 'attendance') {
                    this.renderAttendance();
                } else if (this.currentView === 'attendance_reports') {
                    this.renderAttendanceReports();
                }
            });
        }
    },

    handleDateChange(date) {
        this.selectedDate = date;
        this.subscribeToAttendance(date);
        if (this.currentView === 'attendance_reports') {
            this.renderAttendanceReports();
        }
    },

    switchView(viewName, id = null) {
        if (viewName === 'student_report') {
            this.currentStudentId = id;
        } else {
            this.currentStaffId = id;
        }
        this.currentView = viewName;

        let hash = `people/${viewName}`;
        if (id) hash += `/${id}`;
        if (window.location.hash !== `#${hash}`) window.location.hash = hash;

        document.querySelectorAll('#sidebar-nav-people .nav-item').forEach(el => el.classList.remove('active'));
        // report/student_report highlight their parent tab
        const navKey = (viewName === 'report') ? 'staff'
            : (viewName === 'student_report') ? (this.studentWingFilter === 'tuition' ? 'tuition' : 'preschool')
            : viewName;
        const activeNav = document.getElementById(`nav-people-${navKey}`);
        if (activeNav) activeNav.classList.add('active');

        document.querySelectorAll('.people-subview').forEach(el => el.style.display = 'none');
        const activeView = document.getElementById(`people-view-${viewName}`);
        if (activeView) activeView.style.display = 'block';

        this.render();
        if (typeof closeSidebar === 'function') closeSidebar();
    },

    async render() {
        const hash = window.location.hash.replace('#', '');
        if (!hash.startsWith('people')) return;

        const parts = hash.split('/');
        if (parts.length >= 2) this.currentView = parts[1];
        if (this.currentView === 'student_report') {
            if (parts.length >= 3) this.currentStudentId = parts[2];
        } else {
            if (parts.length >= 3) this.currentStaffId = parts[2];
        }

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const staffPerms = userData.permissions?.staff_directory || {};
        const isMaster = isAdmin === true;

        const container = document.getElementById('people-content');
        if (!container) return;


        const subtitle = document.getElementById('people-screen-subtitle');
        if (subtitle) {
            if (this.currentView === 'report' && this.currentStaffId) {
                const s = this.staff[this.currentStaffId];
                subtitle.innerText = s ? `Profile — ${s.name}` : 'Staff Profile';
            } else if (this.currentView === 'student_report' && this.currentStudentId) {
                const s = window.studentDataManager?.students?.[this.currentStudentId];
                subtitle.innerText = s ? `Profile — ${s.name}` : 'Student Profile';
            } else if (this.currentView === 'staff') {
                const staffCount = Object.keys(this.allowedUsers).filter(e => (this.allowedUsers[e]?.role || 'staff') !== 'student').length;
                subtitle.innerText = `${staffCount} members`;
            } else if (this.currentView === 'preschool') {
                const count = Object.values(window.studentDataManager?.students || {}).filter(s => (s.studentType || 'preschool') === 'preschool').length;
                subtitle.innerText = `${count} enrolled in Preschool`;
            } else if (this.currentView === 'tuition') {
                const count = Object.values(window.studentDataManager?.students || {}).filter(s => s.studentType === 'tuition').length;
                subtitle.innerText = `${count} enrolled in Tuition`;
            }
        }

        const setNavVisible = (id, visible) => {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? 'flex' : 'none';
        };

        const canSeeStudents = isMaster || userData.permissions?.student_directory?.view || userData.permissions?.student_directory?.add;
        setNavVisible('nav-people-staff',     isMaster || staffPerms.view || staffPerms.add || staffPerms.edit);
        setNavVisible('nav-people-preschool', canSeeStudents);
        setNavVisible('nav-people-tuition',   canSeeStudents);

        const toolbar = this._toolbar();
        // Don't clear toolbar if the user is actively typing in it — that would destroy the input and kill focus
        if (toolbar && !(toolbar.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) {
            toolbar.innerHTML = '';
        }

        if (this.currentView === 'staff') {
            this.renderDirectory('people-content-staff', 'staff');
        } else if (this.currentView === 'preschool') {
            this.studentWingFilter = 'preschool';
            this.renderDirectory('people-content-preschool', 'students');
        } else if (this.currentView === 'tuition') {
            this.studentWingFilter = 'tuition';
            this.renderDirectory('people-content-tuition', 'students');
        } else if (this.currentView === 'student_report') {
            await window.studentDirectory.renderReport(this.currentStudentId);
        } else if (this.currentView === 'report') {
            await this.renderReport(this.currentStaffId);
        }

        const content = document.getElementById('people-content');
        if (content) {
            content.style.animation = 'none';
            content.offsetHeight;
            content.style.animation = 'fadeIn 0.5s ease-out';
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    handleSearch(query) {
        this.searchQuery = query;
        // In attendance context render() would bail (wrong hash) — call directly instead
        if (this.appContext === 'attendance') {
            this.renderAttendance();
        } else {
            this.render();
        }
    },

    getOwnStaffId() {
        const email = auth.currentUser?.email?.toLowerCase();
        if (!email) return null;
        return Object.keys(this.staff).find(id => (this.staff[id].email || '').toLowerCase() === email) || null;
    },

    SUPER_ADMIN_EMAIL: 'sibhi.gv@gmail.com',

    // ── Module schema — defines human-readable labels for all permission actions ──
    MODULE_SCHEMA: {
        smart_campus: {
            label: 'Smart Campus', icon: 'home',
            actions: {
                view:    'View campus dashboard',
                control: 'Control devices (lights, fans)',
                scenes:  'Create & manage scenes'
            }
        },
        student_directory: {
            label: 'Students', icon: 'graduation-cap',
            actions: {
                view:             'Browse & search student records',
                add:              'Add new student',
                edit:             'Edit student data',
                delete:           'Delete student records',
                attendance_mark:  'Mark student attendance',
                attendance_view:  'View attendance reports'
            }
        },
        staff_directory: {
            label: 'Staff & Profiles', icon: 'briefcase',
            actions: {
                view:             'Browse staff profiles',
                add:              'Create new staff profile',
                edit:             'Edit staff profiles',
                delete:           'Remove staff profiles',
                attendance_self:  'Self check-in (own attendance only)',
                attendance_mark:  'Mark attendance for all staff',
                attendance_view:  'View staff attendance reports'
            }
        },
        fees_accounting: {
            label: 'Fees & Accounting', icon: 'wallet',
            actions: {
                view:             'Revenue dashboard & income insights',
                ledger:           'View student fee ledgers',
                trans_add:        'Record fee payments',
                trans_delete:     'Reverse / delete payments',
                config:           'Configure fee plan templates',
                exp_own:          'Log own office expenses',
                exp_all:          'View & manage all expenses',
                wallet_view_own:  'View own wallet balance',
                wallet_edit_own:  'Manage own wallet entries',
                salaries_view:    'View payroll & salaries',
                salaries_process: 'Process & disburse payroll'
            }
        },
        whatsapp_sender: {
            label: 'WhatsApp', icon: 'message-circle',
            actions: {
                access:    'View chats & send direct messages',
                broadcast: 'Send mass broadcasts (independent of chats)',
                manage:    'Manage contact lists, templates & history',
                config:    'API configuration & credentials'
            }
        }
    },

    // ── Permission group definitions ─────────────────────────────────────────
    // ── Permission groups — single source of truth for what each role can do ──
    PERMISSION_GROUPS: [
        {
            id: 'superadmin',
            name: 'Super Admin',
            description: 'Unrestricted system control. Protected — cannot be modified or removed.',
            color: '#f59e0b',
            icon: 'crown',
            isAdmin: true,
            isSuperAdmin: true,
            permissions: {}
        },
        {
            id: 'admin',
            name: 'Admin',
            description: 'Full access to all modules and user management.',
            color: '#f43f5e',
            icon: 'shield',
            isAdmin: true,
            permissions: {}
        },
        {
            id: 'manager',
            name: 'Manager',
            description: 'Oversees students, staff, fees and communications.',
            color: '#73c7c8',
            icon: 'briefcase',
            isAdmin: false,
            permissions: {
                smart_campus:      { view: true,  control: true,  scenes: true  },
                student_directory: { view: true,  add: true,  edit: true,  delete: false, attendance_mark: true,  attendance_view: true  },
                staff_directory:   { view: true,  add: false, edit: false, delete: false, attendance_mark: true,  attendance_view: true,  attendance_self: true },
                fees_accounting:   { view: true,  ledger: true, trans_add: true, trans_delete: false, config: false, exp_own: true, exp_all: true, salaries_view: true, salaries_process: false },
                whatsapp_sender:   { access: true, broadcast: true, manage: false }
            }
        },
        {
            id: 'class_teacher',
            name: 'Class Teacher',
            description: 'Marks attendance and views student records.',
            color: '#a78bfa',
            icon: 'users',
            isAdmin: false,
            permissions: {
                smart_campus:      { view: true,  control: false, scenes: false },
                student_directory: { view: true,  add: false, edit: false, delete: false, attendance_mark: true, attendance_view: true },
                staff_directory:   { view: false, attendance_self: true },
                fees_accounting:   { exp_own: true },
                whatsapp_sender:   { access: true, broadcast: false, manage: false }
            }
        },
        {
            id: 'receptionist',
            name: 'Receptionist',
            description: 'Front-desk communications and directory lookups.',
            color: '#fb923c',
            icon: 'phone-call',
            isAdmin: false,
            permissions: {
                student_directory: { view: true },
                staff_directory:   { view: true, attendance_self: true },
                whatsapp_sender:   { access: true, broadcast: true, manage: false }
            }
        },
        {
            id: 'accountant',
            name: 'Accountant',
            description: 'Full fees, payroll and expense access.',
            color: '#fbbf24',
            icon: 'landmark',
            isAdmin: false,
            permissions: {
                student_directory: { view: true },
                fees_accounting:   { view: true, ledger: true, trans_add: true, trans_delete: true, config: true, exp_own: true, exp_all: true, salaries_view: true, salaries_process: true }
            }
        },
        {
            id: 'tuition_student',
            name: 'Tuition Student',
            description: 'Tuition students — personal dashboard with attendance and fees.',
            color: '#fbbf24',
            icon: 'book-open',
            isAdmin: false,
            isStudent: true,
            dashboardType: 'student',
            permissions: {}
        },
        {
            id: 'parent',
            name: 'Parent',
            description: 'Preschool parents — child\'s attendance and fees summary.',
            color: '#34d399',
            icon: 'heart',
            isAdmin: false,
            isStudent: true,
            dashboardType: 'parent',
            permissions: {}
        }
    ],

    _getGroupForUser(data, email) {
        if (!data) return null;
        if (email && this._isSuperAdmin(email)) return 'superadmin';
        if (data.permissionGroup) {
            // Migrate legacy 'student' group to the right new group based on dashboardType
            if (data.permissionGroup === 'student') return data.dashboardType === 'student' ? 'tuition_student' : 'parent';
            return data.permissionGroup;
        }
        if (data.isAdmin) return 'admin';
        // Infer from role + dashboardType for old entries without permissionGroup
        if (data.role === 'student') return data.dashboardType === 'student' ? 'tuition_student' : 'parent';
        return null;
    },

    _isSuperAdmin(email) {
        return (email || '').toLowerCase() === this.SUPER_ADMIN_EMAIL.toLowerCase();
    },

    async syncAllStaffLogins() {
        const all = Object.values(this.staff);
        AppDialog.toast(`Syncing logins for ${all.length} staff profiles…`, 'info');
        let created = 0;
        for (const s of all) {
            if (s.email) {
                const existing = this.allowedUsers[s.email.toLowerCase()];
                if (!existing) { await this._provisionStaffLogin(s.email, s.name, s.designation); created++; }
            }
        }
        AppDialog.toast(created > 0 ? `${created} login${created>1?'s':''} created` : 'All staff already have logins', 'success');
    },

    async _provisionStaffLogin(email, name, designation) {
        if (!email || this._isSuperAdmin(email)) return;
        try {
            const existing = await firestore.collection('allowedUsers').doc(email).get();
            if (existing.exists) return;
            const g = this.PERMISSION_GROUPS.find(g => g.id === 'class_teacher');
            await firestore.collection('allowedUsers').doc(email).set({
                email, isAdmin: false, role: 'staff',
                permissions: g?.permissions || {},
                permissionGroup: 'class_teacher',
                displayName: name || email.split('@')[0],
                addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                addedBy: 'system_staff_profile'
            });
        } catch (e) { console.warn('Could not auto-provision staff login:', e?.message); }
    },

    async assignUserGroup(email, groupId) {
        if (this._isSuperAdmin(email)) { AppDialog.toast('Super Admin permissions are protected.', 'error'); return; }
        if (groupId === 'superadmin' && !this._isSuperAdmin(email)) { AppDialog.toast('Super Admin group is reserved.', 'error'); return; }
        const group = this.PERMISSION_GROUPS.find(g => g.id === groupId);
        if (!group) return;
        const update = {
            isAdmin: !!group.isAdmin,
            role: group.isStudent ? 'student' : 'staff',
            permissions: group.permissions,
            permissionGroup: groupId,
            ...(group.dashboardType ? { dashboardType: group.dashboardType } : {})
        };
        try {
            const ref = firestore.collection('allowedUsers').doc(email);
            const doc = await ref.get();
            if (doc.exists) { await ref.update(update); }
            else { await ref.set({ email, addedBy: auth.currentUser?.email || 'admin', addedAt: firebase.firestore.FieldValue.serverTimestamp(), ...update }); }
            window.AppLogger?.log('ASSIGN_PERMISSION_GROUP', 'admin_panel', { email, group: groupId });
            AppDialog.toast(group.name + ' applied to ' + email.split('@')[0], 'success');
        } catch (e) {
            AppDialog.toast('Could not update permissions: ' + (e?.message || e), 'error');
            console.error('assignUserGroup error:', e);
        }
    },

    _buildPeopleIndex() {
        const people = {};
        Object.values(this.staff || {}).forEach(s => {
            if (!s.email) return;
            const e = s.email.toLowerCase();
            people[e] = { type: 'staff', name: s.name, email: e, designation: s.designation, photoURL: null };
        });
        Object.entries(this.allowedUsers).forEach(([email, data]) => {
            if (!people[email]) people[email] = { type: data.role === 'student' ? 'student' : 'staff', name: data.displayName || email.split('@')[0], email, designation: null, photoURL: data.photoURL || null };
            else people[email].photoURL = data.photoURL || null;
        });
        const allStudents = window.studentDataManager?.students || {};
        Object.values(allStudents).forEach(s => {
            [s.studentEmail, s.motherEmail, s.fatherEmail].filter(Boolean).forEach(raw => {
                const e = raw.toLowerCase();
                if (!people[e]) people[e] = { type: 'student', name: s.name, email: e, designation: s.studentType === 'tuition' ? 'Tuition' : 'Preschool', photoURL: null };
            });
        });
        return people;
    },

    async renderUsers() {
        const root = document.getElementById('users-panel-root');
        if (!root) return;

        // Load persisted group customisations from Firestore (first time only)
        if (!this._groupsLoaded) {
            this._groupsLoaded = true;
            await this._loadPermissionGroups();
        }

        if (Object.keys(this.allowedUsers).length === 0 && !this._usersRendered) {
            root.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 0;gap:16px;opacity:0.6;"><div class="loading-spinner"></div><p style="font-weight:600;color:var(--text-dim);letter-spacing:1px;">Loading\u2026</p></div>';
            if (!this.isSubscribed) this.subscribe();
            firestore.collection('allowedUsers').get().then(snap => {
                snap.forEach(doc => { this.allowedUsers[doc.id] = { id: doc.id, ...doc.data() }; });
                this._usersRendered = false;
                this._renderUsersContent(root);
            }).catch(() => this._renderUsersContent(root));
            return;
        }
        this._renderUsersContent(root);
    },

    _renderUsersContent(root) {
        if (!root) root = document.getElementById('users-panel-root');
        if (!root) return;
        this._usersRendered = true;

        const GROUPS = this.PERMISSION_GROUPS;
        const groupMap = Object.fromEntries(GROUPS.map(g => [g.id, g]));
        const moduleIcons = { smart_campus:'home', student_directory:'graduation-cap', staff_directory:'briefcase', fees_accounting:'wallet', whatsapp_sender:'message-circle' };
        const activeGroup = this._activeGroupFilter;

        // Count members
        const counts = Object.fromEntries(GROUPS.map(g => [g.id, 0]));
        Object.entries(this.allowedUsers).forEach(([email, data]) => {
            const gid = this._getGroupForUser(data, email);
            if (gid && counts[gid] !== undefined) counts[gid]++;
        });

        // Group cards
        const cards = GROUPS.map(g => {
            const isActive = activeGroup === g.id;
            const modList = g.isAdmin ? Object.keys(moduleIcons) : Object.keys(g.permissions || {}).filter(m => { const p = g.permissions[m]; return p === true || (p && Object.values(p).some(Boolean)); });
            const modIcons = modList.map(m => `<i data-lucide="${moduleIcons[m]}" style="width:12px;height:12px;opacity:0.6;" title="${m.replace(/_/g,' ')}"></i>`).join('');
            const avatars = Object.entries(this.allowedUsers).filter(([e,d]) => this._getGroupForUser(d,e) === g.id).slice(0,4)
                .map(([e,d]) => d.photoURL
                    ? `<img src="${d.photoURL}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;border:2px solid var(--surface);margin-right:-5px;">`
                    : `<div style="width:22px;height:22px;border-radius:50%;background:${g.color}33;color:${g.color};display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:800;border:2px solid var(--surface);margin-right:-5px;">${(d.displayName||e)[0].toUpperCase()}</div>`
                ).join('');
            return `<div data-group-card="${g.id}" onclick="window.staffDirectory._toggleGroupFilter('${g.id}')" style="background:${isActive?g.color+'11':'rgba(255,255,255,0.02)'};border:2px solid ${isActive?g.color:'var(--card-border)'};border-radius:18px;padding:18px 20px;cursor:pointer;transition:all 0.2s;flex:1;min-width:140px;max-width:200px;opacity:${!activeGroup||isActive?1:0.45};transform:${isActive?'scale(1.02)':'scale(1)'}">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <div style="width:36px;height:36px;border-radius:10px;background:${g.color}22;display:flex;align-items:center;justify-content:center;color:${g.color};flex-shrink:0;"><i data-lucide="${g.icon}" style="width:18px;height:18px;"></i></div>
                    <div>
                        <div style="font-weight:800;font-size:0.9rem;color:${isActive?g.color:'var(--text-main)'};">${g.name}</div>
                        <div style="font-size:0.68rem;color:var(--text-dim);margin-top:2px;font-weight:600;">${counts[g.id]||0} member${(counts[g.id]||0)!==1?'s':''}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;">${avatars}</div>
                    <div style="display:flex;gap:4px;color:var(--text-dim);opacity:0.7;">${modIcons}</div>
                </div>
            </div>`;
        }).join('');

        // Group select options (exclude superadmin — it's fixed)
        const groupOpts = GROUPS.filter(g => !g.isSuperAdmin).map(g => `<option value="${g.id}">${g.name}</option>`).join('');

        // Build lookup maps for resolving real names
        const allStudents = window.studentDataManager?.students || {};
        const staffByEmail = {};
        Object.values(this.staff || {}).forEach(s => { if (s.email) staffByEmail[s.email.toLowerCase()] = s; });

        const studentByEmail = {};
        Object.values(allStudents).forEach(s => {
            [s.studentEmail, s.motherEmail, s.fatherEmail].filter(Boolean).forEach(e => {
                studentByEmail[e.toLowerCase()] = s;
            });
        });

        const resolvedName = (email, data) => {
            // Staff profile takes priority
            const staffProfile = staffByEmail[email];
            if (staffProfile?.name) return { name: staffProfile.name, sub: staffProfile.designation || '' };

            // For student/parent accounts look up the linked student record
            if (data.role === 'student') {
                const linkedStudent = data.linkedStudentId
                    ? allStudents[data.linkedStudentId]
                    : studentByEmail[email];
                if (linkedStudent) {
                    if (data.dashboardType === 'student') {
                        return { name: linkedStudent.name, sub: 'Tuition Student' + (linkedStudent.admissionForClass ? ' \u00b7 ' + linkedStudent.admissionForClass : '') };
                    } else {
                        // Parent \u2014 work out relationship
                        const rel = linkedStudent.studentEmail === email ? 'Student'
                            : linkedStudent.motherEmail === email ? 'Mother'
                            : linkedStudent.fatherEmail === email ? 'Father'
                            : 'Parent';
                        return { name: linkedStudent.name, sub: rel + ' \u00b7 ' + (linkedStudent.studentType === 'tuition' ? 'Tuition' : 'Preschool') };
                    }
                }
            }

            // Fallback: displayName or email prefix
            return { name: data.displayName || email.split('@')[0], sub: '' };
        };

        // Build rows
        const allRows = [];
        Object.entries(this.allowedUsers).sort(([ea, da], [eb, db]) => {
            if (this._isSuperAdmin(ea)) return -1;
            if (this._isSuperAdmin(eb)) return 1;
            const na = resolvedName(ea, da).name;
            const nb = resolvedName(eb, db).name;
            return na.localeCompare(nb);
        }).forEach(([email, data]) => {
            const gid = this._getGroupForUser(data, email);
            const group = groupMap[gid] || null;
            const isSA = this._isSuperAdmin(email);
            const { name, sub } = resolvedName(email, data);
            const status = data.lastSignIn ? 'Active' : 'Invited';
            const statusColor = data.lastSignIn ? 'var(--success)' : '#fbbf24';
            const avatarHtml = data.photoURL
                ? `<img src="${data.photoURL}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;${isSA?'border:2px solid #f59e0b;':''}">`
                : `<div style="width:34px;height:34px;border-radius:50%;background:${isSA?'rgba(245,158,11,0.2)':group?group.color+'22':'rgba(255,255,255,0.06)'};color:${isSA?'#f59e0b':group?group.color:'var(--text-dim)'};display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:800;flex-shrink:0;${isSA?'border:2px solid #f59e0b;':''}">${name[0].toUpperCase()}</div>`;
            const groupCell = isSA
                ? `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(245,158,11,0.12);color:#f59e0b;padding:4px 10px;border-radius:8px;font-size:0.75rem;font-weight:800;"><i data-lucide="crown" style="width:11px;height:11px;"></i> Super Admin</span>`
                : `<select onchange="window.staffDirectory._onGroupChange(this,'${email}')" style="background:${group?group.color+'11':'rgba(255,255,255,0.04)'};border:1.5px solid ${group?group.color:'rgba(255,255,255,0.1)'};border-radius:10px;color:var(--text-main);padding:6px 10px;font-size:0.8rem;font-weight:700;cursor:pointer;min-width:140px;">${!gid?'<option value="" disabled selected style="opacity:0.5">Assign group\u2026</option>':''}${groupOpts.replace('value="'+gid+'"','value="'+gid+'" selected')}</select>`;
            const actions = isSA ? '' : `<button class="btn-icon btn-icon-danger" title="Remove" onclick="window.staffDirectory._removePerson('${email}')"><i data-lucide="user-minus"></i></button>`;
            const matchesFilter = !activeGroup || gid === activeGroup;
            allRows.push(`<tr data-email="${email}" data-name="${name.toLowerCase()}" data-group="${gid||''}" style="${matchesFilter?'':'display:none'}"><td><div style="display:flex;align-items:center;gap:12px;">${avatarHtml}<div><div style="font-weight:700;font-size:0.9rem;">${name}${isSA?'<span style=\"background:rgba(245,158,11,0.12);color:#f59e0b;padding:2px 8px;border-radius:6px;font-size:0.65rem;font-weight:800;margin-left:6px;\">SUPER ADMIN</span>':''}</div>${sub?`<div style="font-size:0.7rem;color:var(--accent-secondary);font-weight:600;margin-top:1px;">${sub}</div>`:''}
<div style="font-size:0.72rem;color:var(--text-dim);">${email}</div></div></div></td><td>${groupCell}</td><td><span style="font-size:0.75rem;font-weight:700;color:${statusColor};">${status}</span></td><td style="text-align:right;">${actions}</td></tr>`);
        });

        // Pending rows
        Object.entries(this.pendingUsers).filter(([e]) => !this.allowedUsers[e]).forEach(([email, data]) => {
            const name = data.displayName || email.split('@')[0];
            const groupCell = `<select onchange="window.staffDirectory._onGroupChange(this,'${email}')" style="background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,0.1);border-radius:10px;color:var(--text-main);padding:6px 10px;font-size:0.8rem;font-weight:700;cursor:pointer;min-width:140px;"><option value="" disabled selected style="opacity:0.5">Assign group\u2026</option>${groupOpts}</select>`;
            if (!activeGroup) allRows.push(`<tr data-email="${email}" data-name="${name.toLowerCase()}" data-group=""><td><div style="display:flex;align-items:center;gap:12px;"><div style="width:34px;height:34px;border-radius:50%;background:rgba(232,105,102,0.15);color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:800;flex-shrink:0;">${name[0].toUpperCase()}</div><div><div style="font-weight:700;font-size:0.9rem;">${name} <span style="font-size:0.68rem;background:rgba(232,105,102,0.12);color:var(--accent-primary);padding:2px 8px;border-radius:6px;font-weight:700;margin-left:4px;">Pending</span></div><div style="font-size:0.73rem;color:var(--text-dim);">${email}</div></div></div></td><td>${groupCell}</td><td><span style="font-size:0.75rem;font-weight:700;color:var(--accent-primary);">Pending</span></td><td style="text-align:right;"><button class="btn-icon btn-icon-danger" onclick="window.staffDirectory._dismissPending('${email}')"><i data-lucide="x"></i></button></td></tr>`);
        });

        const prevSearch = document.getElementById('up-search')?.value || '';
        const activeGroupObj = activeGroup ? groupMap[activeGroup] : null;

        const groupFilterOpts = '<option value="">All Groups</option>' +
            GROUPS.map(g => `<option value="${g.id}" ${activeGroup === g.id ? 'selected' : ''}>${g.name} (${counts[g.id]||0})</option>`).join('');

        root.innerHTML = `<style>#up-people-table tr:hover td{background:rgba(255,255,255,0.02)}#up-people-table select:focus{outline:none}</style>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
                <div class="search-box" style="flex:1;min-width:180px;">
                    <i data-lucide="search"></i>
                    <input type="text" id="up-search" placeholder="Search by name or email…" value="${prevSearch}" oninput="window.staffDirectory._filterPeopleTable(this.value)">
                    <button class="search-clear" onclick="window.staffDirectory._filterPeopleTable('');this.previousElementSibling.value='';">×</button>
                </div>
                <select id="up-group-filter" onchange="window.staffDirectory._toggleGroupFilter(this.value||null)"
                    style="background:${activeGroup ? (activeGroupObj?.color||'#fff')+'18' : 'rgba(255,255,255,0.05)'};border:1.5px solid ${activeGroup ? (activeGroupObj?.color||'var(--accent-secondary)') : 'var(--card-border)'};border-radius:10px;color:var(--text-main);padding:8px 12px;font-size:0.82rem;font-weight:700;cursor:pointer;min-width:170px;">
                    ${groupFilterOpts}
                </select>
                <button class="btn btn-secondary" onclick="window.staffDirectory._showManageGroupsPanel()" title="Edit permission groups">
                    <i data-lucide="settings-2"></i> Edit Groups
                </button>
                <button class="btn btn-primary" onclick="window.staffDirectory._showAddPersonDialog()">
                    <i data-lucide="user-plus"></i> Add Person
                </button>
            </div>
            <div style="overflow-x:auto;">
                <table class="console-table" id="up-people-table">
                    <thead><tr>
                        <th>Person</th>
                        <th>Permission Group</th>
                        <th>Status</th>
                        <th style="text-align:right;width:48px;" data-no-sort></th>
                    </tr></thead>
                    <tbody>${allRows.join('') || '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-dim);">No users yet.</td></tr>'}</tbody>
                </table>
            </div>`;

        if (window.lucide) lucide.createIcons({ root });
        if (prevSearch) this._filterPeopleTable(prevSearch);
    },

    _toggleGroupFilter(groupId) {
        this._activeGroupFilter = groupId || null;

        // Update dropdown colour
        const sel = document.getElementById('up-group-filter');
        const g = this._activeGroupFilter ? this.PERMISSION_GROUPS.find(x => x.id === this._activeGroupFilter) : null;
        if (sel) {
            sel.style.background = g ? g.color + '18' : 'rgba(255,255,255,0.05)';
            sel.style.borderColor = g ? g.color : 'var(--card-border)';
        }

        // Rebuild the tbody to apply filter — more reliable than toggling display on existing rows
        this._usersRendered = false;
        const root = document.getElementById('users-panel-root');
        const scrollTop = root?.scrollTop || document.getElementById('admin-content-users')?.scrollTop || 0;
        this._renderUsersContent(root);
        // Restore scroll position after re-render so page doesn't jump
        requestAnimationFrame(() => {
            const container = document.getElementById('admin-content-users');
            if (container) container.scrollTop = scrollTop;
        });
    },


    async _onGroupChange(select, email) {
        const groupId = select.value;
        if (!groupId) return;
        select.disabled = true;
        await this.assignUserGroup(email, groupId);
        select.disabled = false;
    },

    async _removePerson(email) {
        if (this._isSuperAdmin(email)) { AppDialog.toast('Super Admin is protected.', 'error'); return; }
        AppDialog.confirm({ title: 'Remove Access', msg: 'Revoke login access for ' + email + '?', danger: true, onConfirm: async () => {
            await firestore.collection('allowedUsers').doc(email).delete().catch(() => {});
            firestore.collection('pendingUsers').doc(email).delete().catch(() => {});
            AppDialog.toast(email + ' removed', 'info');
            return true;
        }});
    },

    async _dismissPending(email) {
        await firestore.collection('pendingUsers').doc(email).delete().catch(() => {});
    },

    _filterPeopleTable(query) {
        const q = (query || '').toLowerCase();
        document.querySelectorAll('#up-people-table tbody tr').forEach(tr => {
            const email = (tr.getAttribute('data-email') || '').toLowerCase();
            const name  = (tr.getAttribute('data-name')  || '').toLowerCase();
            const matchSearch = !q || email.includes(q) || name.includes(q);
            const matchGroup  = !this._activeGroupFilter || tr.getAttribute('data-group') === this._activeGroupFilter;
            tr.style.display = matchSearch && matchGroup ? '' : 'none';
        });
    },

    _showAddPersonDialog() {
        const people = this._buildPeopleIndex();
        const known = new Set(Object.keys(this.allowedUsers));
        const candidates = Object.values(people).filter(p => !known.has(p.email)).sort((a,b) => (a.name||'').localeCompare(b.name||''));
        const groupOpts = this.PERMISSION_GROUPS.filter(g => !g.isSuperAdmin).map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        const listHtml = candidates.length
            ? candidates.map(p => `<label style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;cursor:pointer;"><input type="checkbox" class="add-person-check" value="${p.email}" style="width:16px;height:16px;accent-color:var(--accent-secondary);"><div><div style="font-weight:700;font-size:0.88rem;">${p.name}</div><div style="font-size:0.73rem;color:var(--text-dim);">${p.email} \u00b7 ${p.designation||(p.type==='student'?'Student':'Staff')}</div></div></label>`).join('')
            : '<div style="text-align:center;padding:30px;color:var(--text-dim);">Everyone already has an account.</div>';
        AppDialog.confirm({
            title: 'Add Person',
            width: '520px',
            content: `<div style="margin-bottom:14px;"><label style="font-size:0.75rem;font-weight:700;color:var(--text-dim);display:block;margin-bottom:6px;">Permission Group</label><select id="add-person-group" class="form-control"><option value="" disabled selected>Select group\u2026</option>${groupOpts}</select></div><div class="search-box" style="margin-bottom:10px;"><i data-lucide="search"></i><input type="text" placeholder="Search\u2026" oninput="(function(q){document.querySelectorAll('#add-person-list label').forEach(l=>{l.style.display=l.innerText.toLowerCase().includes(q.toLowerCase())?'':'none'})})(this.value)"></div><div id="add-person-list" style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">${listHtml}</div>`,
            onOpen: el => { if (window.lucide) lucide.createIcons({ root: el }); },
            confirmLabel: 'Grant Access',
            onConfirm: async () => {
                const groupId = document.getElementById('add-person-group')?.value;
                if (!groupId) { AppDialog.toast('Select a group first', 'error'); return false; }
                const selected = [...document.querySelectorAll('.add-person-check:checked')].map(c => c.value);
                if (selected.length === 0) { AppDialog.toast('Select at least one person', 'error'); return false; }
                for (const email of selected) await this.assignUserGroup(email, groupId);
                AppDialog.toast(selected.length + ' person' + (selected.length>1?'s':'') + ' added', 'success');
                return true;
            }
        });
    },

    _filterUsersTable(query) { this._filterPeopleTable(query); },

    // ── Permission group management ───────────────────────────────────────────

    // Load groups from Firestore, falling back to hardcoded defaults
    async _loadPermissionGroups() {
        try {
            const snap = await firestore.collection('permissionGroups').get();
            if (!snap.empty) {
                const overrides = {};
                snap.forEach(doc => { overrides[doc.id] = { id: doc.id, ...doc.data() }; });
                this.PERMISSION_GROUPS = this.PERMISSION_GROUPS.map(g => overrides[g.id] ? { ...g, ...overrides[g.id] } : g);
                // Add any custom groups not in the hardcoded list
                snap.forEach(doc => {
                    if (!this.PERMISSION_GROUPS.find(g => g.id === doc.id)) {
                        this.PERMISSION_GROUPS.push({ id: doc.id, ...doc.data() });
                    }
                });
            }
        } catch (e) { console.warn('Could not load permission groups from Firestore:', e?.message); }
    },

    // Save a group to Firestore and update all users that belong to it
    async savePermissionGroup(groupId, updates) {
        if (this._isSuperAdmin(null) === false && groupId === 'superadmin') return;
        try {
            await firestore.collection('permissionGroups').doc(groupId).set(updates, { merge: true });
            // Update in-memory group
            const idx = this.PERMISSION_GROUPS.findIndex(g => g.id === groupId);
            if (idx >= 0) this.PERMISSION_GROUPS[idx] = { ...this.PERMISSION_GROUPS[idx], ...updates };

            // Propagate new permissions to every user in this group
            const group = this.PERMISSION_GROUPS.find(g => g.id === groupId);
            if (!group) return;
            const batch = firestore.batch();
            let count = 0;
            Object.entries(this.allowedUsers).forEach(([email, data]) => {
                if (this._getGroupForUser(data, email) === groupId) {
                    batch.update(firestore.collection('allowedUsers').doc(email), {
                        isAdmin: !!group.isAdmin,
                        role: group.isStudent ? 'student' : 'staff',
                        permissions: group.permissions || {}
                    });
                    count++;
                }
            });
            if (count > 0) await batch.commit();
            AppDialog.toast(`Group saved — ${count} user${count !== 1 ? 's' : ''} updated`, 'success');
        } catch (e) {
            AppDialog.toast('Failed to save group: ' + (e?.message || e), 'error');
        }
    },

    // Show a panel listing all groups with edit buttons
    _showManageGroupsPanel() {
        const rows = this.PERMISSION_GROUPS.map(g => {
            const count = Object.entries(this.allowedUsers).filter(([e,d]) => this._getGroupForUser(d,e) === g.id).length;
            const modules = g.isAdmin
                ? Object.keys(this.MODULE_SCHEMA)
                : Object.keys(g.permissions||{}).filter(m => { const p=(g.permissions||{})[m]; return p===true||(p&&Object.values(p).some(Boolean)); });
            const modIcons = modules.map(m => `<i data-lucide="${this.MODULE_SCHEMA[m]?.icon||'box'}" style="width:13px;height:13px;opacity:0.6;" title="${(this.MODULE_SCHEMA[m]?.label||m)}"></i>`).join('');
            return `
                <div style="display:flex;align-items:center;gap:16px;padding:16px;background:rgba(255,255,255,0.02);border:1px solid var(--card-border);border-radius:14px;">
                    <div style="width:38px;height:38px;border-radius:10px;background:${g.color}22;display:flex;align-items:center;justify-content:center;color:${g.color};flex-shrink:0;">
                        <i data-lucide="${g.icon}" style="width:18px;height:18px;"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:800;font-size:0.92rem;">${g.name} <span style="font-size:0.7rem;color:var(--text-dim);font-weight:600;">${count} member${count!==1?'s':''}</span></div>
                        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:2px;">${g.description||''}</div>
                        <div style="display:flex;gap:5px;margin-top:6px;color:var(--text-dim);">${modIcons||'<span style="font-size:0.7rem;opacity:0.4;">Portal only</span>'}</div>
                    </div>
                    ${g.isSuperAdmin
                        ? `<span style="font-size:0.72rem;color:var(--text-dim);opacity:0.5;padding:0 8px;">Protected</span>`
                        : `<button class="btn btn-secondary btn-sm" onclick="window.staffDirectory.showEditGroupModal('${g.id}');AppDialog.close();">
                               <i data-lucide="pencil" style="width:14px;height:14px;"></i> Edit
                           </button>`}
                </div>`;
        }).join('');

        AppDialog.confirm({
            title: 'Permission Groups',
            width: '600px',
            content: `
                <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:20px;">
                    Editing a group updates what every member of that group can access immediately.
                </div>
                <div style="display:flex;flex-direction:column;gap:10px;">${rows}</div>`,
            onOpen: el => { if (window.lucide) lucide.createIcons({ root: el }); },
            confirmLabel: null,
            cancelLabel: 'Close'
        });
    },

    // Open the edit modal for a specific group
    showEditGroupModal(groupId) {
        const group = this.PERMISSION_GROUPS.find(g => g.id === groupId);
        if (!group) return;
        if (group.isSuperAdmin) { AppDialog.toast('Super Admin group cannot be edited.', 'error'); return; }

        const schema = this.MODULE_SCHEMA;
        const perms = group.permissions || {};
        const memberCount = Object.entries(this.allowedUsers).filter(([e, d]) => this._getGroupForUser(d, e) === groupId).length;

        const COLORS = ['#f43f5e','#73c7c8','#a78bfa','#fb923c','#fbbf24','#34d399','#60a5fa','#f472b6','#94a3b8'];
        const colorPicker = COLORS.map(c =>
            `<div onclick="this.parentElement.querySelectorAll('div').forEach(d=>d.style.outline='none');this.style.outline='3px solid white';document.getElementById('eg-color').value='${c}';"
                style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;transition:transform 0.1s;outline:${group.color===c?'3px solid white':'none'};outline-offset:2px;"
                onmouseenter="this.style.transform='scale(1.2)'" onmouseleave="this.style.transform='scale(1)'"></div>`
        ).join('');

        const moduleBlocks = Object.entries(schema).map(([modKey, mod]) => {
            const modPerms = perms[modKey] || {};
            const checks = Object.entries(mod.actions).map(([actKey, actLabel]) => {
                const checked = !!modPerms[actKey];
                return `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;font-size:0.82rem;">
                    <input type="checkbox" class="eg-perm-check" data-mod="${modKey}" data-act="${actKey}" ${checked?'checked':''} style="width:15px;height:15px;accent-color:${group.color};">
                    ${actLabel}
                </label>`;
            }).join('');

            return `<div style="background:rgba(255,255,255,0.02);border:1px solid var(--card-border);border-radius:14px;padding:16px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:0.75rem;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:var(--accent-secondary);">
                    <i data-lucide="${mod.icon}" style="width:14px;height:14px;"></i>${mod.label}
                </div>
                ${checks}
            </div>`;
        }).join('');

        AppDialog.confirm({
            title: `Edit Group — ${group.name}`,
            width: '780px',
            content: `
                <div style="display:grid;grid-template-columns:260px 1fr;gap:24px;">
                    <div>
                        <div class="form-group" style="margin-bottom:16px;">
                            <label>Group Name</label>
                            <input type="text" id="eg-name" class="form-control" value="${group.name}">
                        </div>
                        <div class="form-group" style="margin-bottom:16px;">
                            <label>Description</label>
                            <textarea id="eg-desc" class="form-control" rows="3" style="resize:vertical;">${group.description||''}</textarea>
                        </div>
                        <div class="form-group" style="margin-bottom:16px;">
                            <label>Colour</label>
                            <input type="hidden" id="eg-color" value="${group.color||'#73c7c8'}">
                            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">${colorPicker}</div>
                        </div>
                        <div style="background:rgba(232,105,102,0.06);border:1px solid rgba(232,105,102,0.2);border-radius:12px;padding:14px;font-size:0.8rem;color:var(--text-dim);">
                            <strong style="color:var(--accent-primary);">⚠ ${memberCount} user${memberCount!==1?'s':''}</strong> currently in this group will have their permissions updated when you save.
                        </div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:14px;">Module Permissions</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-height:420px;overflow-y:auto;padding-right:4px;">${moduleBlocks}</div>
                    </div>
                </div>`,
            onOpen: el => { if (window.lucide) lucide.createIcons({ root: el }); },
            confirmLabel: 'Save Group',
            onConfirm: async () => {
                const name = document.getElementById('eg-name')?.value?.trim();
                const desc = document.getElementById('eg-desc')?.value?.trim();
                const color = document.getElementById('eg-color')?.value || group.color;
                if (!name) { AppDialog.toast('Group name is required', 'error'); return false; }

                const newPerms = {};
                document.querySelectorAll('.eg-perm-check').forEach(cb => {
                    const mod = cb.getAttribute('data-mod');
                    const act = cb.getAttribute('data-act');
                    if (!newPerms[mod]) newPerms[mod] = {};
                    newPerms[mod][act] = cb.checked;
                });

                await this.savePermissionGroup(groupId, {
                    name, description: desc, color,
                    permissions: newPerms,
                    isAdmin: !!group.isAdmin, isStudent: !!group.isStudent,
                    isSuperAdmin: !!group.isSuperAdmin, icon: group.icon
                });
                this._usersRendered = false;
                this._renderUsersContent(document.getElementById('users-panel-root'));
                return true;
            }
        });
    },


    staffWingBadgeHtml(wing) {
        if (wing === 'preschool') return `<span style="background:rgba(115,199,200,0.15); color:var(--accent-secondary); padding:2px 10px; border-radius:8px; font-size:0.7rem; font-weight:800; letter-spacing:0.5px;">PRESCHOOL</span>`;
        if (wing === 'tuition') return `<span style="background:rgba(251,191,36,0.15); color:#fbbf24; padding:2px 10px; border-radius:8px; font-size:0.7rem; font-weight:800; letter-spacing:0.5px;">TUITION</span>`;
        if (wing === 'both') return `<span style="background:rgba(74,222,128,0.15); color:var(--success); padding:2px 10px; border-radius:8px; font-size:0.7rem; font-weight:800; letter-spacing:0.5px;">BOTH WINGS</span>`;
        return `<span style="background:rgba(255,255,255,0.05); color:var(--text-dim); padding:2px 10px; border-radius:8px; font-size:0.7rem; font-weight:800;">UNASSIGNED</span>`;
    },

    seedSampleStaff() {
        const sample = {
            name: "Dr. Aditi Verma",
            designation: "Senior Academic Coordinator",
            department: "Primary Education",
            wing: "preschool",
            phone: "919822001122",
            email: "aditi.v@example.com",
            joiningDate: "2024-06-01",
            bloodGroup: "B+",
            address: "Villa 12, Pine Residency, Pune, Maharashtra",
            emergencyContact: "Mr. Verma - 919822001133",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        firestore.collection('modules').doc('staff_directory').collection('staff').add(sample)
            .then(() => AppDialog.toast('Sample staff record created!', 'success'))
            .catch(err => AppDialog.toast('Error: ' + err.message, 'error'));
    },

    renderDirectory(containerId = 'people-content-staff', filter = 'staff') {
        this.currentPeopleFilter = filter;
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!this.dataLoaded) {
            container.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:100px 0; gap:20px; opacity:0.7;"><div class="loading-spinner"></div><p style="font-weight:600; color:var(--text-dim); letter-spacing:1px;">SYNCHRONIZING PROFILES...</p></div>`;
            return;
        }

        const q = this.searchQuery.toLowerCase();
        const allStudents = window.studentDataManager?.students || {};

        // --- Staff ---
        const staffByEmail = {};
        Object.keys(this.staff).forEach(id => {
            const s = this.staff[id];
            if (s.email) staffByEmail[s.email.toLowerCase()] = { ...s, id };
        });

        // Only show non-student accounts in the staff section
        const staffEmails = Object.keys(this.allowedUsers).filter(email =>
            (this.allowedUsers[email]?.role || 'staff') !== 'student'
        );

        const filteredUserEmails = this.currentPeopleFilter !== 'students'
            ? staffEmails.filter(email => {
                const s = staffByEmail[email];
                return email.includes(q) || (s && (s.name || '').toLowerCase().includes(q)) || (s && (s.designation || '').toLowerCase().includes(q));
            }).sort((a, b) => ((staffByEmail[a]?.name || a).localeCompare(staffByEmail[b]?.name || b)))
            : [];

        // --- Students ---
        const filteredStudents = this.currentPeopleFilter !== 'staff'
            ? Object.entries(allStudents)
                .filter(([, s]) => {
                    const matchesSearch = (s.name || '').toLowerCase().includes(q);
                    const matchesWing = this.studentWingFilter === 'all' || (s.studentType || 'preschool') === this.studentWingFilter;
                    return matchesSearch && matchesWing;
                })
                .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''))
            : [];

        const totalStaff = staffEmails.length;
        const totalStudents = Object.keys(allStudents).length;

        // Toolbar
        const userData2 = window.currentUserData || {};
        const isAdmin2 = userData2.isAdmin;
        const staffPerms2 = userData2.permissions?.staff_directory || {};
        const studentPerms2 = userData2.permissions?.student_directory || {};
        const canAddStaff = isAdmin2 || staffPerms2.add;
        const canAddStudent = isAdmin2 || studentPerms2.add;

        const wingType = this.studentWingFilter === 'tuition' ? 'tuition' : 'preschool';
        const wingLabel = wingType === 'tuition' ? 'Tuition Student' : 'Preschool Student';
        const addBtn = filter === 'students'
            ? (canAddStudent ? `<button class="btn btn-primary" onclick="window.studentDirectory.showStudentForm(null, '${wingType}')"><i data-lucide="user-plus"></i> New ${wingLabel}</button>` : '')
            : (canAddStaff ? `
                ${isAdmin2 ? `<button class="btn btn-secondary" onclick="window.staffDirectory.syncAllStaffLogins()" title="Create login accounts for all staff profiles that don't have one yet"><i data-lucide="refresh-cw"></i> Sync Logins</button>` : ''}
                <button class="btn btn-primary" onclick="window.staffDirectory.showStaffForm()"><i data-lucide="user-plus"></i> New Staff</button>` : '');
        this._setToolbar(`
            <div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Search..." oninput="window.staffDirectory.handleSearch(this.value)" value="${this.searchQuery}"><button class="search-clear" onclick="window.staffDirectory.handleSearch(''); this.previousElementSibling.value='';" title="Clear">×</button></div>
            ${addBtn}`);

        if (filteredUserEmails.length === 0 && filteredStudents.length === 0) {
            container.innerHTML = `<div class="empty-state"><i data-lucide="users"></i><p>${q ? 'No results for "${q}".' : 'No records yet.'}</p></div>`;
            return;
        }

        let html = '';

        // Staff section
        if (filteredUserEmails.length > 0) {
            html += '<div class="directory-grid">';
            filteredUserEmails.forEach(email => {
                const u = this.allowedUsers[email];
                const s = staffByEmail[email];
                const displayName = s?.name || email.split('@')[0];
                const initials = displayName[0].toUpperCase();
                const id = s?.id;
                html += `
                    <div class="directory-card" ${id ? `onclick="window.staffDirectory.switchView('report', '${id}')"` : ''} style="${!id ? 'cursor:default; opacity:0.75;' : ''}">
                        <div class="member-header"><div class="member-avatar" style="background:${id ? 'var(--accent-secondary)' : 'var(--text-dim)'}; color:${id ? '#000' : 'white'};">${initials}</div>
                        <div class="member-info"><h3>${displayName}</h3><p>${s?.designation || (u.isAdmin ? 'Administrator' : 'Authorized User')}</p>${id && s?.wing ? `<div style="margin-top:4px;">${this.staffWingBadgeHtml(s.wing)}</div>` : ''}</div></div>
                        <div class="member-details">
                            <div class="detail-item"><i data-lucide="mail"></i><span class="text-truncate">${email}</span></div>
                            <div class="detail-item"><i data-lucide="${id ? 'check-circle' : 'alert-circle'}" style="color:${id ? 'var(--success)' : 'var(--accent-primary)'}"></i><span>${id ? 'Profile Linked' : 'Profile Pending'}</span></div>
                        </div>
                        <div class="member-actions">
                            ${id
                                ? `<button class="btn btn-ghost btn-sm" style="width:100%; justify-content:center; color:var(--accent-secondary); font-weight:800; letter-spacing:0.5px;">VIEW PROFILE <i data-lucide="chevron-right" style="width:16px; height:16px; margin-left:4px;"></i></button>`
                                : `<button class="btn btn-secondary btn-sm" style="width:100%; justify-content:center;" onclick="event.stopPropagation(); window.staffDirectory.showStaffForm(null, '${email}')"><i data-lucide="plus" style="width:14px;"></i> CREATE PROFILE</button>`}
                        </div>
                    </div>`;
            });
            html += '</div>';
        }

        // Students section
        if (filteredStudents.length > 0) {
            html += '<div class="directory-grid">';
            filteredStudents.forEach(([id, s]) => {
                const wingType = s.studentType || 'preschool';
                const wingColor = wingType === 'preschool' ? 'var(--accent-secondary)' : '#fbbf24';
                const wingBg    = wingType === 'preschool' ? 'rgba(115,199,200,0.15)' : 'rgba(251,191,36,0.15)';
                const wingLabel = wingType === 'preschool' ? 'Preschool' : 'Tuition';
                html += `
                    <div class="directory-card" onclick="window.staffDirectory.switchView('student_report', '${id}')">
                        <div class="member-header">
                            <div class="member-avatar" style="background:${wingBg}; color:${wingColor};">${(s.name || 'S').charAt(0).toUpperCase()}</div>
                            <div class="member-info">
                                <h3>${s.name}</h3>
                                <p>${s.admissionForClass || 'No class set'}</p>
                                <div style="margin-top:4px;"><span style="background:${wingBg}; color:${wingColor}; padding:2px 10px; border-radius:8px; font-size:0.7rem; font-weight:800; letter-spacing:0.5px;">${wingLabel.toUpperCase()}</span></div>
                            </div>
                        </div>
                        <div class="member-details">
                            <div class="detail-item"><i data-lucide="phone"></i><span>${s.fatherPhone || s.motherPhone || 'No phone'}</span></div>
                            <div class="detail-item"><i data-lucide="calendar"></i><span>${s.enrollmentDate ? parseInputDate(s.enrollmentDate) : 'No date'}</span></div>
                        </div>
                        <div class="member-actions">
                            <button class="btn btn-ghost btn-sm" style="width:100%; justify-content:center; color:${wingColor}; font-weight:800; letter-spacing:0.5px;">VIEW PROFILE <i data-lucide="chevron-right" style="width:16px; height:16px; margin-left:4px;"></i></button>
                        </div>
                    </div>`;
            });
            html += '</div>';
        }

        container.innerHTML = html;
    },

    renderManage() {
        const container = document.getElementById('staff-content-manage');
        if (!container) return;

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const staffPerms = userData.permissions?.staff_directory || {};

        const toolbar = this._toolbar();
        if (toolbar) {
            this._setToolbar(`<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Search profiles..." oninput="window.staffDirectory.handleSearch(this.value)" value="${this.searchQuery}"><button class="search-clear" onclick="window.staffDirectory.handleSearch(''); this.previousElementSibling.value='';" title="Clear">×</button></div>`);
        }

        const staffByEmail = {};
        Object.keys(this.staff).forEach(id => {
            const s = this.staff[id];
            if (s.email) staffByEmail[s.email.toLowerCase()] = { ...s, id };
        });

        const sortedUserEmails = Object.keys(this.allowedUsers).filter(email => {
            const u = this.allowedUsers[email];
            const s = staffByEmail[email];
            const q = this.searchQuery.toLowerCase();
            return email.includes(q) || (s && (s.name || '').toLowerCase().includes(q));
        }).sort((a, b) => a.localeCompare(b));

        let html = `<div class="section-title">User Profile Management</div>
                    <table class="console-table">
                        <thead>
                            <tr>
                                <th>Authorized User</th>
                                <th>Profile Status</th>
                                <th>Role / Designation</th>
                                <th>Wing</th>
                                <th style="text-align:right" data-no-sort>Actions</th>
                            </tr>
                        </thead>
                        <tbody>`;

        sortedUserEmails.forEach(email => {
            const u = this.allowedUsers[email];
            const s = staffByEmail[email];
            const id = s?.id;

            html += `
                <tr>
                    <td><div style="font-weight:700; color:var(--text-main);">${email}</div><div style="font-size:0.75rem; color:var(--text-dim)">${u.isAdmin ? 'Global Administrator' : 'Authorized User'}</div></td>
                    <td>
                        <span class="badge ${id ? 'badge-success' : 'badge-warning'}" style="padding: 4px 10px; font-size:0.7rem;">
                            ${id ? 'LINKED' : 'PENDING'}
                        </span>
                    </td>
                    <td>${s?.designation || 'N/A'}</td>
                    <td>${s?.wing ? this.staffWingBadgeHtml(s.wing) : '<span style="color:var(--text-dim); font-size:0.8rem;">—</span>'}</td>
                    <td style="text-align:right">
                        <div class="table-actions" style="justify-content:flex-end; gap:12px;">
                            ${id ? `
                                <button class="btn-icon" onclick="window.staffDirectory.switchView('report', '${id}')" title="View Profile"><i data-lucide="user"></i></button>
                                ${(isAdmin || staffPerms.edit) ? `<button class="btn-icon" onclick="window.staffDirectory.showStaffForm('${id}', '${email}')" title="Edit Profile"><i data-lucide="edit-3"></i></button>` : ''}
                                ${(isAdmin || staffPerms.delete) ? `<button class="btn-icon btn-icon-danger" onclick="window.staffDirectory.deleteStaff('${id}')" title="Unlink/Remove"><i data-lucide="trash-2"></i></button>` : ''}
                            ` : `
                                ${(isAdmin || staffPerms.add) ? `<button class="btn btn-secondary btn-sm" onclick="window.staffDirectory.showStaffForm(null, '${email}')"><i data-lucide="plus"></i> Create Profile</button>` : ''}
                            `}
                        </div>
                    </td>
                </tr>`;
        });
        if (sortedUserEmails.length === 0) html += '<tr><td colspan="4" style="text-align:center; padding: 40px;">No authorized users found.</td></tr>';
        container.innerHTML = html + '</tbody></table>';
    },

    _renderAttendanceInto(target) {
        // Thin wrapper called by attendancePanel — renders into an arbitrary container
        const prev = document.getElementById('staff-content-attendance');
        if (prev) prev.parentNode.style.display = 'none'; // hide legacy container
        this._attTarget = target;
        this.renderAttendance();
        this._attTarget = null;
    },

    _renderAttendanceReportInto(target) {
        const prev = document.getElementById('staff-content-attendance-reports');
        if (prev) prev.parentNode.style.display = 'none';
        this._attTarget = target;
        this.renderAttendanceReports();
        this._attTarget = null;
    },

    renderAttendance() {
        const container = this._attTarget || document.getElementById('staff-content-attendance');
        if (!container) return;
        const userData = window.currentUserData || {};
        const staffPerms = userData.permissions?.staff_directory || {};
        const canMarkAll = userData.isAdmin || staffPerms === true || staffPerms.attendance_mark;
        const canSelfAttend = userData.isAdmin || staffPerms.attendance_self;
        const ownStaffId = this.getOwnStaffId();
        const ownAttendance = ownStaffId ? (this.attendance[ownStaffId] || { status: 'none' }) : null;
        const toolbar = this._toolbar();
        if (canMarkAll) this._setToolbar(`<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Quick find staff..." oninput="window.staffDirectory.handleSearch(this.value)" value="${this.searchQuery}"><button class="search-clear" onclick="window.staffDirectory.handleSearch(''); this.previousElementSibling.value='';" title="Clear">×</button></div>`);
        else if (toolbar) toolbar.innerHTML = '';

        if (!canMarkAll) {
            const statusLabels = { present: 'Present', late: 'Late', absent: 'Absent', none: 'Not Marked' };
            const statusClasses = { present: 'status-success', late: 'status-warning', absent: 'status-danger', none: 'status-none' };
            container.innerHTML = `<div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Self Attendance</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Mark yourself present when you are within the school location radius.</p>
                </div>
                <div class="report-body">
                    ${ownStaffId && canSelfAttend ? `
                        <div class="metrics-grid" style="margin-bottom:32px;">
                            <div class="metric-card">
                                <div class="metric-icon" style="background:rgba(74, 222, 128, 0.1); color:var(--success);"><i data-lucide="user-check"></i></div>
                                <div class="metric-info">
                                    <h3>Today&apos;s Status</h3>
                                    <div class="metric-value"><span class="status-pill ${statusClasses[ownAttendance.status || 'none']}">${statusLabels[ownAttendance.status || 'none']}</span></div>
                                </div>
                            </div>
                        </div>
                        <div style="display:flex; gap:12px; flex-wrap:wrap;">
                            <button class="btn btn-primary" onclick="window.staffDirectory.markMyAttendanceNow()"><i data-lucide="user-check"></i> Mark Present Now</button>
                        </div>
                        <div style="margin-top:20px; font-size:0.85rem; color:var(--text-dim);">This works only when your GPS location matches the school location settings.</div>
                    ` : `
                        <div class="empty-state"><i data-lucide="alert-circle"></i><p>${ownStaffId ? 'Self attendance is not enabled for your account yet.' : 'Your login is not linked to a staff profile yet.'}</p></div>
                    `}
                </div>
            </div>`;
            return;
        }

        const sortedIds = Object.keys(this.staff).filter(id => (this.staff[id].name || '').toLowerCase().includes(this.searchQuery.toLowerCase())).sort((a,b) => (this.staff[a].name || '').localeCompare(this.staff[b].name || ''));
        container.innerHTML = `<div class="report-page"><div class="report-hero"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Staff Attendance Marker</h2><p style="color:var(--text-dim); font-size:1.1rem;">Mark daily presence for ${parseInputDate(new Date().toISOString().split('T')[0])}.</p></div><div class="report-body"><table class="console-table"><thead><tr><th>Staff</th><th>Role</th><th style="text-align:right; min-width:280px;" data-no-sort>Quick Actions</th></tr></thead><tbody>${sortedIds.map(id => {
            const s = this.staff[id], att = this.attendance[id] || { status: 'none' };
            return `<tr><td><strong>${s.name}</strong></td><td>${s.designation || 'N/A'}</td><td style="text-align:right"><div class="attendance-actions" style="justify-content:flex-end; gap:10px;"><button class="btn-chip ${att.status === 'present' ? 'active' : ''}" onclick="window.staffDirectory.markAttendance('${id}', 'present')">PRESENT</button><button class="btn-chip btn-chip-danger ${att.status === 'absent' ? 'active' : ''}" onclick="window.staffDirectory.markAttendance('${id}', 'absent')">ABSENT</button><button class="btn-chip btn-chip-warning ${att.status === 'late' ? 'active' : ''}" onclick="window.staffDirectory.markAttendance('${id}', 'late')">LATE</button></div></td></tr>`;
        }).join('')}</tbody></table></div></div>`;
    },

    async markMyAttendanceNow() {
        try {
            const staffPerms = (window.currentUserData || {}).permissions?.staff_directory || {};
            if (!(window.currentUserData?.isAdmin || staffPerms.attendance_self)) {
                AppDialog.toast('Unauthorized', 'error');
                return;
            }
            AppDialog.toast('Checking GPS location...', 'info');
            const location = await this.getCurrentLocationForAttendance();
            AppDialog.toast(`GPS detected: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (${Math.round(location.accuracy)}m accuracy)`, 'info');
            const callable = firebase.functions().httpsCallable('selfMarkStaffAttendance');
            const result = await callable({
                location,
                device: {
                    userAgent: navigator.userAgent,
                    platform: navigator.platform
                }
            });
            const ownStaffId = this.getOwnStaffId();
            if (ownStaffId) {
                this.selectedDate = result.data.date || this.selectedDate;
                this.attendance[ownStaffId] = {
                    ...(this.attendance[ownStaffId] || {}),
                    status: result.data.status,
                    timestamp: Date.now(),
                    markedBy: 'self',
                    markedByEmail: window.currentUserData?.email || auth.currentUser?.email || '',
                    method: 'location',
                };
                if (this.currentView === 'attendance') {
                    this.renderAttendance();
                }
            }
            AppDialog.toast(`Attendance marked ${result.data.status}.`, 'success');
            this.subscribeToAttendance(result.data.date || this.selectedDate);
        } catch (err) {
            const details = err?.details;
            if (details && typeof details === 'object') {
                const parts = [];
                if (details.expectedSchoolLocation) parts.push(`School: ${details.expectedSchoolLocation.latitude}, ${details.expectedSchoolLocation.longitude}`);
                if (details.detectedLocation) {
                    const dl = details.detectedLocation;
                    if (typeof dl === 'string') parts.push(`Location: ${dl}`);
                    else parts.push(`Location: ${dl.latitude}, ${dl.longitude}${dl.accuracy != null ? ` (${Math.round(dl.accuracy)}m)` : ''}`);
                }
                if (details.distanceMeters != null) parts.push(`Distance: ${Math.round(details.distanceMeters)}m`);
                if (details.allowedRadiusMeters != null) parts.push(`Radius: ${Math.round(details.allowedRadiusMeters)}m`);
                if (details.maxAccuracyMeters != null) parts.push(`Max accuracy: ${Math.round(details.maxAccuracyMeters)}m`);
                if (parts.length) {
                    AppDialog.toast(`${err.message || 'Attendance check-in failed'} | ${parts.join(' | ')}`, 'error');
                    return;
                }
            }
            AppDialog.toast(err.message || 'Attendance check-in failed', 'error');
        }
    },

    async getCurrentLocationForAttendance() {
        if (!navigator.geolocation) {
            throw new Error('Location is not supported in this browser.');
        }

        AppDialog.toast('Requesting GPS location...', 'info');

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    resolve({
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                    });
                },
                (err) => {
                    reject(new Error(err.message || 'Could not get GPS location.'));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0,
                }
            );
        });
    },

    async showAttendanceConfigForm() {
        AppDialog.toast('Attendance settings are managed from the Admin Panel.', 'info');
    },

    async fillCurrentAttendanceLocation() {
        AppDialog.toast('Attendance settings are managed from the Admin Panel.', 'info');
    },

    renderAttendanceReports() {
        const container = this._attTarget || document.getElementById('staff-content-attendance-reports');
        if (!container) return;
        // Toolbar is owned by attendancePanel in att-toolbar context; skip when called from there
        if (!this._attTarget) {
            this._setToolbar(`<div class="report-controls" style="display:flex; gap:16px; align-items:center;"><div class="search-box"><i data-lucide="calendar"></i><input type="date" class="form-control" value="${this.selectedDate}" onchange="window.staffDirectory.handleDateChange(this.value)"></div><div class="segment-controller"><button class="segment-btn ${this.reportType === 'daily' ? 'active' : ''}" onclick="window.staffDirectory.switchReportType('daily')">Daily</button><button class="segment-btn ${this.reportType === 'weekly' ? 'active' : ''}" onclick="window.staffDirectory.switchReportType('weekly')">Weekly</button><button class="segment-btn ${this.reportType === 'monthly' ? 'active' : ''}" onclick="window.staffDirectory.switchReportType('monthly')">Monthly</button></div></div><button class="btn btn-secondary" onclick="window.staffDirectory.printCurrentReport()"><i data-lucide="printer"></i> Print Analysis</button>`);
        }
        if (this.reportType === 'daily') this.renderDailyReport(container);
        else if (this.reportType === 'weekly') this.renderWeeklyReport(container);
        else if (this.reportType === 'monthly') this.renderMonthlyReport(container);
    },

    renderDailyReport(container) {
        let p = 0, a = 0, l = 0; Object.values(this.attendance).forEach(val => { if (val.status === 'present') p++; else if (val.status === 'absent') a++; else if (val.status === 'late') l++; });
        container.innerHTML = `<div class="report-page"><div class="report-hero"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Daily Staff Attendance</h2><p style="color:var(--text-dim); font-size:1.1rem;">Detailed breakdown for ${parseInputDate(this.selectedDate)}</p></div><div class="report-body"><div class="metrics-grid"><div class="metric-card"><div class="metric-icon" style="background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary);"><i data-lucide="users"></i></div><div class="metric-info"><h3>Total Staff</h3><div class="metric-value">${Object.keys(this.staff).length}</div></div></div><div class="metric-card"><div class="metric-icon" style="background: rgba(74, 222, 128, 0.1); color: var(--success);"><i data-lucide="check-circle"></i></div><div class="metric-info"><h3>Present</h3><div class="metric-value" style="color:var(--success)">${p}</div></div></div><div class="metric-card"><div class="metric-icon" style="background: rgba(241, 97, 91, 0.1); color: var(--accent-primary);"><i data-lucide="user-x"></i></div><div class="metric-info"><h3>Absent</h3><div class="metric-value" style="color:var(--accent-primary)">${a}</div></div></div><div class="metric-card"><div class="metric-icon" style="background: rgba(251, 191, 36, 0.1); color: #fbbf24;"><i data-lucide="clock"></i></div><div class="metric-info"><h3>Late</h3><div class="metric-value" style="color:#fbbf24">${l}</div></div></div></div><table class="console-table"><thead><tr><th>Staff</th><th>Role</th><th>Status</th><th style="text-align:right">Time</th></tr></thead><tbody>${Object.keys(this.staff).sort((a,b) => (this.staff[a].name || '').localeCompare(this.staff[b].name || '')).map(id => { const att = this.attendance[id] || { status: 'none' }, labels = { 'present': 'Present', 'absent': 'Absent', 'late': 'Late', 'none': 'Not Marked' }, classes = { 'present': 'status-success', 'absent': 'status-danger', 'late': 'status-warning', 'none': 'status-none' }; return `<tr><td><strong>${this.staff[id].name}</strong></td><td>${this.staff[id].designation || 'N/A'}</td><td><span class="status-pill ${classes[att.status]}">${labels[att.status]}</span></td><td style="text-align:right; font-size:0.85rem; color:var(--text-dim)">${att.timestamp ? new Date(att.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    },

    async renderWeeklyReport(container) {
        container.innerHTML = '<div class="empty-state"><i data-lucide="loader" style="animation:spin 1s linear infinite"></i><p>Compiling weekly matrix...</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        const dates = []; for (let i = 6; i >= 0; i--) { const d = new Date(this.selectedDate); d.setDate(d.getDate() - i); dates.push(d.toISOString().split('T')[0]); }
        const weeklyData = {}; for (const d of dates) { const snap = await db.ref(`modules/staff_directory/attendance/${d}`).once('value'); weeklyData[d] = snap.val() || {}; }
        container.innerHTML = `<div class="report-page"><div class="report-hero"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Weekly Performance Matrix</h2><p style="color:var(--text-dim); font-size:1.1rem;">Presence overview for the last 7 days</p></div><div class="report-body" style="padding:0;"><div style="overflow-x:auto;"><table class="console-table" style="margin-top:0; border:none; border-radius:0;"><thead><tr><th style="width:250px;">Staff</th>${dates.map(d => `<th style="text-align:center; font-size:0.7rem">${d.split('-').slice(1).reverse().join('/')}</th>`).join('')}<th style="text-align:right; width:80px;">Rate</th></tr></thead><tbody>${Object.keys(this.staff).sort((a,b) => (this.staff[a].name || '').localeCompare(this.staff[b].name || '')).map(id => { let p = 0; let row = `<tr><td><strong>${this.staff[id].name}</strong></td>`; dates.forEach(d => { const s = weeklyData[d][id]?.status; if (s === 'present') { p++; row += '<td><div class="attendance-matrix-cell matrix-present">P</div></td>'; } else if (s === 'late') { p++; row += '<td><div class="attendance-matrix-cell matrix-late">L</div></td>'; } else if (s === 'absent') row += '<td><div class="attendance-matrix-cell matrix-absent">A</div></td>'; else row += '<td><div class="attendance-matrix-cell matrix-empty">-</div></td>'; }); row += `<td style="text-align:right; font-weight:800; color:var(--accent-secondary);">${Math.round((p/7)*100)}%</td></tr>`; return row; }).join('')}</tbody></table></div></div></div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderMonthlyReport(container) {
        const monthKey = this.selectedDate.slice(0, 7); container.innerHTML = '<div class="empty-state"><i data-lucide="loader" style="animation:spin 1s linear infinite"></i><p>Compiling monthly analytics...</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        const snap = await db.ref('modules/staff_directory/attendance').orderByKey().startAt(monthKey).endAt(`${monthKey}-\uf8ff`).once('value'), monthData = snap.val() || {}, monthDisplay = new Date(this.selectedDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        container.innerHTML = `<div class="report-page"><div class="report-hero"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Monthly Staff Audit</h2><p style="color:var(--text-dim); font-size:1.1rem;">Presence summary for ${monthDisplay}</p></div><div class="report-body"><table class="console-table"><thead><tr><th>Staff</th><th>Present</th><th>Absent</th><th>Late</th><th style="text-align:right">Rate</th></tr></thead><tbody>${Object.keys(this.staff).sort((a,b) => (this.staff[a].name || '').localeCompare(this.staff[b].name || '')).map(id => { const stats = { p: 0, a: 0, l: 0 }; Object.keys(monthData).forEach(d => { const s = monthData[d][id]?.status; if (s === 'present') stats.p++; else if (s === 'absent') stats.a++; else if (s === 'late') stats.l++; }); const total = stats.p + stats.a + stats.l; return `<tr><td><strong>${this.staff[id].name}</strong></td><td>${stats.p}</td><td>${stats.a}</td><td>${stats.l}</td><td style="text-align:right; font-weight:800; color:var(--accent-secondary)">${total > 0 ? Math.round(((stats.p+stats.l)/total)*100) : 0}%</td></tr>`; }).join('')}</tbody></table></div></div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    switchReportType(type) { this.reportType = type; this.renderAttendanceReports(); },

    printCurrentReport() {
        const type = this.reportType.toUpperCase(), printWindow = window.open('', '_blank');
        printWindow.document.write(`<html><head><title>Staff ${type} Report</title><style>body { font-family: sans-serif; padding: 40px; } .header { border-bottom: 3px solid #F1615B; padding-bottom: 20px; margin-bottom: 30px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #eee; padding: 12px; text-align: left; }</style></head><body><div class="header"><h1>ABHISHRI ACADEMY</h1><p>Staff Attendance ${type} Audit</p></div>${document.querySelector('#staff-content-attendance-reports table').outerHTML}</body></html>`);
        printWindow.document.close(); setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    },

    async renderReport(id) {
        const container = document.getElementById('staff-content-report'); if (!container || !id) return;
        this.switchView('report'); container.innerHTML = '<div class="report-page" style="padding:100px; text-align:center; margin-top: 40px;"><div class="loading-spinner" style="margin:0 auto 20px;"></div><p style="color:var(--text-dim); font-size:1.1rem; font-weight:600;">Opening staff profile...</p></div>';
        const s = this.staff[id]; if (!s) return;
        const email = (s.email || '').toLowerCase();
        const currentUserEmail = auth.currentUser?.email?.toLowerCase();
        const isOwnProfile = email && currentUserEmail === email;

        const userData = window.currentUserData || {}, isAdmin = userData.isAdmin, feePerms = userData.permissions?.fees_accounting || {}, canViewFees = isAdmin || feePerms === true || feePerms.view || (isOwnProfile && feePerms.wallet_view_own);
        let sFund = 0, sSpend = 0;
        if (canViewFees) { 
            sFund = window.feesManager?.expenses?.filter(e => e.source === 'staff_wallet' && (e.staffId === id || (email && e.createdBy === email)) && e.type === 'funding').reduce((a,b)=>a+b.amount, 0) || 0; 
            sSpend = window.feesManager?.expenses?.filter(e => e.source === 'staff_wallet' && (e.staffId === id || (email && e.createdBy === email)) && e.type === 'spend').reduce((a,b)=>a+b.amount, 0) || 0; 
        }
        const balance = s.walletBalance !== undefined ? s.walletBalance : sFund - sSpend;
        const hasWallet = window.feesManager?.hasStaffWallet ? window.feesManager.hasStaffWallet(id) : (s.walletEnabled === true || Number(s.walletBalance || 0) !== 0 || sFund > 0 || sSpend > 0);
        const showWalletMetric = hasWallet && canViewFees;

        const toolbar = this._toolbar();
        if (toolbar) toolbar.innerHTML = `
            <button class="btn btn-secondary" onclick="window.staffDirectory.switchView('staff')"><i data-lucide="arrow-left"></i> Back</button>
            <div style="display:flex; gap:8px; margin-left:auto;">
                ${(isAdmin || staffPerms.edit) && !((!isAdmin) && this.allowedUsers[(s.email||'').toLowerCase()]?.isAdmin) ? `<button class="btn btn-secondary" onclick="window.staffDirectory.showStaffForm('${id}')"><i data-lucide="edit-3"></i> Edit</button>` : ''}
                <button class="btn btn-secondary" onclick="window.staffDirectory.printStaffReport('${id}')"><i data-lucide="printer"></i> Print</button>
            </div>`;
        container.innerHTML = `<div class="report-page" style="margin-top: 20px; border: none; background: transparent; box-shadow: none;"><div class="report-hero" style="background: linear-gradient(135deg, rgba(115, 199, 200, 0.2) 0%, rgba(241, 97, 91, 0.1) 100%); border-radius: 24px; padding: 48px; border: 1px solid var(--card-border); margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 32px;"><div style="display: flex; gap: 32px; align-items: center;"><div class="profile-avatar-wrapper" style="margin: 0; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.1);">${(s.name || 'S')[0]}</div><div><h1 style="font-size: 3.5rem; font-weight: 900; margin: 0 0 8px 0; letter-spacing: -2px; line-height: 1;">${s.name}</h1><div style="display: flex; gap: 12px; align-items: center;"><span class="badge badge-success" style="font-size: 0.85rem; padding: 6px 18px; background: var(--accent-secondary); color: #000; font-weight: 800;">OFFICIAL STAFF</span><span style="color: var(--text-main); font-size: 1.2rem; font-weight: 600; opacity: 0.8;">${s.designation || 'No Role'}</span></div></div></div><div class="profile-actions" style="display: flex; gap: 16px;"></div></div><div class="profile-card-main" style="margin-top: 0; border-radius: 24px;"><div class="metrics-grid">                <div class="metric-card"><div class="metric-icon" style="background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary);"><i data-lucide="calendar"></i></div><div class="metric-info"><h3>Attendance</h3><div class="metric-value">98%</div></div></div>
                ${showWalletMetric ? `
                    <div class="metric-card">
                        <div class="metric-icon" style="background: ${balance >= 0 ? 'rgba(74, 222, 128, 0.1)' : 'rgba(241, 97, 91, 0.1)'}; color: ${balance >= 0 ? 'var(--success)' : 'var(--accent-primary)'};"><i data-lucide="wallet"></i></div>
                        <div class="metric-info">
                            <h3>Wallet Balance</h3>
                            <div class="metric-value" style="color:${balance >= 0 ? 'var(--success)' : 'var(--accent-primary)'}">₹${balance.toLocaleString('en-IN')}</div>
                            <button class="btn btn-ghost btn-sm" style="margin-top:8px; height:24px; font-size:0.7rem; padding:0 8px;" onclick="window.feesManager.showStaffWalletStatement('${id}')"><i data-lucide="file-text" style="width:12px; height:12px;"></i> View Statement</button>
                        </div>
                    </div>
                ` : ''}
                </div><div class="profile-info-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:32px; margin-top: 40px;"><div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);"><div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="user"></i> Personal Information</div><div class="data-grid" style="grid-template-columns: 1fr 1fr;"><div class="data-item"><div class="data-label">Full Name</div><div class="data-value">${s.name}</div></div><div class="data-item"><div class="data-label">Department</div><div class="data-value">${s.department || 'N/A'}</div></div><div class="data-item"><div class="data-label">Wing</div><div class="data-value">${this.staffWingBadgeHtml(s.wing)}</div></div><div class="data-item"><div class="data-label">Joined On</div><div class="data-value">${s.joiningDate || 'N/A'}</div></div><div class="data-item"><div class="data-label">Blood Group</div><div class="data-value">${s.bloodGroup || 'N/A'}</div></div></div></div><div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);"><div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="phone"></i> Contact Details</div><div class="data-grid" style="grid-template-columns: 1fr;"><div class="data-item"><div class="data-label">Phone</div><div class="data-value">${s.phone || 'N/A'}</div></div><div class="data-item"><div class="data-label">Email</div><div class="data-value">${s.email || 'N/A'}</div></div><div class="data-item"><div class="data-label">Address</div><div class="data-value">${s.address || 'N/A'}</div></div></div></div></div><div class="profile-info-grid" style="display:grid; grid-template-columns: 1fr; gap:32px; margin-top: 32px;"><div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);"><div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="shield-check"></i> Employment Status</div><div class="data-grid" style="grid-template-columns: 1fr 1fr 1fr;"><div class="data-item"><div class="data-label">Employee ID</div><div class="data-value">EMP-${id.slice(-6).toUpperCase()}</div></div><div class="data-item"><div class="data-label">Contract Type</div><div class="data-value">Full-Time</div></div><div class="data-item"><div class="data-label">Emergency</div><div class="data-value">${s.emergencyContact || 'N/A'}</div></div></div></div></div></div></div>`;
    },

    printStaffReport(id) {
        const s = this.staff[id]; if (!s) return;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<html><head><title>Staff Profile - ${s.name}</title><style>body { font-family: sans-serif; padding: 40px; color: #333; } .header { border-bottom: 3px solid #73C7C8; padding-bottom: 20px; margin-bottom: 30px; } .info-section { margin-bottom: 30px; } .info-title { font-weight: bold; border-bottom: 1px solid #eee; margin-bottom: 10px; padding-bottom: 5px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; } label { color: #888; font-size: 12px; display: block; }</style></head><body><div class="header"><h1>ABHISHRI ACADEMY</h1><p>Official Staff Profile Document</p></div><div class="info-section"><div class="info-title">Personal Details</div><div class="grid"><div><label>Name</label>${s.name}</div><div><label>Role</label>${s.designation}</div><div><label>Phone</label>${s.phone}</div><div><label>Email</label>${s.email}</div></div></div><div class="footer" style="margin-top:50px; font-size:10px; color:#aaa; text-align:center;">Generated on ${new Date().toLocaleString('en-IN')}</div><script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        printWindow.document.close(); setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    },

    showStaffForm(id = null, linkedEmail = null) {
        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;

        // Non-admins cannot edit profiles linked to admin accounts
        if (id && !isAdmin) {
            const profileEmail = (this.staff[id]?.email || '').toLowerCase();
            const targetAccount = this.allowedUsers[profileEmail];
            if (targetAccount?.isAdmin) {
                AppDialog.toast('You do not have permission to edit an admin profile.', 'error');
                return;
            }
        }

        const s = id ? this.staff[id] : {};
        const email = linkedEmail || s.email || '';
        const isEmailLocked = !!email;

        const content = `
            <div class="form-group"><label>Full Name</label><input type="text" id="sf-name" class="form-control" value="${s.name || ''}" placeholder="Legal Name" /></div>
            <div class="form-grid-2">
                <div class="form-group"><label>Designation</label><input type="text" id="sf-role" class="form-control" value="${s.designation || ''}" placeholder="e.g. Teacher" /></div>
                <div class="form-group"><label>Department</label><input type="text" id="sf-dept" class="form-control" value="${s.department || ''}" placeholder="e.g. Science" /></div>
            </div>
            <div class="form-group" style="margin-bottom:15px;">
                <label>Wing</label>
                <select id="sf-wing" class="form-control">
                    <option value="" ${!s.wing ? 'selected' : ''}>Not Specified</option>
                    <option value="preschool" ${s.wing === 'preschool' ? 'selected' : ''}>Preschool</option>
                    <option value="tuition" ${s.wing === 'tuition' ? 'selected' : ''}>Tuition</option>
                    <option value="both" ${s.wing === 'both' ? 'selected' : ''}>Both Wings</option>
                </select>
            </div>
            <div class="form-grid-2">
                <div class="form-group"><label>Phone</label><input type="text" id="sf-phone" class="form-control" value="${s.phone || ''}" /></div>
                <div class="form-group"><label>Associated User Email</label><input type="email" id="sf-email" class="form-control" value="${email}" ${isEmailLocked ? 'readonly style="background:rgba(255,255,255,0.03); color:var(--text-dim);"' : ''} placeholder="user@abhishri.edu.in" /></div>
            </div>
            <div class="form-grid-2">
                <div class="form-grid-2">
                    <div class="form-group"><label>Joining Date</label><input type="date" id="sf-date" class="form-control" value="${s.joiningDate || ''}" /></div>
                    <div class="form-group"><label>Monthly Base Salary (₹)</label><input type="number" id="sf-salary" class="form-control" value="${s.baseSalary || 0}" /></div>
                </div>
                <div class="form-group"><label>Blood Group</label><input type="text" id="sf-blood" class="form-control" value="${s.bloodGroup || ''}" /></div>
            </div>
            <div class="form-group"><label>Home Address</label><textarea id="sf-addr" class="form-control" rows="2">${s.address || ''}</textarea></div>
            <div class="form-group" style="margin-top:15px; background:rgba(255,255,255,0.03); padding:12px; border-radius:12px; border:1px solid var(--card-border);">
                <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                    <input type="checkbox" id="sf-wallet-enabled" ${s.walletEnabled === true ? 'checked' : ''} style="width:18px; height:18px;">
                    <div>
                        <div style="font-weight:700; color:var(--text-main);">Enable Wallet System</div>
                        <div style="font-size:0.75rem; color:var(--text-dim);">Allow tracking credits and expenses for this user.</div>
                    </div>
                </label>
            </div>
            <div class="form-group"><label>Emergency Contact Info</label><input type="text" id="sf-emergency" class="form-control" value="${s.emergencyContact || ''}" /></div>`;
        
        AppDialog.confirm({ 
            title: id ? 'Edit User Profile' : 'Link Profile to User', 
            content, width: '600px', 
            onConfirm: async () => {
                const data = {
                    name: document.getElementById('sf-name').value,
                    designation: document.getElementById('sf-role').value,
                    department: document.getElementById('sf-dept').value,
                    wing: document.getElementById('sf-wing').value,
                    phone: document.getElementById('sf-phone').value, 
                    email: document.getElementById('sf-email').value.toLowerCase().trim(), 
                    joiningDate: document.getElementById('sf-date').value, 
                    baseSalary: parseFloat(document.getElementById('sf-salary').value) || 0, 
                    bloodGroup: document.getElementById('sf-blood').value, 
                    address: document.getElementById('sf-addr').value, 
                    walletEnabled: document.getElementById('sf-wallet-enabled').checked,
                    emergencyContact: document.getElementById('sf-emergency').value, 
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                };

                if (!data.name || !data.email) {
                    AppDialog.toast('Name and Email are required', 'error');
                    return false;
                }

                const ref = firestore.collection('modules').doc('staff_directory').collection('staff');
                const savedRef = await (id ? ref.doc(id).update(data).then(() => ({ id })) : ref.add(data));
                const staffId = id || savedRef.id;
                window.AppLogger.log(id ? 'EDIT_STAFF' : 'ADD_STAFF', 'staff_directory', { name: data.name, email: data.email }, staffId);

                // Auto-provision login account if email doesn't have one yet
                if (data.email) {
                    await this._provisionStaffLogin(data.email, data.name, data.designation);
                }

                AppDialog.toast('Profile saved', 'success');
                return true;
            }
        });
    },

    deleteStaff(id) {
        const s = this.staff[id];
        AppDialog.confirm({ title: 'Remove Staff', msg: 'This will permanently delete this staff record. Proceed?', danger: true, confirmClass: 'btn-danger', onConfirm: () => { firestore.collection('modules').doc('staff_directory').collection('staff').doc(id).delete().then(() => { window.AppLogger.log('DELETE_STAFF', 'staff_directory', { name: s?.name }, id); this.switchView('staff'); }); return true; }});
    },

    markAttendance(staffId, status) {
        const userData = window.currentUserData || {}, isAdmin = userData.isAdmin, staffPerms = userData.permissions?.staff_directory || {};
        if (!isAdmin && !staffPerms.attendance_mark) { AppDialog.toast('Unauthorized', 'error'); return; }
        const dateKey = new Date().toISOString().split('T')[0], s = this.staff[staffId];
        db.ref(`modules/staff_directory/attendance/${dateKey}/${staffId}`).set({ status, timestamp: firebase.database.ServerValue.TIMESTAMP }).then(() => { window.AppLogger.log('MARK_STAFF_ATTENDANCE', 'staff_directory', { name: s?.name, status, date: dateKey }, staffId); });
    }
};
