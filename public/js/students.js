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
            ageAsOfJune: "7y 1m",
            gender: "Male",
            address: "Flat 402, Lotus Apartments, MG Road",
            city: "Salem",
            state: "Tamil Nadu",
            pinCode: "636001",
            
            motherName: "Priya Sharma",
            motherOccupation: "Software Engineer",
            motherQualification: "B.E. Computer Science",
            motherPhone: "919876543211",
            motherEmail: "priya.s@example.com",
            motherAddress: "", // Same as student
            
            fatherName: "Rajesh Sharma",
            fatherOccupation: "Business Owner",
            fatherQualification: "MBA",
            fatherPhone: "919876543210",
            fatherEmail: "rajesh.s@example.com",
            fatherAddress: "", // Same as student
            
            emergencyContactName: "Vikram Seth",
            emergencyRelationship: "Uncle",
            emergencyPhone: "919822334455",
            emergencyCity: "Salem",
            emergencyAddress: "12, North Street, Salem",
            
            hasSiblings: true,
            sibling1Name: "Ananya Sharma",
            sibling1Age: "4",
            sibling1School: "Abhishri Academy",
            sibling2Name: "",
            sibling2Age: "",
            sibling2School: "",
            
            aadhaarNo: "1234-5678-9012",
            admissionForClass: "Grade 2",
            motherTongue: "Hindi",
            bloodGroup: "O+",
            previousSchool: "Little Hearts Preschool",
            
            nationality: "Indian",
            religion: "Hindu",
            caste: "General",
            idMarks: "Small mole on left cheek",
            householdIncome: "12,00,000 PA",
            
            hasAllergies: true,
            allergiesList: "Peanuts, Dust",
            hasConditions: false,
            medicalConditions: "",
            physicianName: "Dr. K. Mehta",
            physicianPhone: "919443322110",
            immunizationsUpToDate: true,
            
            pickup1Name: "Suresh Kumar",
            pickup1Rel: "Driver",
            pickup1Phone: "919001122334",
            pickup2Name: "Sunita Sharma",
            pickup2Rel: "Grandmother",
            pickup2Phone: "919112233445",
            
            certified: true,
            docBirthCert: true,
            docImmRecords: true,
            docProofAddr: true,
            docParentID: true,
            docChildPhoto: true,
            docParentPhoto: true,
            parentSignature: "Rajesh Sharma",
            parentSignatureDate: "2025-03-10",
            
            appNumber: "AA-2025-001",
            dateReceived: "2025-03-01",
            receivedBy: "Admin Staff",
            feePaid: true,
            verifiedBy: "Principal",
            authorisedDate: "2025-03-05",
            
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
        
        if (window.location.hash !== `#${hash}`) {
            window.location.hash = hash;
        }

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

        // --- Improved Loading State ---
        if (!this.dataLoaded) {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:100px 0; gap:20px; opacity:0.7;">
                    <div class="loading-spinner"></div>
                    <p style="font-weight:600; color:var(--text-dim); letter-spacing:1px;">SYNCHRONIZING STUDENT RECORDS...</p>
                </div>`;
            return;
        }

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const canManage = isAdmin || (userData.permissions?.student_directory?.manage);

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <div class="search-box">
                    <i data-lucide="search"></i>
                    <input type="text" placeholder="Search by name or ID..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}">
                </div>
            `;
        }

        const sortedIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            const q = this.searchQuery.toLowerCase();
            return (s.name || '').toLowerCase().includes(q) || (s.admissionForClass || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        if (sortedIds.length === 0 && this.searchQuery) {
            container.innerHTML = '<div class="empty-state"><i data-lucide="users"></i><p>No students match your search.</p></div>';
            return;
        }

        if (sortedIds.length === 0) {
            container.innerHTML = '<div class="empty-state"><i data-lucide="users"></i><p>No students enrolled yet. Go to "Manage Students" to add records.</p></div>';
            return;
        }

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

        sortedIds.forEach(id => {
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

        container.innerHTML = html + '</div>';
    },
    renderManage() {
        const container = document.getElementById('student-content-manage');
        if (!container) return;

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Search admissions..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-secondary" onclick="window.studentDirectory.seedSampleStudent()"><i data-lucide="database"></i> Seed</button>
                    <button class="btn btn-primary" onclick="window.studentDirectory.showStudentForm()"><i data-lucide="user-plus"></i> New Admission</button>
                </div>
            `;
        }

        const sortedIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            const q = this.searchQuery.toLowerCase();
            return (s.name || '').toLowerCase().includes(q) || (s.fatherName || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        let html = `
            <div class="section-title">Admission Records</div>
            <table class="console-table">
                <thead><tr><th>Student</th><th>Parent</th><th>Contact</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
                <tbody>`;

        sortedIds.forEach(id => {
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

        if (sortedIds.length === 0) html += '<tr><td colspan="5" style="text-align:center; padding: 40px;">No admission records found.</td></tr>';
        
        container.innerHTML = html + '</tbody></table>';
    },

    renderAttendance() {
        const container = document.getElementById('student-content-attendance');
        if (!container) return;

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Quick find student..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>`;
        }

        const sortedIds = Object.keys(this.students).filter(id => (this.students[id].name || '').toLowerCase().includes(this.searchQuery.toLowerCase())).sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Attendance Marker</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Mark daily presence for ${new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}</p>
                </div>
                <div class="report-body">
                    <table class="console-table">
                        <thead><tr><th>Student</th><th>Class</th><th style="text-align:right; min-width:280px;">Quick Actions</th></tr></thead>
                        <tbody>${sortedIds.map(id => {
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

        const sortedIds = Object.keys(this.students).filter(id => (this.students[id].name || '').toLowerCase().includes(this.searchQuery.toLowerCase()));
        
        let html = `
            <div class="report-header" style="margin-bottom:32px;"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Growth Pulse Dashboard</h2><p style="color:var(--text-dim); font-size:1.1rem;">Select a student to log activities and track skill development timeline.</p></div>
            <div class="directory-grid">`;
        
        sortedIds.forEach(id => {
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

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const perfPerms = userData.permissions?.student_performance || {};
        const isMaster = isAdmin || perfPerms === true;

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            const canLog = isMaster || perfPerms === true || perfPerms.log;
            toolbar.innerHTML = `
                <button class="btn btn-secondary" onclick="window.studentDirectory.switchView('performance')"><i data-lucide="arrow-left"></i> Dashboard</button>
                ${canLog ? `<button class="btn btn-primary" onclick="window.studentDirectory.showPulseEntryForm('${id}')"><i data-lucide="plus-circle"></i> Log Daily Pulse</button>` : ''}
            `;
        }
        
        let logsHtml = '';
        try {
            const snap = await firestore.collection('modules').doc('student_directory').collection('students').doc(id).collection('performance_logs').orderBy('date', 'desc').limit(15).get();
            snap.forEach(doc => {
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
        } catch (err) {
            logsHtml = '<div class="empty-state"><i data-lucide="lock" style="margin-bottom:10px;"></i><p style="color:var(--text-dim);">No permission to view activity logs.</p></div>';
            console.warn('Student Pulse fetch aborted:', err);
        }

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

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const feePerms = userData.permissions?.fees_accounting || {};
        const canViewFees = isAdmin || feePerms === true || feePerms.view;
        const perfPerms = userData.permissions?.student_performance || {};
        const canViewPulse = isAdmin || perfPerms === true || perfPerms.view;

        const feeData = canViewFees ? (window.feesManager?.fees?.[id] || { total: 0, paid: 0 }) : null;
        const balance = feeData ? ((feeData.total || 0) - (feeData.paid || 0)) : 0;
        
        const latestPulses = [];
        if (canViewPulse) {
            try {
                const pulseSnap = await firestore.collection('modules').doc('student_directory').collection('students').doc(id).collection('performance_logs').orderBy('date', 'desc').limit(3).get();
                pulseSnap.forEach(doc => latestPulses.push(doc.data()));
            } catch (err) {
                console.warn('Permission denied or error fetching performance logs:', err);
            }
        }

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
                    </div>
                </div>

                <div class="profile-card-main" style="margin-top: 0; border-radius: 24px;">
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-icon" style="background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary);"><i data-lucide="calendar"></i></div>
                            <div class="metric-info"><h3>Attendance</h3><div class="metric-value">94%</div></div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon" style="background: ${canViewFees ? (balance > 0 ? 'rgba(251, 191, 36, 0.1)' : 'rgba(74, 222, 128, 0.1)') : 'rgba(255,255,255,0.05)'}; color: ${canViewFees ? (balance > 0 ? '#fbbf24' : 'var(--success)') : 'var(--text-dim)'};"><i data-lucide="wallet"></i></div>
                            <div class="metric-info"><h3>Fee Status</h3><div class="metric-value" style="color:${canViewFees ? (balance > 0 ? '#fbbf24' : 'var(--success)') : 'var(--text-dim)'}">${canViewFees ? (balance > 0 ? 'Pending' : 'Cleared') : 'No Access'}</div></div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon" style="background: ${canViewPulse ? 'rgba(241, 97, 91, 0.1)' : 'rgba(255,255,255,0.05)'}; color: ${canViewPulse ? 'var(--accent-primary)' : 'var(--text-dim)'};"><i data-lucide="activity"></i></div>
                            <div class="metric-info"><h3>Growth Pulse</h3><div class="metric-value" style="color:${canViewPulse ? '' : 'var(--text-dim)'}">${canViewPulse ? `${latestPulses.length} Logged` : 'No Access'}</div></div>
                        </div>
                    </div>

                    <div class="profile-info-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:32px; margin-top: 40px;">
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="user"></i> Student Profile</div>
                            <div class="data-grid" style="grid-template-columns: 1fr 1fr;">
                                <div class="data-item"><div class="data-label">Full Name</div><div class="data-value">${s.name}</div></div>
                                <div class="data-item"><div class="data-label">DOB</div><div class="data-value">${s.dob || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Age (June 1)</div><div class="data-value">${s.ageAsOfJune || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Gender</div><div class="data-value">${s.gender || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Blood Group</div><div class="data-value">${s.bloodGroup || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Aadhaar No</div><div class="data-value">${s.aadhaarNo || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Language</div><div class="data-value">${s.motherTongue || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Prev. School</div><div class="data-value">${s.previousSchool || 'N/A'}</div></div>
                            </div>
                            <div class="data-item" style="margin-top:16px;"><div class="data-label">Residential Address</div><div class="data-value" style="font-size:0.85rem;">${s.address}, ${s.city}, ${s.state} - ${s.pinCode}</div></div>
                            <div class="data-item" style="margin-top:16px;"><div class="data-label">Identification Marks</div><div class="data-value">${s.idMarks || 'None'}</div></div>
                        </div>
                        
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="users"></i> Family & Emergency</div>
                            <div class="data-grid" style="grid-template-columns: 1fr 1fr;">
                                <div class="data-item" style="grid-column: span 2; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom:8px; margin-bottom:8px;"><div class="data-label" style="color:var(--accent-secondary)">Father's Information</div></div>
                                <div class="data-item"><div class="data-label">Name</div><div class="data-value">${s.fatherName || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Phone</div><div class="data-value">${s.fatherPhone || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Occupation</div><div class="data-value">${s.fatherOccupation || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Qualification</div><div class="data-value">${s.fatherQualification || 'N/A'}</div></div>
                                
                                <div class="data-item" style="grid-column: span 2; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom:8px; margin-bottom:8px; margin-top:8px;"><div class="data-label" style="color:var(--accent-secondary)">Mother's Information</div></div>
                                <div class="data-item"><div class="data-label">Name</div><div class="data-value">${s.motherName || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Phone</div><div class="data-value">${s.motherPhone || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Occupation</div><div class="data-value">${s.motherOccupation || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Qualification</div><div class="data-value">${s.motherQualification || 'N/A'}</div></div>

                                <div class="data-item" style="grid-column: span 2; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom:8px; margin-bottom:8px; margin-top:8px;"><div class="data-label" style="color:var(--accent-primary)">Emergency Contact</div></div>
                                <div class="data-item"><div class="data-label">Name</div><div class="data-value">${s.emergencyContactName || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Relationship</div><div class="data-value">${s.emergencyRelationship || 'N/A'}</div></div>
                                <div class="data-item" style="grid-column: span 2;"><div class="data-label">Emergency Phone</div><div class="data-value">${s.emergencyPhone || 'N/A'}</div></div>
                            </div>
                        </div>
                    </div>

                    <div class="profile-info-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:32px; margin-top: 32px;">
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="heart-pulse"></i> Medical & Health</div>
                            <div class="data-grid" style="grid-template-columns: 1fr 1fr;">
                                <div class="data-item" style="grid-column: span 2;"><div class="data-label">Allergies</div><div class="data-value">${s.hasAllergies ? `<span style="color:var(--accent-primary)">${s.allergiesList}</span>` : 'None Reported'}</div></div>
                                <div class="data-item" style="grid-column: span 2;"><div class="data-label">Medical Conditions</div><div class="data-value">${s.hasConditions ? `<span style="color:var(--accent-primary)">${s.medicalConditions}</span>` : 'None Reported'}</div></div>
                                <div class="data-item"><div class="data-label">Primary Physician</div><div class="data-value">${s.physicianName || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Physician Phone</div><div class="data-value">${s.physicianPhone || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Immunization</div><div class="data-value">${s.immunizationsUpToDate ? '<span style="color:var(--success)">Up-to-date</span>' : '<span style="color:var(--accent-primary)">Pending</span>'}</div></div>
                            </div>
                        </div>
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="shield-check"></i> Pickups & Background</div>
                            <div class="data-grid" style="grid-template-columns: 1fr 1fr;">
                                <div class="data-item"><div class="data-label">Pickup 1</div><div class="data-value">${s.pickup1Name || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Relationship</div><div class="data-value">${s.pickup1Rel || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Pickup 2</div><div class="data-value">${s.pickup2Name || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Relationship</div><div class="data-value">${s.pickup2Rel || 'N/A'}</div></div>
                                
                                <div class="data-item" style="grid-column: span 2; border-top: 1px solid rgba(255,255,255,0.05); padding-top:12px; margin-top:12px;"></div>
                                <div class="data-item"><div class="data-label">Nationality</div><div class="data-value">${s.nationality || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Religion</div><div class="data-value">${s.religion || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Caste</div><div class="data-value">${s.caste || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">HH Income</div><div class="data-value">${s.householdIncome || 'N/A'}</div></div>
                            </div>
                        </div>
                    </div>

                    <div class="profile-info-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:32px; margin-top: 32px;">
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="file-check"></i> Office Use & Consent</div>
                            <div class="data-grid" style="grid-template-columns: 1fr 1fr;">
                                <div class="data-item"><div class="data-label">App Number</div><div class="data-value">${s.appNumber || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Date Received</div><div class="data-value">${s.dateReceived || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Received By</div><div class="data-value">${s.receivedBy || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Verified By</div><div class="data-value">${s.verifiedBy || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Fee Paid</div><div class="data-value">${s.feePaid ? 'YES' : 'NO'}</div></div>
                                <div class="data-item"><div class="data-label">Auth Date</div><div class="data-value">${s.authorisedDate || 'N/A'}</div></div>
                            </div>
                            <div style="margin-top:16px;">
                                <div class="data-label">Documents Submitted</div>
                                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
                                    ${s.docBirthCert ? '<span class="badge badge-success">Birth Cert</span>' : ''}
                                    ${s.docImmRecords ? '<span class="badge badge-success">Imm. Records</span>' : ''}
                                    ${s.docProofAddr ? '<span class="badge badge-success">Address Proof</span>' : ''}
                                    ${s.docParentID ? '<span class="badge badge-success">Parent ID</span>' : ''}
                                    ${s.docChildPhoto ? '<span class="badge badge-success">Child Photo</span>' : ''}
                                    ${s.docParentPhoto ? '<span class="badge badge-success">Parent Photo</span>' : ''}
                                </div>
                            </div>
                        </div>
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="users"></i> Sibling Information</div>
                            ${s.hasSiblings ? `
                                <div class="data-grid" style="grid-template-columns: 1fr;">
                                    ${s.sibling1Name ? `
                                        <div style="padding:12px; background:rgba(255,255,255,0.03); border-radius:12px; margin-bottom:8px;">
                                            <div style="font-weight:700;">${s.sibling1Name}</div>
                                            <div style="font-size:0.8rem; color:var(--text-dim);">${s.sibling1Age}y • ${s.sibling1School}</div>
                                        </div>` : ''}
                                    ${s.sibling2Name ? `
                                        <div style="padding:12px; background:rgba(255,255,255,0.03); border-radius:12px;">
                                            <div style="font-weight:700;">${s.sibling2Name}</div>
                                            <div style="font-size:0.8rem; color:var(--text-dim);">${s.sibling2Age}y • ${s.sibling2School}</div>
                                        </div>` : ''}
                                </div>
                            ` : '<div class="empty-state" style="padding:20px;"><p style="color:var(--text-dim);">No siblings listed.</p></div>'}
                        </div>
                    </div>

                    <div class="profile-info-grid" style="display:grid; grid-template-columns: 1.5fr 1fr; gap:32px; margin-top: 32px;">
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="sparkles"></i> Recent Growth Pulse</div>
                            <div class="pulse-mini-list">${!canViewPulse ? '<div class="empty-state" style="padding:20px;"><i data-lucide="lock" style="margin-bottom:10px;"></i><p style="color:var(--text-dim);">No permission to view data.</p></div>' : (latestPulses.length > 0 ? latestPulses.map(p => `
                                <div style="padding:16px; background:rgba(255,255,255,0.03); border-radius:12px; margin-bottom:12px; border-left:4px solid var(--accent-secondary)">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><strong>${p.title}</strong><small style="color:var(--text-dim)">${p.date}</small></div>
                                    <p style="font-size:0.9rem; color:var(--text-dim); margin:0; line-height:1.5;">${p.summary}</p>
                                </div>`).join('') : '<div class="empty-state" style="padding:20px;"><p style="color:var(--text-dim);">No pulses logged yet.</p></div>')}
                            </div>
                        </div>
                        <div class="profile-info-card" style="background: rgba(255,255,255,0.02); padding:24px; border-radius:20px; border:1px solid var(--card-border);">
                            <div class="form-section-title" style="margin-bottom:20px;"><i data-lucide="wallet"></i> Financial Summary</div>
                            ${canViewFees ? `
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
                            ` : `<div class="empty-state" style="padding:20px;"><i data-lucide="lock" style="margin-bottom:10px;"></i><p style="color:var(--text-dim);">No permission to view fee records.</p></div>`}
                        </div>
                    </div>
                </div>
            </div>`;
    },

    printStudentReport(id) {
        const s = this.students[id]; if (!s) return;
        const feeData = window.feesManager?.fees?.[id] || { total: 0, paid: 0 };
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Student Profile - ${s.name}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; line-height: 1.4; font-size: 12px; }
                    .header { border-bottom: 4px solid #F1615B; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .header h1 { margin: 0; color: #F1615B; font-size: 24px; }
                    .info-section { margin-bottom: 20px; page-break-inside: avoid; }
                    .info-title { font-weight: bold; border-bottom: 1px solid #ddd; margin-bottom: 10px; padding-bottom: 3px; text-transform: uppercase; color: #555; font-size: 13px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                    .field { margin-bottom: 6px; }
                    label { color: #888; font-size: 10px; display: block; text-transform: uppercase; margin-bottom: 1px; }
                    .value { font-size: 12px; font-weight: 600; color: #000; }
                    .footer { margin-top: 40px; font-size: 9px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
                    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; background: #eee; font-size: 10px; margin-right: 5px; }
                    @media print {
                        body { padding: 10px; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1>ABHISHRI ACADEMY</h1>
                        <p style="margin: 3px 0 0 0; opacity: 0.8; font-size: 14px;">Student Comprehensive Profile Report</p>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 800; font-size: 16px;">${s.admissionForClass || 'N/A'}</div>
                        <div style="font-size: 11px; opacity: 0.6;">Academic Year 2025-26</div>
                    </div>
                </div>

                <div class="info-section">
                    <div class="info-title">1. Student Information</div>
                    <div class="grid">
                        <div class="field"><label>Full Name</label><div class="value">${s.name}</div></div>
                        <div class="field"><label>Date of Birth</label><div class="value">${s.dob || 'N/A'}</div></div>
                        <div class="field"><label>Age (as on June 1)</label><div class="value">${s.ageAsOfJune || 'N/A'}</div></div>
                        <div class="field"><label>Gender</label><div class="value">${s.gender || 'N/A'}</div></div>
                        <div class="field"><label>Aadhaar No</label><div class="value">${s.aadhaarNo || 'N/A'}</div></div>
                        <div class="field"><label>Mother Tongue</label><div class="value">${s.motherTongue || 'N/A'}</div></div>
                        <div class="field"><label>Blood Group</label><div class="value">${s.bloodGroup || 'N/A'}</div></div>
                        <div class="field"><label>Prev. School</label><div class="value">${s.previousSchool || 'N/A'}</div></div>
                    </div>
                    <div class="field" style="margin-top:8px;"><label>Address</label><div class="value">${s.address}, ${s.city}, ${s.state} - ${s.pinCode}</div></div>
                    <div class="field"><label>Identification Marks</label><div class="value">${s.idMarks || 'None'}</div></div>
                </div>

                <div class="grid">
                    <div class="info-section">
                        <div class="info-title">2. Mother's Details</div>
                        <div class="field"><label>Name</label><div class="value">${s.motherName || 'N/A'}</div></div>
                        <div class="field"><label>Occupation</label><div class="value">${s.motherOccupation || 'N/A'}</div></div>
                        <div class="field"><label>Qualification</label><div class="value">${s.motherQualification || 'N/A'}</div></div>
                        <div class="field"><label>Contact</label><div class="value">${s.motherPhone || 'N/A'}</div></div>
                        <div class="field"><label>Email</label><div class="value">${s.motherEmail || 'N/A'}</div></div>
                    </div>
                    <div class="info-section">
                        <div class="info-title">3. Father's Details</div>
                        <div class="field"><label>Name</label><div class="value">${s.fatherName || 'N/A'}</div></div>
                        <div class="field"><label>Occupation</label><div class="value">${s.fatherOccupation || 'N/A'}</div></div>
                        <div class="field"><label>Qualification</label><div class="value">${s.fatherQualification || 'N/A'}</div></div>
                        <div class="field"><label>Contact</label><div class="value">${s.fatherPhone || 'N/A'}</div></div>
                        <div class="field"><label>Email</label><div class="value">${s.fatherEmail || 'N/A'}</div></div>
                    </div>
                </div>

                <div class="info-section">
                    <div class="info-title">4. Emergency & Medical</div>
                    <div class="grid">
                        <div class="field"><label>Emergency Contact</label><div class="value">${s.emergencyContactName} (${s.emergencyRelationship})</div></div>
                        <div class="field"><label>Emergency Phone</label><div class="value">${s.emergencyPhone}</div></div>
                        <div class="field"><label>Primary Physician</label><div class="value">${s.physicianName || 'N/A'} (${s.physicianPhone || 'N/A'})</div></div>
                        <div class="field"><label>Immunization</label><div class="value">${s.immunizationsUpToDate ? 'UP-TO-DATE' : 'PENDING'}</div></div>
                        <div class="field" style="grid-column: span 2;"><label>Allergies</label><div class="value">${s.hasAllergies ? s.allergiesList : 'None Reported'}</div></div>
                        <div class="field" style="grid-column: span 2;"><label>Medical Conditions</label><div class="value">${s.hasConditions ? s.medicalConditions : 'None Reported'}</div></div>
                    </div>
                </div>

                <div class="grid">
                    <div class="info-section">
                        <div class="info-title">5. Sibling Information</div>
                        ${s.hasSiblings ? `
                            <div class="field"><label>Sibling 1</label><div class="value">${s.sibling1Name} (${s.sibling1Age}y) - ${s.sibling1School}</div></div>
                            ${s.sibling2Name ? `<div class="field"><label>Sibling 2</label><div class="value">${s.sibling2Name} (${s.sibling2Age}y) - ${s.sibling2School}</div></div>` : ''}
                        ` : '<div class="value">No Siblings Listed</div>'}
                    </div>
                    <div class="info-section">
                        <div class="info-title">6. Background & Pickups</div>
                        <div class="field"><label>Nationality/Religion</label><div class="value">${s.nationality || 'N/A'} / ${s.religion || 'N/A'}</div></div>
                        <div class="field"><label>Pickup Person 1</label><div class="value">${s.pickup1Name || 'N/A'} (${s.pickup1Rel || 'N/A'}) - ${s.pickup1Phone || ''}</div></div>
                        <div class="field"><label>Pickup Person 2</label><div class="value">${s.pickup2Name || 'N/A'} (${s.pickup2Rel || 'N/A'}) - ${s.pickup2Phone || ''}</div></div>
                    </div>
                </div>

                <div class="info-section">
                    <div class="info-title">7. Office Use & Financials</div>
                    <div class="grid">
                        <div class="field"><label>Application No / Date</label><div class="value">${s.appNumber || 'N/A'} / ${s.dateReceived || 'N/A'}</div></div>
                        <div class="field"><label>Verified By</label><div class="value">${s.verifiedBy || 'N/A'}</div></div>
                        <div class="field"><label>Fee Status</label><div class="value">TOTAL: ₹${(feeData.total || 0).toLocaleString()} | PAID: ₹${(feeData.paid || 0).toLocaleString()} | DUE: ₹${(feeData.total - feeData.paid).toLocaleString()}</div></div>
                        <div class="field"><label>Documents Submitted</label>
                            <div class="value">
                                ${s.docBirthCert ? 'Birth Cert, ' : ''} ${s.docImmRecords ? 'Imm. Records, ' : ''} 
                                ${s.docProofAddr ? 'Address Proof, ' : ''} ${s.docParentID ? 'Parent ID, ' : ''} 
                                ${s.docChildPhoto ? 'Child Photo, ' : ''} ${s.docParentPhoto ? 'Parent Photo' : ''}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="footer">
                    <p>Certified accurate by: ${s.parentSignature || '____________________'} on ${s.parentSignatureDate || '__________'}</p>
                    <p style="margin-top:10px;">This is a computer-generated document from the Abhishri Academy Smart Campus Engine. Printed on ${new Date().toLocaleString()}</p>
                </div>

                <script>
                    window.onload = () => {
                        window.print();
                        setTimeout(() => window.close(), 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    },

    showStudentForm(id = null) {
        const s = id ? this.students[id] : {};
        const content = `
            <div class="form-scroll-container">
                <!-- 1. Student Information -->
                <div class="form-section-title"><i data-lucide="user"></i> 1. Student Information</div>
                <div class="form-group">
                    <label>Full Name of Child</label>
                    <input type="text" id="sf-name" class="form-control" value="${s.name || ''}" placeholder="As per Birth Certificate" />
                </div>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Date of Birth</label>
                        <input type="date" id="sf-dob" class="form-control" value="${s.dob || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Age (as on June 1)</label>
                        <input type="text" id="sf-age" class="form-control" value="${s.ageAsOfJune || ''}" placeholder="e.g. 3y 4m" />
                    </div>
                    <div class="form-group">
                        <label>Gender</label>
                        <select id="sf-gender" class="form-control">
                            <option value="">Select</option>
                            <option value="Male" ${s.gender === 'Male' ? 'selected' : ''}>Male</option>
                            <option value="Female" ${s.gender === 'Female' ? 'selected' : ''}>Female</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Home Address</label>
                    <input type="text" id="sf-address" class="form-control" value="${s.address || ''}" />
                </div>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>City</label>
                        <input type="text" id="sf-city" class="form-control" value="${s.city || 'Salem'}" />
                    </div>
                    <div class="form-group">
                        <label>State</label>
                        <input type="text" id="sf-state" class="form-control" value="${s.state || 'Tamil Nadu'}" />
                    </div>
                    <div class="form-group">
                        <label>Pin Code</label>
                        <input type="text" id="sf-pin" class="form-control" value="${s.pinCode || ''}" />
                    </div>
                </div>

                <!-- 2. Mother's Details -->
                <div class="form-section-title"><i data-lucide="user"></i> 2. Mother's Details</div>
                <div class="form-group">
                    <label>Mother's Name</label>
                    <input type="text" id="sf-m-name" class="form-control" value="${s.motherName || ''}" />
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Occupation</label>
                        <input type="text" id="sf-m-occ" class="form-control" value="${s.motherOccupation || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Qualification</label>
                        <input type="text" id="sf-m-qual" class="form-control" value="${s.motherQualification || ''}" />
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="text" id="sf-m-phone" class="form-control" value="${s.motherPhone || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="sf-m-email" class="form-control" value="${s.motherEmail || ''}" />
                    </div>
                </div>
                <div class="form-group">
                    <label>Home Address (if different)</label>
                    <input type="text" id="sf-m-addr" class="form-control" value="${s.motherAddress || ''}" placeholder="Leave blank if same as student" />
                </div>

                <!-- 3. Father's Details -->
                <div class="form-section-title"><i data-lucide="user"></i> 3. Father's Details</div>
                <div class="form-group">
                    <label>Father's Name</label>
                    <input type="text" id="sf-f-name" class="form-control" value="${s.fatherName || ''}" />
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Occupation</label>
                        <input type="text" id="sf-f-occ" class="form-control" value="${s.fatherOccupation || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Qualification</label>
                        <input type="text" id="sf-f-qual" class="form-control" value="${s.fatherQualification || ''}" />
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="text" id="sf-f-phone" class="form-control" value="${s.fatherPhone || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="sf-f-email" class="form-control" value="${s.fatherEmail || ''}" />
                    </div>
                </div>
                <div class="form-group">
                    <label>Home Address (if different)</label>
                    <input type="text" id="sf-f-addr" class="form-control" value="${s.fatherAddress || ''}" placeholder="Leave blank if same as student" />
                </div>

                <!-- 4. Emergency Contact -->
                <div class="form-section-title"><i data-lucide="phone-call"></i> 4. Emergency Contact Information</div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Contact Name</label>
                        <input type="text" id="sf-e-name" class="form-control" value="${s.emergencyContactName || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Relationship</label>
                        <input type="text" id="sf-e-rel" class="form-control" value="${s.emergencyRelationship || ''}" />
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="text" id="sf-e-phone" class="form-control" value="${s.emergencyPhone || ''}" />
                    </div>
                    <div class="form-group">
                        <label>City</label>
                        <input type="text" id="sf-e-city" class="form-control" value="${s.emergencyCity || ''}" />
                    </div>
                </div>
                <div class="form-group">
                    <label>Home Address</label>
                    <input type="text" id="sf-e-addr" class="form-control" value="${s.emergencyAddress || ''}" />
                </div>

                <!-- 5. Sibling Details -->
                <div class="form-section-title"><i data-lucide="users"></i> 5. Sibling Details</div>
                <div class="checkbox-group">
                    <input type="checkbox" id="sf-has-siblings" ${s.hasSiblings ? 'checked' : ''} onchange="document.getElementById('sibling-fields').style.display = this.checked ? 'block' : 'none'">
                    <label for="sf-has-siblings">Does the child have siblings?</label>
                </div>
                <div id="sibling-fields" style="display: ${s.hasSiblings ? 'block' : 'none'};">
                    <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; margin-bottom: 15px;">
                        <label style="color:var(--accent-secondary); font-size: 0.7rem; margin-bottom: 10px; display: block;">Sibling 1</label>
                        <div class="form-grid-3">
                            <input type="text" id="sf-s1-name" class="form-control" value="${s.sibling1Name || ''}" placeholder="Name" />
                            <input type="text" id="sf-s1-age" class="form-control" value="${s.sibling1Age || ''}" placeholder="Age" />
                            <input type="text" id="sf-s1-school" class="form-control" value="${s.sibling1School || ''}" placeholder="School" />
                        </div>
                    </div>
                    <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px;">
                        <label style="color:var(--accent-secondary); font-size: 0.7rem; margin-bottom: 10px; display: block;">Sibling 2</label>
                        <div class="form-grid-3">
                            <input type="text" id="sf-s2-name" class="form-control" value="${s.sibling2Name || ''}" placeholder="Name" />
                            <input type="text" id="sf-s2-age" class="form-control" value="${s.sibling2Age || ''}" placeholder="Age" />
                            <input type="text" id="sf-s2-school" class="form-control" value="${s.sibling2School || ''}" placeholder="School" />
                        </div>
                    </div>
                </div>

                <!-- 6. Additional Details -->
                <div class="form-section-title"><i data-lucide="info"></i> 6. Additional Details</div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Aadhaar No</label>
                        <input type="text" id="sf-aadhaar" class="form-control" value="${s.aadhaarNo || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Admission for Class</label>
                        <input type="text" id="sf-class" class="form-control" value="${s.admissionForClass || ''}" />
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Mother Tongue</label>
                        <input type="text" id="sf-lang" class="form-control" value="${s.motherTongue || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Blood Group</label>
                        <input type="text" id="sf-blood" class="form-control" value="${s.bloodGroup || ''}" />
                    </div>
                </div>
                <div class="form-group">
                    <label>Previous School (if any)</label>
                    <input type="text" id="sf-prev-school" class="form-control" value="${s.previousSchool || ''}" />
                </div>

                <!-- 7. Background Details -->
                <div class="form-section-title"><i data-lucide="globe"></i> 7. Background Details (Govt Reporting)</div>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Nationality</label>
                        <input type="text" id="sf-nat" class="form-control" value="${s.nationality || 'Indian'}" />
                    </div>
                    <div class="form-group">
                        <label>Religion</label>
                        <input type="text" id="sf-relig" class="form-control" value="${s.religion || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Caste/Community</label>
                        <input type="text" id="sf-caste" class="form-control" value="${s.caste || ''}" />
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Identification Marks</label>
                        <input type="text" id="sf-id-marks" class="form-control" value="${s.idMarks || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Total Household Income</label>
                        <input type="text" id="sf-income" class="form-control" value="${s.householdIncome || ''}" />
                    </div>
                </div>

                <!-- 8. Medical Information -->
                <div class="form-section-title"><i data-lucide="heart-pulse"></i> 8. Medical Information</div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Allergies?</label>
                        <div class="checkbox-group">
                            <input type="checkbox" id="sf-has-allergies" ${s.hasAllergies ? 'checked' : ''} onchange="document.getElementById('allergies-box').style.display = this.checked ? 'block' : 'none'">
                            <label for="sf-has-allergies">Yes</label>
                        </div>
                        <textarea id="sf-allergies-list" class="form-control" style="display: ${s.hasAllergies ? 'block' : 'none'}; margin-top: 5px;" placeholder="List allergies...">${s.allergiesList || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Medical Conditions?</label>
                        <div class="checkbox-group">
                            <input type="checkbox" id="sf-has-conditions" ${s.hasConditions ? 'checked' : ''} onchange="document.getElementById('conditions-box').style.display = this.checked ? 'block' : 'none'">
                            <label for="sf-has-conditions">Yes</label>
                        </div>
                        <textarea id="sf-conditions-list" class="form-control" style="display: ${s.hasConditions ? 'block' : 'none'}; margin-top: 5px;" placeholder="Specify conditions...">${s.medicalConditions || ''}</textarea>
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Primary Physician</label>
                        <input type="text" id="sf-phys-name" class="form-control" value="${s.physicianName || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Physician Phone</label>
                        <input type="text" id="sf-phys-phone" class="form-control" value="${s.physicianPhone || ''}" />
                    </div>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="sf-imm-up-to-date" ${s.immunizationsUpToDate ? 'checked' : ''}>
                    <label for="sf-imm-up-to-date">Immunizations are up-to-date</label>
                </div>

                <!-- 9. Authorized Pickup -->
                <div class="form-section-title"><i data-lucide="shield-check"></i> 9. Authorized Pickup Persons</div>
                <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; margin-bottom: 15px;">
                    <label style="color:var(--accent-secondary); font-size: 0.7rem; margin-bottom: 10px; display: block;">Person 1</label>
                    <div class="form-grid-3">
                        <input type="text" id="sf-p1-name" class="form-control" value="${s.pickup1Name || ''}" placeholder="Name" />
                        <input type="text" id="sf-p1-rel" class="form-control" value="${s.pickup1Rel || ''}" placeholder="Relationship" />
                        <input type="text" id="sf-p1-phone" class="form-control" value="${s.pickup1Phone || ''}" placeholder="Phone" />
                    </div>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; margin-bottom: 15px;">
                    <label style="color:var(--accent-secondary); font-size: 0.7rem; margin-bottom: 10px; display: block;">Person 2</label>
                    <div class="form-grid-3">
                        <input type="text" id="sf-p2-name" class="form-control" value="${s.pickup2Name || ''}" placeholder="Name" />
                        <input type="text" id="sf-p2-rel" class="form-control" value="${s.pickup2Rel || ''}" placeholder="Relationship" />
                        <input type="text" id="sf-p2-phone" class="form-control" value="${s.pickup2Phone || ''}" placeholder="Phone" />
                    </div>
                </div>

                <!-- 10. Consent & Agreement -->
                <div class="form-section-title"><i data-lucide="clipboard-check"></i> 10. Consent & Agreement</div>
                <div class="checkbox-group">
                    <input type="checkbox" id="sf-cert-check" ${s.certified ? 'checked' : ''}>
                    <label for="sf-cert-check">I certify that the information provided is accurate.</label>
                </div>
                <label style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 10px; display: block;">Documents Submitted:</label>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px;">
                    <div class="checkbox-group"><input type="checkbox" id="sf-doc-bc" ${s.docBirthCert ? 'checked' : ''}><label for="sf-doc-bc">Birth Certificate</label></div>
                    <div class="checkbox-group"><input type="checkbox" id="sf-doc-imm" ${s.docImmRecords ? 'checked' : ''}><label for="sf-doc-imm">Immunization Records</label></div>
                    <div class="checkbox-group"><input type="checkbox" id="sf-doc-addr" ${s.docProofAddr ? 'checked' : ''}><label for="sf-doc-addr">Proof of Address</label></div>
                    <div class="checkbox-group"><input type="checkbox" id="sf-doc-pid" ${s.docParentID ? 'checked' : ''}><label for="sf-doc-pid">Parent ID Proof</label></div>
                    <div class="checkbox-group"><input type="checkbox" id="sf-doc-cphoto" ${s.docChildPhoto ? 'checked' : ''}><label for="sf-doc-cphoto">Photo of Child</label></div>
                    <div class="checkbox-group"><input type="checkbox" id="sf-doc-pphoto" ${s.docParentPhoto ? 'checked' : ''}><label for="sf-doc-pphoto">Parent Photo</label></div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Parent/Guardian Signature (Type Name)</label>
                        <input type="text" id="sf-p-sig" class="form-control" value="${s.parentSignature || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" id="sf-p-sig-date" class="form-control" value="${s.parentSignatureDate || new Date().toISOString().split('T')[0]}" />
                    </div>
                </div>

                <!-- 11. Office Use Only -->
                <div class="form-section-title"><i data-lucide="briefcase"></i> 11. For Office Use Only (Internal)</div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Application Number</label>
                        <input type="text" id="sf-o-app-no" class="form-control" value="${s.appNumber || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Date Received</label>
                        <input type="date" id="sf-o-date-rec" class="form-control" value="${s.dateReceived || ''}" />
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Received by (Staff Name)</label>
                        <input type="text" id="sf-o-rec-by" class="form-control" value="${s.receivedBy || ''}" />
                    </div>
                    <div class="checkbox-group" style="margin-top: 25px;">
                        <input type="checkbox" id="sf-o-fee-paid" ${s.feePaid ? 'checked' : ''}>
                        <label for="sf-o-fee-paid">Application Fee Paid</label>
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Verified by (Staff Name)</label>
                        <input type="text" id="sf-o-ver-by" class="form-control" value="${s.verifiedBy || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Authorised Signature Date</label>
                        <input type="date" id="sf-o-auth-date" class="form-control" value="${s.authorisedDate || ''}" />
                    </div>
                </div>
            </div>`;
        
        AppDialog.confirm({ 
            title: id ? 'Update Admission Record' : 'New Student Admission', 
            content, 
            width: '800px', 
            onOpen: (overlay) => {
                if (window.lucide) window.lucide.createIcons({ root: overlay });
            },
            onConfirm: () => {
                const data = { 
                    name: document.getElementById('sf-name').value, 
                    dob: document.getElementById('sf-dob').value,
                    ageAsOfJune: document.getElementById('sf-age').value,
                    gender: document.getElementById('sf-gender').value,
                    address: document.getElementById('sf-address').value,
                    city: document.getElementById('sf-city').value,
                    state: document.getElementById('sf-state').value,
                    pinCode: document.getElementById('sf-pin').value,
                    
                    motherName: document.getElementById('sf-m-name').value,
                    motherOccupation: document.getElementById('sf-m-occ').value,
                    motherQualification: document.getElementById('sf-m-qual').value,
                    motherPhone: document.getElementById('sf-m-phone').value,
                    motherEmail: document.getElementById('sf-m-email').value,
                    motherAddress: document.getElementById('sf-m-addr').value,
                    
                    fatherName: document.getElementById('sf-f-name').value,
                    fatherOccupation: document.getElementById('sf-f-occ').value,
                    fatherQualification: document.getElementById('sf-f-qual').value,
                    fatherPhone: document.getElementById('sf-f-phone').value,
                    fatherEmail: document.getElementById('sf-f-email').value,
                    fatherAddress: document.getElementById('sf-f-addr').value,
                    
                    emergencyContactName: document.getElementById('sf-e-name').value,
                    emergencyRelationship: document.getElementById('sf-e-rel').value,
                    emergencyPhone: document.getElementById('sf-e-phone').value,
                    emergencyCity: document.getElementById('sf-e-city').value,
                    emergencyAddress: document.getElementById('sf-e-addr').value,
                    
                    hasSiblings: document.getElementById('sf-has-siblings').checked,
                    sibling1Name: document.getElementById('sf-s1-name').value,
                    sibling1Age: document.getElementById('sf-s1-age').value,
                    sibling1School: document.getElementById('sf-s1-school').value,
                    sibling2Name: document.getElementById('sf-s2-name').value,
                    sibling2Age: document.getElementById('sf-s2-age').value,
                    sibling2School: document.getElementById('sf-s2-school').value,
                    
                    aadhaarNo: document.getElementById('sf-aadhaar').value,
                    admissionForClass: document.getElementById('sf-class').value,
                    motherTongue: document.getElementById('sf-lang').value,
                    bloodGroup: document.getElementById('sf-blood').value,
                    previousSchool: document.getElementById('sf-prev-school').value,
                    
                    nationality: document.getElementById('sf-nat').value,
                    religion: document.getElementById('sf-relig').value,
                    caste: document.getElementById('sf-caste').value,
                    idMarks: document.getElementById('sf-id-marks').value,
                    householdIncome: document.getElementById('sf-income').value,
                    
                    hasAllergies: document.getElementById('sf-has-allergies').checked,
                    allergiesList: document.getElementById('sf-allergies-list').value,
                    hasConditions: document.getElementById('sf-has-conditions').checked,
                    medicalConditions: document.getElementById('sf-conditions-list').value,
                    physicianName: document.getElementById('sf-phys-name').value,
                    physicianPhone: document.getElementById('sf-phys-phone').value,
                    immunizationsUpToDate: document.getElementById('sf-imm-up-to-date').checked,
                    
                    pickup1Name: document.getElementById('sf-p1-name').value,
                    pickup1Rel: document.getElementById('sf-p1-rel').value,
                    pickup1Phone: document.getElementById('sf-p1-phone').value,
                    pickup2Name: document.getElementById('sf-p2-name').value,
                    pickup2Rel: document.getElementById('sf-p2-rel').value,
                    pickup2Phone: document.getElementById('sf-p2-phone').value,
                    
                    certified: document.getElementById('sf-cert-check').checked,
                    docBirthCert: document.getElementById('sf-doc-bc').checked,
                    docImmRecords: document.getElementById('sf-doc-imm').checked,
                    docProofAddr: document.getElementById('sf-doc-addr').checked,
                    docParentID: document.getElementById('sf-doc-pid').checked,
                    docChildPhoto: document.getElementById('sf-doc-cphoto').checked,
                    docParentPhoto: document.getElementById('sf-doc-pphoto').checked,
                    parentSignature: document.getElementById('sf-p-sig').value,
                    parentSignatureDate: document.getElementById('sf-p-sig-date').value,
                    
                    appNumber: document.getElementById('sf-o-app-no').value,
                    dateReceived: document.getElementById('sf-o-date-rec').value,
                    receivedBy: document.getElementById('sf-o-rec-by').value,
                    feePaid: document.getElementById('sf-o-fee-paid').checked,
                    verifiedBy: document.getElementById('sf-o-ver-by').value,
                    authorisedDate: document.getElementById('sf-o-auth-date').value,
                    
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                };
                if (!data.name) { AppDialog.toast('Student name is required', 'error'); return false; }
                const ref = firestore.collection('modules').doc('student_directory').collection('students');
                (id ? ref.doc(id).update(data) : ref.add(data)).then(() => {
                    AppDialog.toast('Record saved successfully', 'success');
                    if (!id) this.switchView('directory');
                });
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
