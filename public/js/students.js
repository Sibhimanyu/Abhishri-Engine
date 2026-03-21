/**
 * Student Directory Module (Firestore Version)
 * Handles student record management, attendance, and performance
 */

window.studentDirectory = {
    students: {},
    attendance: {},
    isSubscribed: false,
    dataLoaded: false,
    currentView: 'directory', // directory, manage, attendance, attendance_reports, performance, report
    currentStudentId: null,
    searchQuery: '',
    selectedDate: new Date().toISOString().split('T')[0],
    reportType: 'daily', // daily, weekly, monthly

    initialize() {
        // Any initial setup
    },

    seedSampleStudent() {
        const user = firebase.auth().currentUser;
        if (!user) {
            AppDialog.toast('You must be signed in to seed data.', 'error');
            return;
        }

        const sample = {
            name: "Aarav Sharma",
            dob: "2018-05-15",
            age: "7",
            gender: "Male",
            address: "Flat 402, Lotus Apartments, Mumbai, Maharashtra, 400001",
            fatherName: "Rajesh Sharma",
            fatherPhone: "919876543210",
            motherName: "Priya Sharma",
            motherPhone: "919876543211",
            admissionForClass: "Grade 2",
            bloodGroup: "O+",
            nationality: "Indian",
            religion: "Hindu",
            feePaid: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        firestore.collection('modules').doc('student_directory').collection('students').add(sample)
            .then(() => AppDialog.toast('Sample student added!', 'success'))
            .catch(err => AppDialog.toast('Error seeding data: ' + err.message, 'error'));
    },

    subscribe() {
        if (this.isSubscribed) return;
        this.isSubscribed = true;

        // Use Centralized Data Manager
        window.studentDataManager.subscribe();
        window.studentDataManager.onUpdate((data) => {
            this.students = data;
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

        this.attendanceRef = db.ref(`modules/student_directory/attendance/${dateKey}`);
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

    switchView(viewName, studentId = null) {
        this.currentView = viewName;
        this.currentStudentId = studentId;

        let hash = `students/${viewName}`;
        if (studentId) hash += `/${studentId}`;
        window.location.hash = hash;

        document.querySelectorAll('#sidebar-nav-students .nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-student-${viewName}`);
        if (activeNav) activeNav.classList.add('active');

        document.querySelectorAll('.student-subview').forEach(el => el.style.display = 'none');
        const activeView = document.getElementById(`student-view-${viewName}`);
        if (activeView) activeView.style.display = 'block';

        this.render();
        if (typeof closeSidebar === 'function') closeSidebar();
    },

    async render() {
        const hash = window.location.hash.replace('#', '');
        if (!hash.startsWith('students')) return;

        const parts = hash.split('/');
        if (parts.length >= 2) this.currentView = parts[1];
        if (parts.length >= 3) this.currentStudentId = parts[2];

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const studentPerms = userData.permissions?.student_directory || {};
        const perfPerms = userData.permissions?.student_performance || {};
        const isMaster = isAdmin === true;

        const subtitle = document.getElementById('student-screen-subtitle');
        if (subtitle) {
            if (this.currentView === 'report' && this.currentStudentId) {
                const s = this.students[this.currentStudentId];
                subtitle.innerText = s ? `Detailed Report for ${s.name}` : 'Student Report';
            } else {
                subtitle.innerText = `${Object.keys(this.students).length} students registered`;
            }
        }

        // Granular Sidebar Visibility
        const setNavVisible = (id, visible) => {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? 'flex' : 'none';
        };

        setNavVisible('nav-student-directory', isMaster || studentPerms === true || studentPerms.view);
        setNavVisible('nav-student-manage', isMaster || studentPerms === true || studentPerms.manage);
        setNavVisible('nav-student-attendance', isMaster || studentPerms === true || studentPerms.attendance);
        setNavVisible('nav-student-attendance_reports', isMaster || studentPerms === true || studentPerms.reports);
        setNavVisible('nav-student-performance', isMaster || perfPerms === true || perfPerms.view);

        const toolbar = document.getElementById('student-toolbar');
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
            await this.renderReport(this.currentStudentId);
        }

        // Apply fadeIn to the main content container
        const studentContent = document.getElementById('student-content');
        if (studentContent) {
            studentContent.style.animation = 'none';
            studentContent.offsetHeight; // trigger reflow
            studentContent.style.animation = 'fadeIn 0.5s ease-out';
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    handleSearch(query) {
        this.searchQuery = query;
        this.render();
    },

    renderDirectory() {
        const container = document.getElementById('student-content-directory');
        if (!container) return;

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <div class="search-box">
                    <i data-lucide="search"></i>
                    <input type="text" placeholder="Search by name or ID..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}">
                </div>
                <div class="header-actions">
                    <button class="btn btn-secondary" onclick="window.studentDirectory.seedSampleStudent()"><i data-lucide="database"></i></button>
                    <button class="btn btn-primary" onclick="window.studentDirectory.switchView('manage')"><i data-lucide="plus"></i> New Student</button>
                </div>
            `;
        }

        const filteredIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            const q = this.searchQuery.toLowerCase();
            return (s.name || '').toLowerCase().includes(q) || (s.admissionForClass || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        let html = `
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-icon" style="background: rgba(241, 97, 91, 0.15); color: var(--accent-primary);">
                        <i data-lucide="users"></i>
                    </div>
                    <div class="metric-info">
                        <h3>Total Enrolled</h3>
                        <div class="metric-value">${Object.keys(this.students).length}</div>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon" style="background: rgba(115, 199, 200, 0.15); color: var(--accent-secondary);">
                        <i data-lucide="layers"></i>
                    </div>
                    <div class="metric-info">
                        <h3>Active Classes</h3>
                        <div class="metric-value">${new Set(Object.values(this.students).map(s => s.admissionForClass)).size}</div>
                    </div>
                </div>
            </div>
            <div class="directory-grid">`;

        filteredIds.forEach(id => {
            const s = this.students[id];
            html += `
                <div class="directory-card" onclick="window.studentDirectory.switchView('report', '${id}')">
                    <div class="member-header">
                        <div class="member-avatar">${(s.name || 'S').charAt(0).toUpperCase()}</div>
                        <div class="member-info">
                            <h3>${s.name}</h3>
                            <p>${s.admissionForClass || 'No Class'}</p>
                        </div>
                    </div>
                    <div class="member-details">
                        <div class="detail-item"><i data-lucide="phone"></i><span>${s.fatherPhone || s.motherPhone || 'No Phone'}</span></div>
                        <div class="detail-item"><i data-lucide="map-pin"></i><span class="text-truncate">${s.address || 'No Address'}</span></div>
                    </div>
                    <div class="member-actions">
                        <button class="btn btn-ghost btn-sm" style="width:100%; justify-content:center; color: var(--accent-secondary); font-weight: 800; letter-spacing: 0.5px;">
                            VIEW PROFILE <i data-lucide="chevron-right" style="width:16px; height:16px; margin-left:4px;"></i>
                        </button>
                    </div>
                </div>`;
        });

        if (filteredIds.length === 0) html = '<div class="empty-state"><i data-lucide="users"></i><p>No students match your search.</p></div>';
        
        container.innerHTML = html + '</div>';
    },

    renderManage() {
        const container = document.getElementById('student-content-manage');
        if (!container) return;

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Search admissions..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>
                <button class="btn btn-primary" onclick="window.studentDirectory.showStudentForm()"><i data-lucide="user-plus"></i> New Admission</button>
            `;
        }

        const filteredIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            const q = this.searchQuery.toLowerCase();
            return (s.name || '').toLowerCase().includes(q) || (s.fatherName || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        let html = `
            <div class="section-title">Admission Records</div>
            <table class="console-table">
                <thead><tr><th>Student</th><th>Parent</th><th>Contact</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
                <tbody>`;

        filteredIds.forEach(id => {
            const s = this.students[id];
            html += `
                <tr>
                    <td>
                        <div style="font-weight:700; color:var(--text-main);">${s.name}</div>
                        <div style="font-size:0.75rem; color:var(--text-dim)">${s.admissionForClass}</div>
                    </td>
                    <td>${s.fatherName || s.motherName || 'N/A'}</td>
                    <td>${s.fatherPhone || s.motherPhone || 'N/A'}</td>
                    <td><span class="status-pill ${s.feePaid ? 'status-success' : 'status-warning'}">${s.feePaid ? 'Enrolled' : 'Pending'}</span></td>
                    <td style="text-align:right">
                        <div class="table-actions" style="justify-content:flex-end; gap:12px;">
                            <button class="btn-icon" onclick="window.studentDirectory.renderReport('${id}')" title="Profile View"><i data-lucide="user"></i></button>
                            <button class="btn-icon" onclick="window.studentDirectory.showStudentForm('${id}')" title="Edit Record"><i data-lucide="edit-3"></i></button>
                            <button class="btn-icon btn-icon-danger" onclick="window.studentDirectory.deleteStudent('${id}')" title="Remove student"><i data-lucide="trash-2"></i></button>
                        </div>
                    </td>
                </tr>`;
        });

        if (filteredIds.length === 0) html += '<tr><td colspan="5" style="text-align:center; padding: 40px;">No admission records found.</td></tr>';
        
        container.innerHTML = html + '</tbody></table>';
    },

    renderAttendance() {
        const container = document.getElementById('student-content-attendance');
        if (!container) return;

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Quick find student..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>`;
        }

        const filteredIds = Object.keys(this.students).filter(id => (this.students[id].name || '').toLowerCase().includes(this.searchQuery.toLowerCase())).sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Attendance Marker</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Mark daily presence for ${new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}</p>
                </div>
                <div class="report-body">
                    <table class="console-table">
                        <thead><tr><th>Student</th><th>Class</th><th style="text-align:right; min-width:280px;">Quick Actions</th></tr></thead>
                        <tbody>${filteredIds.map(id => {
                            const s = this.students[id];
                            const att = this.attendance[id] || { status: 'none' };
                            return `
                                <tr>
                                    <td><strong>${s.name}</strong></td>
                                    <td>${s.admissionForClass || 'N/A'}</td>
                                    <td style="text-align:right">
                                        <div class="attendance-actions" style="justify-content:flex-end; gap:10px;">
                                            <button class="btn-chip ${att.status === 'present' ? 'active' : ''}" onclick="window.studentDirectory.markAttendance('${id}', 'present')">PRESENT</button>
                                            <button class="btn-chip btn-chip-danger ${att.status === 'absent' ? 'active' : ''}" onclick="window.studentDirectory.markAttendance('${id}', 'absent')">ABSENT</button>
                                            <button class="btn-chip btn-chip-warning ${att.status === 'late' ? 'active' : ''}" onclick="window.studentDirectory.markAttendance('${id}', 'late')">LATE</button>
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
        const container = document.getElementById('student-content-attendance-reports');
        if (!container) return;

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <div class="report-controls" style="display:flex; gap:16px; align-items:center;">
                    <div class="search-box"><i data-lucide="calendar"></i><input type="date" class="form-control" value="${this.selectedDate}" onchange="window.studentDirectory.handleDateChange(this.value)"></div>
                    <div class="segment-controller">
                        <button class="segment-btn ${this.reportType === 'daily' ? 'active' : ''}" onclick="window.studentDirectory.switchReportType('daily')">Daily</button>
                        <button class="segment-btn ${this.reportType === 'weekly' ? 'active' : ''}" onclick="window.studentDirectory.switchReportType('weekly')">Weekly</button>
                        <button class="segment-btn ${this.reportType === 'monthly' ? 'active' : ''}" onclick="window.studentDirectory.switchReportType('monthly')">Monthly</button>
                    </div>
                </div>
                <button class="btn btn-secondary" onclick="window.studentDirectory.printCurrentReport()"><i data-lucide="printer"></i> Print Analysis</button>
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
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Daily Attendance Insight</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Detailed breakdown for ${dateDisplay}</p>
                </div>
                <div class="report-body">
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-icon" style="background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary);"><i data-lucide="users"></i></div>
                            <div class="metric-info"><h3>Expected</h3><div class="metric-value">${Object.keys(this.students).length}</div></div>
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
                        <thead><tr><th>Student</th><th>Class</th><th>Status</th><th style="text-align:right">Time</th></tr></thead>
                        <tbody>${Object.keys(this.students).sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || '')).map(id => {
                            const att = this.attendance[id] || { status: 'none' };
                            const labels = { 'present': 'Present', 'absent': 'Absent', 'late': 'Late', 'none': 'Not Marked' };
                            const classes = { 'present': 'status-success', 'absent': 'status-danger', 'late': 'status-warning', 'none': 'status-none' };
                            return `<tr><td><strong>${this.students[id].name}</strong></td><td>${this.students[id].admissionForClass || 'N/A'}</td><td><span class="status-pill ${classes[att.status]}">${labels[att.status]}</span></td><td style="text-align:right; font-size:0.85rem; color:var(--text-dim)">${att.timestamp ? new Date(att.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td></tr>`;
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
        for (const d of dates) { const snap = await db.ref(`modules/student_directory/attendance/${d}`).once('value'); weeklyData[d] = snap.val() || {}; }

        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Weekly Attendance Matrix</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Performance overview for the last 7 days</p>
                </div>
                <div class="report-body" style="padding:0;">
                    <div style="overflow-x:auto;">
                        <table class="console-table" style="margin-top:0; border:none; border-radius:0;">
                            <thead><tr><th style="width:250px;">Student</th>${dates.map(d => `<th style="text-align:center; font-size:0.7rem">${d.split('-').slice(1).reverse().join('/')}</th>`).join('')}<th style="text-align:right; width:80px;">Rate</th></tr></thead>
                            <tbody>${Object.keys(this.students).sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || '')).map(id => {
                                let p = 0; let row = `<tr><td><strong>${this.students[id].name}</strong></td>`;
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
        const snap = await db.ref('modules/student_directory/attendance').orderByKey().startAt(monthKey).endAt(`${monthKey}-\uf8ff`).once('value');
        const monthData = snap.val() || {};

        const monthDisplay = new Date(this.selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Monthly Performance Audit</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Attendance summary for ${monthDisplay}</p>
                </div>
                <div class="report-body">
                    <table class="console-table">
                        <thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Late</th><th style="text-align:right">Rate</th></tr></thead>
                        <tbody>${Object.keys(this.students).sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || '')).map(id => {
                            const stats = { p: 0, a: 0, l: 0 };
                            Object.keys(monthData).forEach(d => { const s = monthData[d][id]?.status; if (s === 'present') stats.p++; else if (s === 'absent') stats.a++; else if (s === 'late') stats.l++; });
                            const total = stats.p + stats.a + stats.l;
                            return `<tr><td><strong>${this.students[id].name}</strong></td><td>${stats.p}</td><td>${stats.a}</td><td>${stats.l}</td><td style="text-align:right; font-weight:800; color:var(--accent-secondary)">${total > 0 ? Math.round(((stats.p+stats.l)/total)*100) : 0}%</td></tr>`;
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
        printWindow.document.write(`<html><head><title>${type} Report</title><style>body { font-family: sans-serif; padding: 40px; } .header { border-bottom: 3px solid #F1615B; padding-bottom: 20px; margin-bottom: 30px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #eee; padding: 12px; text-align: left; }</style></head><body><div class="header"><h1>ABHISHRI ACADEMY</h1><p>Attendance ${type} Audit</p></div>${document.querySelector('#student-content-attendance-reports table').outerHTML}</body></html>`);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    },

    renderPerformance() {
        const id = this.currentStudentId;
        if (id) { this.renderStudentPulse(id); return; }
        const container = document.getElementById('student-content-performance');
        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) toolbar.innerHTML = `<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Filter by name..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>`;

        const filteredIds = Object.keys(this.students).filter(id => (this.students[id].name || '').toLowerCase().includes(this.searchQuery.toLowerCase()));
        
        let html = `
            <div class="report-header" style="margin-bottom:32px;"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Growth Pulse Dashboard</h2><p style="color:var(--text-dim); font-size:1.1rem;">Select a student to log activities and track skill development timeline.</p></div>
            <div class="directory-grid">`;
        
        filteredIds.forEach(id => {
            const s = this.students[id];
            html += `
                <div class="directory-card" onclick="window.studentDirectory.switchView('performance', '${id}')" style="border-left:4px solid var(--accent-secondary); display:flex; flex-direction:column; justify-content:space-between; height:100%;">
                    <div class="member-header">
                        <div class="member-avatar" style="background:rgba(115, 199, 200, 0.15); color:var(--accent-secondary); font-size:1.5rem;">${(s.name || 'S')[0]}</div>
                        <div class="member-info"><h3>${s.name}</h3><p>${s.admissionForClass || 'No Class'}</p></div>
                    </div>
                    <div class="member-actions" style="margin-top:auto; padding-top:12px; border-top:1px solid var(--card-border);">
                        <span style="color:var(--accent-secondary); font-size:0.85rem; font-weight:700; display:flex; align-items:center; gap:6px;">VIEW TIMELINE <i data-lucide="arrow-right-circle" style="width:16px; height:16px;"></i></span>
                    </div>
                </div>`;
        });
        container.innerHTML = html + '</div>';
    },

    async renderStudentPulse(id) {
        const container = document.getElementById('student-content-performance');
        const s = this.students[id];
        if (!s) return;

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <button class="btn btn-secondary" onclick="window.studentDirectory.switchView('performance')"><i data-lucide="arrow-left"></i> Dashboard</button>
                <button class="btn btn-primary" onclick="window.studentDirectory.showPulseEntryForm('${id}')"><i data-lucide="plus-circle"></i> Log Daily Pulse</button>
            `;
        }
        
        const snap = await firestore.collection('modules').doc('student_directory').collection('students').doc(id).collection('performance_logs').orderBy('date', 'desc').limit(15).get();
        let logsHtml = ''; snap.forEach(doc => {
            const d = doc.data();
            logsHtml += `
                <div class="console-card" style="margin-bottom:20px; border-left:4px solid var(--accent-secondary); padding:20px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <span style="font-size:0.75rem; font-weight:700; color:var(--text-dim); text-transform:uppercase;">${d.date}</span>
                        <div style="color:#fbbf24">${'★'.repeat(d.engagement)}${'☆'.repeat(5-d.engagement)}</div>
                    </div>
                    <h4 style="margin-bottom:8px; font-size:1.1rem;">${d.title}</h4>
                    <p style="color:var(--text-dim); line-height:1.5; font-size:0.95rem;">${d.summary}</p>
                </div>`;
        });

        container.innerHTML = `
            <div class="profile-card-main" style="margin-top:0; margin-bottom:32px; display:flex; align-items:center; gap:32px;">
                <div class="profile-avatar-wrapper" style="margin-bottom:0; width:80px; height:80px; font-size:2rem;">${(s.name || 'S')[0]}</div>
                <div>
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:4px;">${s.name}'s Growth</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Comprehensive timeline of academic learning and skill development</p>
                </div>
            </div>
            <div class="pulse-timeline">${logsHtml || '<div class="empty-state"><i data-lucide="activity"></i><p>No activity logs found for this student.</p></div>'}</div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    showPulseEntryForm(studentId) {
        AppDialog.confirm({
            title: 'Record Daily Pulse',
            content: `
                <div class="form-group" style="margin-bottom:15px;"><label>Activity Title</label><input type="text" id="p-title" class="form-control" placeholder="Today's learning moment..."></div>
                <div class="form-group" style="margin-bottom:15px;"><label>Summary / Achievement</label><textarea id="p-summary" class="form-control" rows="4"></textarea></div>
                <div class="form-grid-2">
                    <div class="form-group"><label>Engagement Level (1-5)</label><input type="number" id="p-eng" class="form-control" value="3" min="1" max="5"></div>
                    <div class="form-group"><label>Activity Date</label><input type="date" id="p-date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
                </div>`,
            onConfirm: () => {
                const data = { title: document.getElementById('p-title').value, summary: document.getElementById('p-summary').value, engagement: parseInt(document.getElementById('p-eng').value), date: document.getElementById('p-date').value, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
                if (!data.title || !data.summary) { AppDialog.toast('Title and summary required', 'error'); return false; }
                firestore.collection('modules').doc('student_directory').collection('students').doc(studentId).collection('performance_logs').add(data).then(() => this.renderStudentPulse(studentId));
                return true;
            }
        });
    },

    async renderReport(id) {
        const container = document.getElementById('student-content-report');
        if (!container || !id) return;
        this.switchView('report');
        container.innerHTML = '<div class="report-page" style="padding:100px; text-align:center; margin-top: 40px;"><div class="loading-spinner" style="margin:0 auto 20px;"></div><p style="color:var(--text-dim); font-size:1.1rem; font-weight:600;">Generating comprehensive student insight...</p></div>';
        const s = this.students[id];
        if (!s) return;

        const feeData = window.feesManager?.fees?.[id] || { total: 0, paid: 0 };
        const balance = (feeData.total || 0) - (feeData.paid || 0);
        
        const pulseSnap = await firestore.collection('modules').doc('student_directory').collection('students').doc(id).collection('performance_logs').orderBy('date', 'desc').limit(3).get();
        const latestPulses = [];
        pulseSnap.forEach(doc => latestPulses.push(doc.data()));

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <button class="btn btn-secondary" onclick="window.studentDirectory.switchView('directory')"><i data-lucide="arrow-left"></i> Back</button>
                <button class="btn btn-secondary" onclick="window.studentDirectory.printStudentReport('${id}')"><i data-lucide="printer"></i> Print Report</button>
            `;
        }

        container.innerHTML = `
            <div class="report-page" style="margin-top: 20px; border: none; background: transparent; box-shadow: none;">
                <div class="report-hero" style="background: linear-gradient(135deg, rgba(232, 105, 102, 0.2) 0%, rgba(115, 199, 200, 0.15) 100%); border-radius: 24px; padding: 48px; border: 1px solid var(--card-border); margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 32px;">
                    <div style="display: flex; gap: 32px; align-items: center;">
                        <div class="profile-avatar-wrapper" style="margin: 0; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.1);">${(s.name || 'S')[0]}</div>
                        <div>
                            <h1 style="font-size: 3.5rem; font-weight: 900; margin: 0 0 8px 0; letter-spacing: -2px; line-height: 1;">${s.name}</h1>
                            <div style="display: flex; gap: 12px; align-items: center;">
                                <span class="badge badge-success" style="font-size: 0.85rem; padding: 6px 18px; background: var(--success); color: #000; font-weight: 800;">ACTIVE STUDENT</span>
                                <span style="color: var(--text-main); font-size: 1.2rem; font-weight: 600; opacity: 0.8;">${s.admissionForClass || 'No Class Assigned'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="profile-actions" style="display: flex; gap: 16px;">
                        <button class="btn btn-secondary" style="padding: 14px 28px; font-weight: 700; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);" onclick="window.studentDirectory.showStudentForm('${id}')">
                            <i data-lucide="edit-3" style="width: 18px; height: 18px; margin-right: 8px;"></i> EDIT PROFILE
                        </button>
                        <button class="btn btn-primary" style="padding: 14px 28px; font-weight: 800; background: var(--accent-secondary); color: #000; border: none;" onclick="window.print()">
                            <i data-lucide="printer" style="width: 18px; height: 18px; margin-right: 8px;"></i> PRINT REPORT
                        </button>
                    </div>
                </div>

                <div class="profile-card-main" style="margin-top: 0; border-radius: 24px;">
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-icon" style="background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary);"><i data-lucide="calendar"></i></div>
                            <div class="metric-info"><h3>Attendance</h3><div class="metric-value">94%</div></div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon" style="background: ${balance > 0 ? 'rgba(251, 191, 36, 0.1)' : 'rgba(74, 222, 128, 0.1)'}; color: ${balance > 0 ? '#fbbf24' : 'var(--success)'};"><i data-lucide="wallet"></i></div>
                            <div class="metric-info"><h3>Fee Status</h3><div class="metric-value" style="color:${balance > 0 ? '#fbbf24' : 'var(--success)'}">${balance > 0 ? 'Pending' : 'Cleared'}</div></div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon" style="background: rgba(241, 97, 91, 0.1); color: var(--accent-primary);"><i data-lucide="activity"></i></div>
                            <div class="metric-info"><h3>Growth Pulse</h3><div class="metric-value">${latestPulses.length} Logged</div></div>
                        </div>
                    </div>

                    <div class="profile-info-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:32px; margin-top: 40px;">
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="user"></i> Basic Information</div>
                            <div class="data-grid" style="grid-template-columns: 1fr 1fr;">
                                <div class="data-item"><div class="data-label">Full Name</div><div class="data-value">${s.name}</div></div>
                                <div class="data-item"><div class="data-label">DOB</div><div class="data-value">${s.dob || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Gender</div><div class="data-value">${s.gender || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Blood Group</div><div class="data-value">${s.bloodGroup || 'N/A'}</div></div>
                            </div>
                        </div>
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="users"></i> Family Details</div>
                            <div class="data-grid" style="grid-template-columns: 1fr 1fr;">
                                <div class="data-item"><div class="data-label">Father</div><div class="data-value">${s.fatherName || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Mother</div><div class="data-value">${s.motherName || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Contact</div><div class="data-value">${s.fatherPhone || s.motherPhone || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Religion</div><div class="data-value">${s.religion || 'N/A'}</div></div>
                            </div>
                        </div>
                    </div>

                    <div class="profile-info-grid" style="display:grid; grid-template-columns: 1.5fr 1fr; gap:32px; margin-top: 32px;">
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="sparkles"></i> Recent Growth Pulse</div>
                            <div class="pulse-mini-list">${latestPulses.length > 0 ? latestPulses.map(p => `
                                <div style="padding:16px; background:rgba(255,255,255,0.03); border-radius:12px; margin-bottom:12px; border-left:4px solid var(--accent-secondary)">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><strong>${p.title}</strong><small style="color:var(--text-dim)">${p.date}</small></div>
                                    <p style="font-size:0.9rem; color:var(--text-dim); margin:0; line-height:1.5;">${p.summary}</p>
                                </div>`).join('') : '<div class="empty-state" style="padding:20px;"><p style="color:var(--text-dim);">No pulses logged yet.</p></div>'}
                            </div>
                        </div>
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="wallet"></i> Financial Summary</div>
                            <div class="fee-summary-mini">
                                <div style="display:flex; justify-content:space-between; margin-bottom:12px;"><span>Annual Total</span><strong>₹${(feeData.total || 0).toLocaleString()}</strong></div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:12px;"><span>Amount Paid</span><strong style="color:var(--success)">₹${(feeData.paid || 0).toLocaleString()}</strong></div>
                                <div style="height:1px; background:var(--card-border); margin-bottom:12px;"></div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:20px;"><span>Outstanding</span><strong style="color:var(--accent-primary); font-size:1.2rem;">₹${(balance).toLocaleString()}</strong></div>
                                
                                ${feeData.components ? `
                                    <div style="font-size:0.75rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:10px;">Structure Breakdown</div>
                                    <div style="max-height:150px; overflow-y:auto; padding-right:5px;">
                                        ${feeData.components.map(c => `
                                            <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:6px; opacity:0.8;">
                                                <span>${c.name}</span>
                                                <span>₹${c.amount.toLocaleString()}</span>
                                            </div>
                                        `).join('')}
                                        ${feeData.discount > 0 ? `
                                            <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-top:10px; color:var(--accent-primary); font-weight:700;">
                                                <span>Applied Waiver</span>
                                                <span>- ₹${feeData.discount.toLocaleString()}</span>
                                            </div>
                                        ` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    },

    printStudentReport(id) {
        const s = this.students[id]; if (!s) return;
        const feeData = window.feesManager?.fees?.[id] || { total: 0, paid: 0 };
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<html><head><title>Report - ${s.name}</title><style>body { font-family: sans-serif; padding: 40px; color: #333; } .header { border-bottom: 3px solid #F1615B; padding-bottom: 20px; margin-bottom: 30px; } .info-section { margin-bottom: 30px; } .info-title { font-weight: bold; border-bottom: 1px solid #eee; margin-bottom: 10px; padding-bottom: 5px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; } label { color: #888; font-size: 12px; display: block; }</style></head><body><div class="header"><h1>ABHISHRI ACADEMY</h1><p>Student Comprehensive Profile Report</p></div><div class="info-section"><div class="info-title">Basic Information</div><div class="grid"><div><label>Name</label>${s.name}</div><div><label>Class</label>${s.admissionForClass}</div><div><label>DOB</label>${s.dob}</div><div><label>Phone</label>${s.fatherPhone || s.motherPhone}</div></div></div><div class="info-section"><div class="info-title">Fee Summary</div><div class="grid"><div><label>Total Fee</label>₹${feeData.total}</div><div><label>Total Paid</label>₹${feeData.paid}</div><div><label>Balance</label>₹${feeData.total - feeData.paid}</div></div></div><div class="footer" style="margin-top:50px; font-size:10px; color:#aaa; text-align:center;">Generated on ${new Date().toLocaleString()}</div><script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        printWindow.document.close();
    },

    showStudentForm(id = null) {
        const s = id ? this.students[id] : {};
        const content = `
            <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="sf-name" class="form-control" value="${s.name || ''}" />
            </div>
            <div class="form-grid-2">
                <div class="form-group">
                    <label>Grade</label>
                    <input type="text" id="sf-class" class="form-control" value="${s.admissionForClass || ''}" />
                </div>
                <div class="form-group">
                    <label>DOB</label>
                    <input type="date" id="sf-dob" class="form-control" value="${s.dob || ''}" />
                </div>
            </div>
            <div class="form-grid-2">
                <div class="form-group">
                    <label>Father</label>
                    <input type="text" id="sf-father" class="form-control" value="${s.fatherName || ''}" />
                </div>
                <div class="form-group">
                    <label>Mother</label>
                    <input type="text" id="sf-mother" class="form-control" value="${s.motherName || ''}" />
                </div>
            </div>
            <div class="form-group">
                <label>Contact</label>
                <input type="text" id="sf-phone" class="form-control" value="${s.fatherPhone || s.motherPhone || ''}" />
            </div>
            <div class="form-group">
                <label>Address</label>
                <textarea id="sf-addr" class="form-control">${s.address || ''}</textarea>
            </div>`;
        
        AppDialog.confirm({ 
            title: id ? 'Edit Profile' : 'New Admission', 
            content, 
            width: '600px', 
            onConfirm: () => {
                const data = { 
                    name: document.getElementById('sf-name').value, 
                    admissionForClass: document.getElementById('sf-class').value, 
                    dob: document.getElementById('sf-dob').value, 
                    fatherName: document.getElementById('sf-father').value, 
                    motherName: document.getElementById('sf-mother').value, 
                    fatherPhone: document.getElementById('sf-phone').value, 
                    address: document.getElementById('sf-addr').value, 
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                };
                if (!data.name) return false;
                const ref = firestore.collection('modules').doc('student_directory').collection('students');
                (id ? ref.doc(id).update(data) : ref.add(data)).then(() => AppDialog.toast('Saved', 'success'));
                return true;
            }
        });
    },

    deleteStudent(id) {
        AppDialog.confirm({ title: 'Delete Student', content: 'Permanent action. Proceed?', confirmClass: 'btn-danger', onConfirm: () => { firestore.collection('modules').doc('student_directory').collection('students').doc(id).delete().then(() => { this.switchView('directory'); }); return true; }});
    },

    markAttendance(studentId, status) {
        const dateKey = new Date().toISOString().split('T')[0];
        db.ref(`modules/student_directory/attendance/${dateKey}/${studentId}`).set({ status, timestamp: firebase.database.ServerValue.TIMESTAMP });
    }
};
