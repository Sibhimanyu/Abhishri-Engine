/**
 * Staff Directory Module
 * Replicated from Student Directory logic for architectural consistency
 */

window.staffDirectory = {
    staff: {},
    attendance: {},
    isSubscribed: false,
    dataLoaded: false,
    currentView: 'directory', // directory, manage, attendance, attendance_reports, performance, report
    currentStaffId: null,
    searchQuery: '',
    selectedDate: new Date().toISOString().split('T')[0],
    reportType: 'daily', // daily, weekly, monthly

    initialize() {
        // Any initial setup
    },

    subscribe() {
        if (this.isSubscribed) return;
        this.isSubscribed = true;

        // Use Centralized Data Manager
        window.staffDataManager.subscribe();
        window.staffDataManager.onUpdate((data) => {
            this.staff = data;
            this.dataLoaded = true;
            this.render();
        });

        // Initial attendance subscription
        this.subscribeToAttendance(this.selectedDate);
    },

    subscribeToAttendance(dateKey) {
        if (this.attendanceRef) {
            this.attendanceRef.off();
        }

        this.attendanceRef = db.ref(`modules/staff_directory/attendance/${dateKey}`);
        this.attendanceRef.on('value', (snapshot) => {
            this.attendance = snapshot.val() || {};
            if (this.currentView === 'attendance') {
                this.renderAttendance();
            } else if (this.currentView === 'attendance_reports') {
                this.renderAttendanceReports();
            }
        });
    },

    handleDateChange(date) {
        this.selectedDate = date;
        this.subscribeToAttendance(date);
        if (this.currentView === 'attendance_reports') {
            this.renderAttendanceReports();
        }
    },

    switchView(viewName, staffId = null) {
        this.currentView = viewName;
        this.currentStaffId = staffId;

        let hash = `staff/${viewName}`;
        if (staffId) hash += `/${staffId}`;
        
        if (window.location.hash !== `#${hash}`) {
            window.location.hash = hash;
        }

        document.querySelectorAll('#sidebar-nav-staff .nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-staff-${viewName}`);
        if (activeNav) activeNav.classList.add('active');

        document.querySelectorAll('.staff-subview').forEach(el => el.style.display = 'none');
        const activeView = document.getElementById(`staff-view-${viewName}`);
        if (activeView) activeView.style.display = 'block';

        this.render();
        if (typeof closeSidebar === 'function') closeSidebar();
    },

    async render() {
        const hash = window.location.hash.replace('#', '');
        if (!hash.startsWith('staff')) return;

        const parts = hash.split('/');
        if (parts.length >= 2) this.currentView = parts[1];
        if (parts.length >= 3) this.currentStaffId = parts[2];

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const staffPerms = userData.permissions?.staff_directory || {};
        const isMaster = isAdmin === true;

        const subtitle = document.getElementById('staff-screen-subtitle');
        if (subtitle) {
            if (this.currentView === 'report' && this.currentStaffId) {
                const s = this.staff[this.currentStaffId];
                subtitle.innerText = s ? `Profile for ${s.name}` : 'Staff Profile';
            } else {
                subtitle.innerText = `${Object.keys(this.staff).length} staff members registered`;
            }
        }

        // Granular Sidebar Visibility
        const setNavVisible = (id, visible) => {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? 'flex' : 'none';
        };

        setNavVisible('nav-staff-directory', isMaster || staffPerms === true || staffPerms.view);
        setNavVisible('nav-staff-manage', isMaster || staffPerms === true || staffPerms.manage);
        setNavVisible('nav-staff-attendance', isMaster || staffPerms === true || staffPerms.attendance);
        setNavVisible('nav-staff-attendance_reports', isMaster || staffPerms === true || staffPerms.reports);
        setNavVisible('nav-staff-performance', isMaster || staffPerms === true || staffPerms.pulse);

        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) toolbar.innerHTML = '';

        if (this.currentView === 'directory') {
            this.renderDirectory();
        } else if (this.currentView === 'manage') {
            this.renderManage();
        } else if (this.currentView === 'attendance') {
            this.renderAttendance();
        } else if (this.currentView === 'attendance_reports') {
            this.renderAttendanceReports();
        } else if (this.currentView === 'performance') {
            this.renderPerformance();
        } else if (this.currentView === 'report') {
            await this.renderReport(this.currentStaffId);
        }

        // Apply fadeIn to the main content container
        const content = document.getElementById('staff-content');
        if (content) {
            content.style.animation = 'none';
            content.offsetHeight; // trigger reflow
            content.style.animation = 'fadeIn 0.5s ease-out';
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    handleSearch(query) {
        this.searchQuery = query;
        this.render();
    },

    seedSampleStaff() {
        const sample = {
            name: "Dr. Aditi Verma",
            designation: "Senior Academic Coordinator",
            department: "Primary Education",
            phone: "919822001122",
            email: "aditi.v@abhishriacademy.in",
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

    renderDirectory() {
        const container = document.getElementById('staff-content-directory');
        if (!container) return;

        // --- Improved Loading State ---
        if (!this.dataLoaded) {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:100px 0; gap:20px; opacity:0.7;">
                    <div class="loading-spinner"></div>
                    <p style="font-weight:600; color:var(--text-dim); letter-spacing:1px;">SYNCHRONIZING STAFF RECORDS...</p>
                </div>`;
            return;
        }

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const canManage = isAdmin || (userData.permissions?.staff_directory?.manage);

        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <div class="search-box">
                    <i data-lucide="search"></i>
                    <input type="text" placeholder="Search by name or role..." oninput="window.staffDirectory.handleSearch(this.value)" value="${this.searchQuery}">
                </div>
            `;
        }

        const sortedIds = Object.keys(this.staff).filter(id => {
            const s = this.staff[id];
            const q = this.searchQuery.toLowerCase();
            return (s.name || '').toLowerCase().includes(q) || (s.designation || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.staff[a].name || '').localeCompare(this.staff[b].name || ''));

        if (sortedIds.length === 0 && this.searchQuery) {
            container.innerHTML = '<div class="empty-state"><i data-lucide="users"></i><p>No staff members match your search.</p></div>';
            return;
        }

        if (sortedIds.length === 0) {
            container.innerHTML = '<div class="empty-state"><i data-lucide="users"></i><p>No staff records found. Go to "Manage Staff" to add records.</p></div>';
            return;
        }

        let html = `
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-icon" style="background: rgba(241, 97, 91, 0.15); color: var(--accent-primary);">
                        <i data-lucide="users"></i>
                    </div>
                    <div class="metric-info">
                        <h3>Total Staff</h3>
                        <div class="metric-value">${Object.keys(this.staff).length}</div>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon" style="background: rgba(115, 199, 200, 0.15); color: var(--accent-secondary);">
                        <i data-lucide="layers"></i>
                    </div>
                    <div class="metric-info">
                        <h3>Departments</h3>
                        <div class="metric-value">${new Set(Object.values(this.staff).map(s => s.department)).size}</div>
                    </div>
                </div>
            </div>
            <div class="directory-grid">`;

        sortedIds.forEach(id => {
            const s = this.staff[id];
            html += `
                <div class="directory-card" onclick="window.staffDirectory.switchView('report', '${id}')">
                    <div class="member-header">
                        <div class="member-avatar" style="background: var(--accent-secondary); color: white;">${(s.name || 'S').charAt(0).toUpperCase()}</div>
                        <div class="member-info">
                            <h3>${s.name}</h3>
                            <p>${s.designation || 'No Designation'}</p>
                        </div>
                    </div>
                    <div class="member-details">
                        <div class="detail-item"><i data-lucide="phone"></i><span>${s.phone || 'No Phone'}</span></div>
                        <div class="detail-item"><i data-lucide="mail"></i><span class="text-truncate">${s.email || 'No Email'}</span></div>
                    </div>
                    <div class="member-actions">
                        <button class="btn btn-ghost btn-sm" style="width:100%; justify-content:center; color: var(--accent-secondary); font-weight: 800; letter-spacing: 0.5px;">
                            VIEW PROFILE <i data-lucide="chevron-right" style="width:16px; height:16px; margin-left:4px;"></i>
                        </button>
                    </div>
                </div>`;
        });

        container.innerHTML = html + '</div>';
    },

    renderManage() {
        const container = document.getElementById('staff-content-manage');
        if (!container) return;

        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Search staff records..." oninput="window.staffDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-secondary" onclick="window.staffDirectory.seedSampleStaff()"><i data-lucide="database"></i> Seed</button>
                    <button class="btn btn-primary" onclick="window.staffDirectory.showStaffForm()"><i data-lucide="user-plus"></i> Add Staff</button>
                </div>
            `;
        }

        const sortedIds = Object.keys(this.staff).filter(id => {
            const s = this.staff[id];
            const q = this.searchQuery.toLowerCase();
            return (s.name || '').toLowerCase().includes(q) || (s.department || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.staff[a].name || '').localeCompare(this.staff[b].name || ''));

        let html = `
            <div class="section-title">Staff Records</div>
            <table class="console-table">
                <thead><tr><th>Name</th><th>Role</th><th>Contact</th><th>Joining</th><th style="text-align:right">Actions</th></tr></thead>
                <tbody>`;

        sortedIds.forEach(id => {
            const s = this.staff[id];
            html += `
                <tr>
                    <td>
                        <div style="font-weight:700; color:var(--text-main);">${s.name}</div>
                        <div style="font-size:0.75rem; color:var(--text-dim)">${s.department || 'N/A'}</div>
                    </td>
                    <td>${s.designation || 'N/A'}</td>
                    <td>${s.phone || 'N/A'}</td>
                    <td>${s.joiningDate || 'N/A'}</td>
                    <td style="text-align:right">
                        <div class="table-actions" style="justify-content:flex-end; gap:12px;">
                            <button class="btn-icon" onclick="window.staffDirectory.switchView('report', '${id}')" title="Profile View"><i data-lucide="user"></i></button>
                            <button class="btn-icon" onclick="window.staffDirectory.showStaffForm('${id}')" title="Edit Record"><i data-lucide="edit-3"></i></button>
                            <button class="btn-icon btn-icon-danger" onclick="window.staffDirectory.deleteStaff('${id}')" title="Remove staff"><i data-lucide="trash-2"></i></button>
                        </div>
                    </td>
                </tr>`;
        });

        if (sortedIds.length === 0) html += '<tr><td colspan="5" style="text-align:center; padding: 40px;">No staff records found.</td></tr>';
        
        container.innerHTML = html + '</tbody></table>';
    },

    renderAttendance() {
        const container = document.getElementById('staff-content-attendance');
        if (!container) return;

        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Quick find staff..." oninput="window.staffDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>`;
        }

        const sortedIds = Object.keys(this.staff).filter(id => (this.staff[id].name || '').toLowerCase().includes(this.searchQuery.toLowerCase())).sort((a,b) => (this.staff[a].name || '').localeCompare(this.staff[b].name || ''));

        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Staff Attendance Marker</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Mark daily presence for ${new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}</p>
                </div>
                <div class="report-body">
                    <table class="console-table">
                        <thead><tr><th>Staff</th><th>Role</th><th style="text-align:right; min-width:280px;">Quick Actions</th></tr></thead>
                        <tbody>${sortedIds.map(id => {
                            const s = this.staff[id];
                            const att = this.attendance[id] || { status: 'none' };
                            return `
                                <tr>
                                    <td><strong>${s.name}</strong></td>
                                    <td>${s.designation || 'N/A'}</td>
                                    <td style="text-align:right">
                                        <div class="attendance-actions" style="justify-content:flex-end; gap:10px;">
                                            <button class="btn-chip ${att.status === 'present' ? 'active' : ''}" onclick="window.staffDirectory.markAttendance('${id}', 'present')">PRESENT</button>
                                            <button class="btn-chip btn-chip-danger ${att.status === 'absent' ? 'active' : ''}" onclick="window.staffDirectory.markAttendance('${id}', 'absent')">ABSENT</button>
                                            <button class="btn-chip btn-chip-warning ${att.status === 'late' ? 'active' : ''}" onclick="window.staffDirectory.markAttendance('${id}', 'late')">LATE</button>
                                        </div>
                                    </td>
                                </tr>`;
                        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    },

    renderAttendanceReports() {
        const container = document.getElementById('staff-content-attendance-reports');
        if (!container) return;

        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <div class="report-controls" style="display:flex; gap:16px; align-items:center;">
                    <div class="search-box"><i data-lucide="calendar"></i><input type="date" class="form-control" value="${this.selectedDate}" onchange="window.staffDirectory.handleDateChange(this.value)"></div>
                    <div class="segment-controller">
                        <button class="segment-btn ${this.reportType === 'daily' ? 'active' : ''}" onclick="window.staffDirectory.switchReportType('daily')">Daily</button>
                        <button class="segment-btn ${this.reportType === 'weekly' ? 'active' : ''}" onclick="window.staffDirectory.switchReportType('weekly')">Weekly</button>
                        <button class="segment-btn ${this.reportType === 'monthly' ? 'active' : ''}" onclick="window.staffDirectory.switchReportType('monthly')">Monthly</button>
                    </div>
                </div>
                <button class="btn btn-secondary" onclick="window.staffDirectory.printCurrentReport()"><i data-lucide="printer"></i> Print Analysis</button>
            `;
        }

        if (this.reportType === 'daily') this.renderDailyReport(container);
        else if (this.reportType === 'weekly') this.renderWeeklyReport(container);
        else if (this.reportType === 'monthly') this.renderMonthlyReport(container);
    },

    renderDailyReport(container) {
        let p = 0, a = 0, l = 0;
        Object.values(this.attendance).forEach(val => { if (val.status === 'present') p++; else if (val.status === 'absent') a++; else if (val.status === 'late') l++; });
        const dateDisplay = new Date(this.selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Daily Staff Attendance</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Detailed breakdown for ${dateDisplay}</p>
                </div>
                <div class="report-body">
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-icon" style="background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary);"><i data-lucide="users"></i></div>
                            <div class="metric-info"><h3>Total Staff</h3><div class="metric-value">${Object.keys(this.staff).length}</div></div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon" style="background: rgba(74, 222, 128, 0.1); color: var(--success);"><i data-lucide="check-circle"></i></div>
                            <div class="metric-info"><h3>Present</h3><div class="metric-value" style="color:var(--success)">${p}</div></div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon" style="background: rgba(241, 97, 91, 0.1); color: var(--accent-primary);"><i data-lucide="user-x"></i></div>
                            <div class="metric-info"><h3>Absent</h3><div class="metric-value" style="color:var(--accent-primary)">${a}</div></div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon" style="background: rgba(251, 191, 36, 0.1); color: #fbbf24;"><i data-lucide="clock"></i></div>
                            <div class="metric-info"><h3>Late</h3><div class="metric-value" style="color:#fbbf24">${l}</div></div>
                        </div>
                    </div>
                    <table class="console-table">
                        <thead><tr><th>Staff</th><th>Role</th><th>Status</th><th style="text-align:right">Time</th></tr></thead>
                        <tbody>${Object.keys(this.staff).sort((a,b) => (this.staff[a].name || '').localeCompare(this.staff[b].name || '')).map(id => {
                            const att = this.attendance[id] || { status: 'none' };
                            const labels = { 'present': 'Present', 'absent': 'Absent', 'late': 'Late', 'none': 'Not Marked' };
                            const classes = { 'present': 'status-success', 'absent': 'status-danger', 'late': 'status-warning', 'none': 'status-none' };
                            return `<tr><td><strong>${this.staff[id].name}</strong></td><td>${this.staff[id].designation || 'N/A'}</td><td><span class="status-pill ${classes[att.status]}">${labels[att.status]}</span></td><td style="text-align:right; font-size:0.85rem; color:var(--text-dim)">${att.timestamp ? new Date(att.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td></tr>`;
                        }).join('')}</tbody>
                    </table>
                </div>
            </div>`;
    },

    async renderWeeklyReport(container) {
        container.innerHTML = '<div class="empty-state"><i data-lucide="loader" style="animation:spin 1s linear infinite"></i><p>Compiling weekly matrix...</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        const dates = []; for (let i = 6; i >= 0; i--) { const d = new Date(this.selectedDate); d.setDate(d.getDate() - i); dates.push(d.toISOString().split('T')[0]); }
        const weeklyData = {};
        for (const d of dates) { const snap = await db.ref(`modules/staff_directory/attendance/${d}`).once('value'); weeklyData[d] = snap.val() || {}; }

        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Weekly Performance Matrix</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Presence overview for the last 7 days</p>
                </div>
                <div class="report-body" style="padding:0;">
                    <div style="overflow-x:auto;">
                        <table class="console-table" style="margin-top:0; border:none; border-radius:0;">
                            <thead><tr><th style="width:250px;">Staff</th>${dates.map(d => `<th style="text-align:center; font-size:0.7rem">${d.split('-').slice(1).reverse().join('/')}</th>`).join('')}<th style="text-align:right; width:80px;">Rate</th></tr></thead>
                            <tbody>${Object.keys(this.staff).sort((a,b) => (this.staff[a].name || '').localeCompare(this.staff[b].name || '')).map(id => {
                                let p = 0; let row = `<tr><td><strong>${this.staff[id].name}</strong></td>`;
                                dates.forEach(d => { const s = weeklyData[d][id]?.status; if (s === 'present') { p++; row += '<td><div class="attendance-matrix-cell matrix-present">P</div></td>'; } else if (s === 'late') { p++; row += '<td><div class="attendance-matrix-cell matrix-late">L</div></td>'; } else if (s === 'absent') row += '<td><div class="attendance-matrix-cell matrix-absent">A</div></td>'; else row += '<td><div class="attendance-matrix-cell matrix-empty">-</div></td>'; });
                                row += `<td style="text-align:right; font-weight:800; color:var(--accent-secondary);">${Math.round((p/7)*100)}%</td></tr>`;
                                return row;
                            }).join('')}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async renderMonthlyReport(container) {
        const monthKey = this.selectedDate.slice(0, 7);
        container.innerHTML = '<div class="empty-state"><i data-lucide="loader" style="animation:spin 1s linear infinite"></i><p>Compiling monthly analytics...</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        const snap = await db.ref('modules/staff_directory/attendance').orderByKey().startAt(monthKey).endAt(`${monthKey}-\uf8ff`).once('value');
        const monthData = snap.val() || {};

        const monthDisplay = new Date(this.selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Monthly Staff Audit</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Presence summary for ${monthDisplay}</p>
                </div>
                <div class="report-body">
                    <table class="console-table">
                        <thead><tr><th>Staff</th><th>Present</th><th>Absent</th><th>Late</th><th style="text-align:right">Rate</th></tr></thead>
                        <tbody>${Object.keys(this.staff).sort((a,b) => (this.staff[a].name || '').localeCompare(this.staff[b].name || '')).map(id => {
                            const stats = { p: 0, a: 0, l: 0 };
                            Object.keys(monthData).forEach(d => { const s = monthData[d][id]?.status; if (s === 'present') stats.p++; else if (s === 'absent') stats.a++; else if (s === 'late') stats.l++; });
                            const total = stats.p + stats.a + stats.l;
                            return `<tr><td><strong>${this.staff[id].name}</strong></td><td>${stats.p}</td><td>${stats.a}</td><td>${stats.l}</td><td style="text-align:right; font-weight:800; color:var(--accent-secondary)">${total > 0 ? Math.round(((stats.p+stats.l)/total)*100) : 0}%</td></tr>`;
                        }).join('')}</tbody>
                    </table>
                </div>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    switchReportType(type) { this.reportType = type; this.renderAttendanceReports(); },

    printCurrentReport() {
        const type = this.reportType.toUpperCase();
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<html><head><title>Staff ${type} Report</title><style>body { font-family: sans-serif; padding: 40px; } .header { border-bottom: 3px solid #F1615B; padding-bottom: 20px; margin-bottom: 30px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #eee; padding: 12px; text-align: left; }</style></head><body><div class="header"><h1>ABHISHRI ACADEMY</h1><p>Staff Attendance ${type} Audit</p></div>${document.querySelector('#staff-content-attendance-reports table').outerHTML}</body></html>`);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    },

    renderPerformance() {
        const id = this.currentStaffId;
        if (id) { this.renderStaffPulse(id); return; }
        const container = document.getElementById('staff-content-performance');
        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) toolbar.innerHTML = `<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Filter staff..." oninput="window.staffDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>`;

        const sortedIds = Object.keys(this.staff).filter(id => (this.staff[id].name || '').toLowerCase().includes(this.searchQuery.toLowerCase()));
        
        let html = `
            <div class="report-header" style="margin-bottom:32px;"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Staff Performance Pulse</h2><p style="color:var(--text-dim); font-size:1.1rem;">Track achievements, professional growth, and activity logs.</p></div>
            <div class="directory-grid">`;
        
        sortedIds.forEach(id => {
            const s = this.staff[id];
            html += `
                <div class="directory-card" onclick="window.staffDirectory.switchView('performance', '${id}')" style="border-left:4px solid var(--accent-secondary); display:flex; flex-direction:column; justify-content:space-between; height:100%;">
                    <div class="member-header">
                        <div class="member-avatar" style="background:rgba(115, 199, 200, 0.15); color:var(--accent-secondary); font-size:1.5rem;">${(s.name || 'S')[0]}</div>
                        <div class="member-info"><h3>${s.name}</h3><p>${s.designation || 'No Role'}</p></div>
                    </div>
                    <div class="member-actions" style="margin-top:auto; padding-top:12px; border-top:1px solid var(--card-border);">
                        <span style="color:var(--accent-secondary); font-size:0.85rem; font-weight:700; display:flex; align-items:center; gap:6px;">VIEW ACTIVITY <i data-lucide="arrow-right-circle" style="width:16px; height:16px;"></i></span>
                    </div>
                </div>`;
        });
        container.innerHTML = html + '</div>';
    },

    async renderStaffPulse(id) {
        const container = document.getElementById('staff-content-performance');
        const s = this.staff[id];
        if (!s) return;

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const staffPerms = userData.permissions?.staff_directory || {};
        const isMaster = isAdmin || staffPerms === true;

        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) {
            const canPulse = isMaster || staffPerms === true || staffPerms.pulse;
            toolbar.innerHTML = `
                <button class="btn btn-secondary" onclick="window.staffDirectory.switchView('performance')"><i data-lucide="arrow-left"></i> All Staff</button>
                ${canPulse ? `<button class="btn btn-primary" onclick="window.staffDirectory.showPulseEntryForm('${id}')"><i data-lucide="plus-circle"></i> Log Performance</button>` : ''}
            `;
        }
        
        let logsHtml = '';
        try {
            const snap = await firestore.collection('modules').doc('staff_directory').collection('staff').doc(id).collection('performance_logs').orderBy('date', 'desc').limit(15).get();
            snap.forEach(doc => {
                const d = doc.data();
                logsHtml += `
                    <div class="console-card" style="margin-bottom:20px; border-left:4px solid var(--accent-secondary); padding:20px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <span style="font-size:0.75rem; font-weight:700; color:var(--text-dim); text-transform:uppercase;">${d.date}</span>
                            <div style="color:#fbbf24">${'★'.repeat(d.rating || 3)}${'☆'.repeat(5-(d.rating||3))}</div>
                        </div>
                        <h4 style="margin-bottom:8px; font-size:1.1rem;">${d.title}</h4>
                        <p style="color:var(--text-dim); line-height:1.5; font-size:0.95rem;">${d.summary}</p>
                    </div>`;
            });
        } catch (err) {
            console.warn('Staff Pulse fetch aborted:', err);
            logsHtml = '<div class="empty-state"><i data-lucide="lock" style="margin-bottom:10px;"></i><p style="color:var(--text-dim);">No permission to view activity logs.</p></div>';
        }

        container.innerHTML = `
            <div class="profile-card-main" style="margin-top:0; margin-bottom:32px; display:flex; align-items:center; gap:32px;">
                <div class="profile-avatar-wrapper" style="margin-bottom:0; width:80px; height:80px; font-size:2rem;">${(s.name || 'S')[0]}</div>
                <div>
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:4px;">${s.name}'s Activity</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Professional growth timeline and achievement records</p>
                </div>
            </div>
            <div class="pulse-timeline">${logsHtml || '<div class="empty-state"><i data-lucide="activity"></i><p>No activity logs found.</p></div>'}</div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    showPulseEntryForm(staffId) {
        AppDialog.confirm({
            title: 'Log Performance Entry',
            content: `
                <div class="form-group" style="margin-bottom:15px;"><label>Entry Title</label><input type="text" id="p-title" class="form-control" placeholder="Achievement or Milestone..."></div>
                <div class="form-group" style="margin-bottom:15px;"><label>Summary / Notes</label><textarea id="p-summary" class="form-control" rows="4"></textarea></div>
                <div class="form-grid-2">
                    <div class="form-group"><label>Rating (1-5)</label><input type="number" id="p-rating" class="form-control" value="3" min="1" max="5"></div>
                    <div class="form-group"><label>Entry Date</label><input type="date" id="p-date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
                </div>`,
            onConfirm: () => {
                const data = { title: document.getElementById('p-title').value, summary: document.getElementById('p-summary').value, rating: parseInt(document.getElementById('p-rating').value), date: document.getElementById('p-date').value, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
                if (!data.title || !data.summary) { AppDialog.toast('Required fields missing', 'error'); return false; }
                firestore.collection('modules').doc('staff_directory').collection('staff').doc(staffId).collection('performance_logs').add(data).then(() => this.renderStaffPulse(staffId));
                return true;
            }
        });
    },

    async renderReport(id) {
        const container = document.getElementById('staff-content-report');
        if (!container || !id) return;
        this.switchView('report');
        container.innerHTML = '<div class="report-page" style="padding:100px; text-align:center; margin-top: 40px;"><div class="loading-spinner" style="margin:0 auto 20px;"></div><p style="color:var(--text-dim); font-size:1.1rem; font-weight:600;">Opening staff profile...</p></div>';
        const s = this.staff[id];
        if (!s) return;

        // Wallet Balance logic from the Expense module
        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const feePerms = userData.permissions?.fees_accounting || {};
        const canViewFees = isAdmin || feePerms === true || feePerms.view;

        const staffPerms = userData.permissions?.staff_directory || {};
        const canViewPulse = isAdmin || staffPerms === true || staffPerms.view;

        let sFund = 0;
        let sSpend = 0;
        if (canViewFees) {
            sFund = window.feesManager?.expenses?.filter(e => e.staffId === id && e.type === 'funding').reduce((a,b)=>a+b.amount, 0) || 0;
            sSpend = window.feesManager?.expenses?.filter(e => e.staffId === id && e.type === 'spend').reduce((a,b)=>a+b.amount, 0) || 0;
        }
        const balance = sFund - sSpend;
        
        let latestPulses = [];
        if (canViewPulse) {
            try {
                const pulseSnap = await firestore.collection('modules').doc('staff_directory').collection('staff').doc(id).collection('performance_logs').orderBy('date', 'desc').limit(3).get();
                pulseSnap.forEach(doc => latestPulses.push(doc.data()));
            } catch (err) {
                console.warn('Permission denied fetching staff pulselogs:', err);
            }
        }

        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <button class="btn btn-secondary" onclick="window.staffDirectory.switchView('directory')"><i data-lucide="arrow-left"></i> Back</button>
                <button class="btn btn-secondary" onclick="window.staffDirectory.printStaffReport('${id}')"><i data-lucide="printer"></i> Print Profile</button>
            `;
        }

        container.innerHTML = `
            <div class="report-page" style="margin-top: 20px; border: none; background: transparent; box-shadow: none;">
                <div class="report-hero" style="background: linear-gradient(135deg, rgba(115, 199, 200, 0.2) 0%, rgba(241, 97, 91, 0.1) 100%); border-radius: 24px; padding: 48px; border: 1px solid var(--card-border); margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 32px;">
                    <div style="display: flex; gap: 32px; align-items: center;">
                        <div class="profile-avatar-wrapper" style="margin: 0; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.1);">${(s.name || 'S')[0]}</div>
                        <div>
                            <h1 style="font-size: 3.5rem; font-weight: 900; margin: 0 0 8px 0; letter-spacing: -2px; line-height: 1;">${s.name}</h1>
                            <div style="display: flex; gap: 12px; align-items: center;">
                                <span class="badge badge-success" style="font-size: 0.85rem; padding: 6px 18px; background: var(--accent-secondary); color: #000; font-weight: 800;">OFFICIAL STAFF</span>
                                <span style="color: var(--text-main); font-size: 1.2rem; font-weight: 600; opacity: 0.8;">${s.designation || 'No Role'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="profile-actions" style="display: flex; gap: 16px;">
                    </div>
                </div>

                <div class="profile-card-main" style="margin-top: 0; border-radius: 24px;">
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-icon" style="background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary);"><i data-lucide="calendar"></i></div>
                            <div class="metric-info"><h3>Attendance</h3><div class="metric-value">98%</div></div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon" style="background: ${canViewFees ? (balance >= 0 ? 'rgba(74, 222, 128, 0.1)' : 'rgba(241, 97, 91, 0.1)') : 'rgba(255,255,255,0.05)'}; color: ${canViewFees ? (balance >= 0 ? 'var(--success)' : 'var(--accent-primary)') : 'var(--text-dim)'};"><i data-lucide="wallet"></i></div>
                            <div class="metric-info"><h3>Wallet Balance</h3><div class="metric-value" style="color:${canViewFees ? (balance >= 0 ? 'var(--success)' : 'var(--accent-primary)') : 'var(--text-dim)'}">${canViewFees ? `₹${balance.toLocaleString()}` : 'No Access'}</div></div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon" style="background: ${canViewPulse ? 'rgba(241, 97, 91, 0.1)' : 'rgba(255,255,255,0.05)'}; color: ${canViewPulse ? 'var(--accent-primary)' : 'var(--text-dim)'};"><i data-lucide="activity"></i></div>
                            <div class="metric-info"><h3>Activity Logs</h3><div class="metric-value" style="color:${canViewPulse ? '' : 'var(--text-dim)'}">${canViewPulse ? `${latestPulses.length} Total` : 'No Access'}</div></div>
                        </div>
                    </div>

                    <div class="profile-info-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:32px; margin-top: 40px;">
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="user"></i> Personal Information</div>
                            <div class="data-grid" style="grid-template-columns: 1fr 1fr;">
                                <div class="data-item"><div class="data-label">Full Name</div><div class="data-value">${s.name}</div></div>
                                <div class="data-item"><div class="data-label">Department</div><div class="data-value">${s.department || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Joined On</div><div class="data-value">${s.joiningDate || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Blood Group</div><div class="data-value">${s.bloodGroup || 'N/A'}</div></div>
                            </div>
                        </div>
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="phone"></i> Contact Details</div>
                            <div class="data-grid" style="grid-template-columns: 1fr;">
                                <div class="data-item"><div class="data-label">Phone</div><div class="data-value">${s.phone || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Email</div><div class="data-value">${s.email || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Address</div><div class="data-value">${s.address || 'N/A'}</div></div>
                            </div>
                        </div>
                    </div>

                    <div class="profile-info-grid" style="display:grid; grid-template-columns: 1.5fr 1fr; gap:32px; margin-top: 32px;">
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="sparkles"></i> Recent Performance</div>
                            <div class="pulse-mini-list">${!canViewPulse ? '<div class="empty-state" style="padding:20px;"><i data-lucide="lock" style="margin-bottom:10px;"></i><p style="color:var(--text-dim);">No permission to view data.</p></div>' : (latestPulses.length > 0 ? latestPulses.map(p => `
                                <div style="padding:16px; background:rgba(255,255,255,0.03); border-radius:12px; margin-bottom:12px; border-left:4px solid var(--accent-secondary)">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><strong>${p.title}</strong><small style="color:var(--text-dim)">${p.date}</small></div>
                                    <p style="font-size:0.9rem; color:var(--text-dim); margin:0; line-height:1.5;">${p.summary}</p>
                                </div>`).join('') : '<div class="empty-state" style="padding:20px;"><p style="color:var(--text-dim);">No performance logs yet.</p></div>')}
                            </div>
                        </div>
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="shield-check"></i> Employment Status</div>
                            <div class="data-grid" style="grid-template-columns: 1fr;">
                                <div class="data-item"><div class="data-label">Employee ID</div><div class="data-value">EMP-${id.slice(-6).toUpperCase()}</div></div>
                                <div class="data-item"><div class="data-label">Contract Type</div><div class="data-value">Full-Time</div></div>
                                <div class="data-item"><div class="data-label">Emergency</div><div class="data-value">${s.emergencyContact || 'N/A'}</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    },

    printStaffReport(id) {
        const s = this.staff[id]; if (!s) return;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<html><head><title>Staff Profile - ${s.name}</title><style>body { font-family: sans-serif; padding: 40px; color: #333; } .header { border-bottom: 3px solid #73C7C8; padding-bottom: 20px; margin-bottom: 30px; } .info-section { margin-bottom: 30px; } .info-title { font-weight: bold; border-bottom: 1px solid #eee; margin-bottom: 10px; padding-bottom: 5px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; } label { color: #888; font-size: 12px; display: block; }</style></head><body><div class="header"><h1>ABHISHRI ACADEMY</h1><p>Official Staff Profile Document</p></div><div class="info-section"><div class="info-title">Personal Details</div><div class="grid"><div><label>Name</label>${s.name}</div><div><label>Role</label>${s.designation}</div><div><label>Phone</label>${s.phone}</div><div><label>Email</label>${s.email}</div></div></div><div class="footer" style="margin-top:50px; font-size:10px; color:#aaa; text-align:center;">Generated on ${new Date().toLocaleString()}</div><script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        printWindow.document.close();
    },

    showStaffForm(id = null) {
        const s = id ? this.staff[id] : {};
        const content = `
            <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="sf-name" class="form-control" value="${s.name || ''}" />
            </div>
            <div class="form-grid-2">
                <div class="form-group">
                    <label>Designation</label>
                    <input type="text" id="sf-role" class="form-control" value="${s.designation || ''}" />
                </div>
                <div class="form-group">
                    <label>Department</label>
                    <input type="text" id="sf-dept" class="form-control" value="${s.department || ''}" />
                </div>
            </div>
            <div class="form-grid-2">
                <div class="form-group">
                    <label>Phone</label>
                    <input type="text" id="sf-phone" class="form-control" value="${s.phone || ''}" />
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="sf-email" class="form-control" value="${s.email || ''}" />
                </div>
            </div>
            <div class="form-grid-2">
                <div class="form-group">
                    <label>Joining Date</label>
                    <input type="date" id="sf-joining" class="form-control" value="${s.joiningDate || ''}" />
                </div>
                <div class="form-group">
                    <label>Blood Group</label>
                    <input type="text" id="sf-blood" class="form-control" value="${s.bloodGroup || ''}" />
                </div>
            </div>
            <div class="form-group">
                <label>Home Address</label>
                <textarea id="sf-addr" class="form-control" rows="2">${s.address || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Emergency Contact Info</label>
                <input type="text" id="sf-emergency" class="form-control" value="${s.emergencyContact || ''}" />
            </div>`;
        
        AppDialog.confirm({ 
            title: id ? 'Edit Staff Profile' : 'Add New Staff', 
            content, 
            width: '600px', 
            onConfirm: () => {
                const data = { 
                    name: document.getElementById('sf-name').value, 
                    designation: document.getElementById('sf-role').value, 
                    department: document.getElementById('sf-dept').value, 
                    phone: document.getElementById('sf-phone').value, 
                    email: document.getElementById('sf-email').value, 
                    joiningDate: document.getElementById('sf-joining').value, 
                    bloodGroup: document.getElementById('sf-blood').value, 
                    address: document.getElementById('sf-addr').value, 
                    emergencyContact: document.getElementById('sf-emergency').value, 
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                };
                if (!data.name) return false;
                const ref = firestore.collection('modules').doc('staff_directory').collection('staff');
                (id ? ref.doc(id).update(data) : ref.add(data)).then(() => AppDialog.toast('Staff record saved', 'success'));
                return true;
            }
        });
    },

    deleteStaff(id) {
        AppDialog.confirm({ title: 'Remove Staff', msg: 'This will permanently delete this staff record. Proceed?', danger: true, confirmClass: 'btn-danger', onConfirm: () => { firestore.collection('modules').doc('staff_directory').collection('staff').doc(id).delete().then(() => { this.switchView('directory'); }); return true; }});
    },

    markAttendance(staffId, status) {
        const dateKey = new Date().toISOString().split('T')[0];
        db.ref(`modules/staff_directory/attendance/${dateKey}/${staffId}`).set({ status, timestamp: firebase.database.ServerValue.TIMESTAMP });
    }
};
