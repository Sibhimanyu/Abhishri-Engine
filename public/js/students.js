/**
 * Student Directory Module (Firestore Version)
 */

window.studentDirectory = {
    students: {},
    attendance: {},
    isSubscribed: false,
    dataLoaded: false,
    currentStudentId: null,
    searchQuery: '',
    selectedDate: new Date().toISOString().split('T')[0],
    reportType: 'daily',
    currentWingFilter: 'preschool',
    directoryWingFilter: 'all',
    appContext: 'people', // 'people' | 'attendance' — set by caller to pick right toolbar/containers

    _toolbar() {
        return document.getElementById(this.appContext === 'attendance' ? 'att-toolbar' : 'people-toolbar');
    },

    _setToolbar(html) {
        const t = this._toolbar();
        if (!t) return;
        if (t.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
        t.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: t });
    },

    wingBadgeHtml(type) {
        if (type === 'preschool') return `<span style="background:rgba(115,199,200,0.15); color:var(--accent-secondary); padding:2px 10px; border-radius:8px; font-size:0.7rem; font-weight:800; letter-spacing:0.5px;">PRESCHOOL</span>`;
        if (type === 'tuition') return `<span style="background:rgba(251,191,36,0.15); color:#fbbf24; padding:2px 10px; border-radius:8px; font-size:0.7rem; font-weight:800; letter-spacing:0.5px;">TUITION</span>`;
        return `<span style="background:rgba(255,255,255,0.05); color:var(--text-dim); padding:2px 10px; border-radius:8px; font-size:0.7rem; font-weight:800;">UNASSIGNED</span>`;
    },

    setDirectoryWingFilter(wing) {
        this.directoryWingFilter = wing;
        this.rerender();
    },

    setAttendanceWingFilter(wing) {
        this.currentWingFilter = wing;
        this.rerender();
    },

    initialize() {
        this.subscribe();
    },

    subscribe() {
        if (this.isSubscribed) return;
        this.isSubscribed = true;

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const perms = userData.permissions?.student_directory || {};
        const isMaster = isAdmin || perms === true;

        if (isMaster || perms.view || perms.add || perms.edit || perms.delete || perms.attendance_mark || perms.attendance_view) {
            window.studentDataManager.subscribe();
            window.studentDataManager.onUpdate((data) => {
                this.students = data;
                this.dataLoaded = true;
                this.rerender();
            });
        }

        // Initial attendance subscription
        this.subscribeToAttendance(this.selectedDate);
    },

    subscribeToAttendance(dateKey) {
        if (this.attendanceRef) {
            this.attendanceRef.off();
        }

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const perms = userData.permissions?.student_directory || {};
        const isMaster = isAdmin || perms === true;

        if (isMaster || perms.attendance_mark || perms.attendance_view) {
            this.attendanceRef = db.ref(`modules/student_directory/attendance/${dateKey}`);
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
    },

    handleSearch(query) {
        this.searchQuery = query;
        this.rerender();
    },

    // Re-render the current view in place (used by filter/date change callbacks)
    rerender() {
        if (this.currentView === 'manage') this.renderManage();
        else if (this.currentView === 'attendance') this.renderAttendance();
        else if (this.currentView === 'attendance_reports') this.renderAttendanceReports();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderDirectory() {
        const container = document.getElementById('student-content-directory');
        if (!container) return;

        if (!this.dataLoaded) {
            container.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:100px 0; opacity:0.7;"><div class="loading-spinner"></div><p style="margin-top:20px; font-weight:600; color:var(--text-dim);">SYNCHRONIZING RECORDS...</p></div>`;
            return;
        }

        this._setToolbar(`
            <div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Search by name or ID..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"><button class="search-clear" onclick="window.studentDirectory.handleSearch(''); this.previousElementSibling.value='';" title="Clear">×</button></div>
            <div class="segment-controller">
                <button class="segment-btn ${this.directoryWingFilter === 'all' ? 'active' : ''}" onclick="window.studentDirectory.setDirectoryWingFilter('all')">All</button>
                <button class="segment-btn ${this.directoryWingFilter === 'preschool' ? 'active' : ''}" onclick="window.studentDirectory.setDirectoryWingFilter('preschool')">Preschool</button>
                <button class="segment-btn ${this.directoryWingFilter === 'tuition' ? 'active' : ''}" onclick="window.studentDirectory.setDirectoryWingFilter('tuition')">Tuition</button>
            </div>`);

        const sortedIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            const q = this.searchQuery.toLowerCase();
            const matchesSearch = (s.name || '').toLowerCase().includes(q);
            const matchesWing = this.directoryWingFilter === 'all' || (s.studentType || 'preschool') === this.directoryWingFilter;
            return matchesSearch && matchesWing;
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        if (sortedIds.length === 0) {
            container.innerHTML = `<div class="empty-state"><i data-lucide="users"></i><p>${this.searchQuery ? 'No students match your search.' : 'No students enrolled yet.'}</p></div>`;
            return;
        }

        const allStudents = Object.values(this.students);
        const totalPreschool = allStudents.filter(s => (s.studentType || 'preschool') === 'preschool').length;
        const totalTuition = allStudents.filter(s => (s.studentType || 'preschool') === 'tuition').length;

        let html = `<div class="metrics-grid">
            <div class="metric-card"><div class="metric-icon" style="background: rgba(115, 199, 200, 0.15); color: var(--accent-secondary);"><i data-lucide="users"></i></div><div class="metric-info"><h3>Total Enrolled</h3><div class="metric-value">${allStudents.length}</div></div></div>
            <div class="metric-card"><div class="metric-icon" style="background: rgba(115, 199, 200, 0.15); color: var(--accent-secondary);"><i data-lucide="sun"></i></div><div class="metric-info"><h3>Preschool</h3><div class="metric-value">${totalPreschool}</div></div></div>
            <div class="metric-card"><div class="metric-icon" style="background: rgba(251, 191, 36, 0.15); color: #fbbf24;"><i data-lucide="book-open"></i></div><div class="metric-info"><h3>Tuition</h3><div class="metric-value">${totalTuition}</div></div></div>
        </div><div class="directory-grid">`;

        sortedIds.forEach(id => {
            const s = this.students[id];
            html += `<div class="directory-card" onclick="window.staffDirectory.switchView('student_report', '${id}')">
                <div class="member-header"><div class="member-avatar">${(s.name || 'S').charAt(0).toUpperCase()}</div><div class="member-info"><h3>${s.name}</h3><div style="margin-top:4px;">${this.wingBadgeHtml(s.studentType || 'preschool')}</div></div></div>
                <div class="member-details">
                    <div class="detail-item"><i data-lucide="phone"></i><span>${s.fatherPhone || s.motherPhone || 'No Phone'}</span></div>
                    <div class="detail-item"><i data-lucide="map-pin"></i><span class="text-truncate">${s.address || 'No Address'}</span></div>
                </div>
                <div class="member-actions"><button class="btn btn-ghost btn-sm" style="width:100%; justify-content:center; color: var(--accent-secondary); font-weight: 800; letter-spacing: 0.5px;">VIEW PROFILE <i data-lucide="chevron-right" style="width:16px; height:16px; margin-left:4px;"></i></button></div>
            </div>`;
        });
        container.innerHTML = html + '</div>';
    },

    renderManage() {
        const container = document.getElementById('student-content-manage');
        if (!container) return;

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const studentPerms = userData.permissions?.student_directory || {};

        this.currentView = 'manage';
        const untaggedCount = Object.values(this.students).filter(s => !s.studentType).length;
        let toolbarHtml = `<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Search admissions..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"><button class="search-clear" onclick="window.studentDirectory.handleSearch(''); this.previousElementSibling.value='';" title="Clear">×</button></div><div style="display:flex; gap:8px;">`;
        if (isAdmin && untaggedCount > 0) toolbarHtml += `<button class="btn btn-secondary" onclick="window.studentDirectory.migrateUntaggedStudents()" title="${untaggedCount} untagged"><i data-lucide="tag"></i></button>`;
        if (isAdmin) toolbarHtml += `<button class="btn btn-secondary" onclick="window.studentDirectory.rebuildEmailIndex()" title="Rebuild login index"><i data-lucide="refresh-cw"></i></button>`;
        if (isAdmin || studentPerms.add) toolbarHtml += `<button class="btn btn-primary" onclick="window.studentDirectory.showStudentForm()"><i data-lucide="user-plus"></i> New Admission</button>`;
        toolbarHtml += '</div>';
        this._setToolbar(toolbarHtml);

        const sortedIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            const q = this.searchQuery.toLowerCase();
            return (s.name || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        let html = `<div class="section-title">Admission Records</div><table class="console-table"><thead><tr><th>Student</th><th>Wing</th><th>Parent</th><th>Contact</th><th style="text-align:right" data-no-sort>Actions</th></tr></thead><tbody>`;
        sortedIds.forEach(id => {
            const s = this.students[id];
            html += `<tr><td><strong>${s.name}</strong></td><td>${this.wingBadgeHtml(s.studentType || 'preschool')}</td><td>${s.fatherName || s.motherName || 'N/A'}</td><td>${s.fatherPhone || s.motherPhone || 'N/A'}</td>
                <td style="text-align:right"><div class="table-actions" style="justify-content:flex-end">
                    ${(isAdmin || studentPerms.edit) ? `<button class="btn-icon" onclick="window.studentDirectory.showStudentForm('${id}')"><i data-lucide="edit-3"></i></button>` : ''}
                    ${(isAdmin || studentPerms.delete) ? `<button class="btn-icon text-danger" onclick="window.studentDirectory.deleteStudent('${id}')"><i data-lucide="trash-2"></i></button>` : ''}
                </div></td></tr>`;
        });
        container.innerHTML = html + '</tbody></table>';
    },

    _renderAttendanceInto(target, wing) {
        if (wing) this.currentWingFilter = wing;
        this._attTarget = target;
        this.renderAttendance();
        this._attTarget = null;
    },

    _renderAttendanceReportInto(target, wing) {
        if (wing) this.currentWingFilter = wing;
        this._attTarget = target;
        this.renderAttendanceReports();
        this._attTarget = null;
    },

    renderAttendance() {
        const container = this._attTarget || document.getElementById('student-content-attendance');
        if (!container) return;

        this.currentView = 'attendance';
        if (!this._attTarget) {
            this._setToolbar(`
                <div class="segment-controller">
                    <button class="segment-btn ${this.currentWingFilter === 'preschool' ? 'active' : ''}" onclick="window.studentDirectory.setAttendanceWingFilter('preschool')">Preschool</button>
                    <button class="segment-btn ${this.currentWingFilter === 'tuition' ? 'active' : ''}" onclick="window.studentDirectory.setAttendanceWingFilter('tuition')">Tuition</button>
                </div>
                <div class="search-box"><i data-lucide="calendar"></i><input type="date" class="form-control" value="${this.selectedDate}" onchange="window.studentDirectory.handleDateChange(this.value)"></div>
                <div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Quick find student..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"><button class="search-clear" onclick="window.studentDirectory.handleSearch(''); this.previousElementSibling.value='';" title="Clear">×</button></div>
            `);
        }

        const wingLabel = this.currentWingFilter === 'preschool' ? 'Preschool' : 'Tuition';
        const sortedIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            return (s.studentType || 'preschool') === this.currentWingFilter && (s.name || '').toLowerCase().includes(this.searchQuery.toLowerCase());
        }).sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Attendance Marker</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">${wingLabel} students — ${parseInputDate(this.selectedDate)}</p>
                </div>
                <div class="report-body">
                    <table class="console-table">
                        <thead><tr><th>Student</th><th style="text-align:right; min-width:280px;" data-no-sort>Status</th></tr></thead>
                        <tbody>${sortedIds.map(id => {
                            const s = this.students[id];
                            const att = this.attendance[id] || { status: 'none' };
                            return `
                                <tr>
                                    <td><strong>${s.name}</strong></td>
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

    markAttendance(studentId, status) {
        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const studentPerms = userData.permissions?.student_directory || {};
        if (!isAdmin && !studentPerms.attendance_mark) {
            AppDialog.toast('Unauthorized to mark attendance', 'error');
            return;
        }

        db.ref(`modules/student_directory/attendance/${this.selectedDate}/${studentId}`).set({
            status,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            performedBy: auth.currentUser?.email
        });
        window.AppLogger.log('MARK_ATTENDANCE', 'student_directory', { studentId, status, date: this.selectedDate });
    },

    async renderReport(id) {
        const container = document.getElementById('student-content-report');
        if (!container || !id) return;
        const s = this.students[id]; if (!s) return;

        const toolbar = this._toolbar();
        if (toolbar) {
            const _ud = window.currentUserData || {};
            const _canEdit = _ud.isAdmin || _ud.permissions?.student_directory?.edit;
            toolbar.innerHTML = `
                <button class="btn btn-secondary" onclick="window.staffDirectory.switchView(window.staffDirectory.studentWingFilter === 'tuition' ? 'tuition' : 'preschool')"><i data-lucide="arrow-left"></i> Back</button>
                <div style="display:flex; gap:8px; margin-left:auto;">
                    ${_canEdit ? `<button class="btn btn-secondary" onclick="window.studentDirectory.showStudentForm('${id}')"><i data-lucide="edit-3"></i> Edit</button>` : ''}
                    <button class="btn btn-secondary" onclick="window.studentDirectory.printStudentReport('${id}')"><i data-lucide="printer"></i> Print</button>
                </div>`;
        }

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const feesPerms = userData.permissions?.fees_accounting || {};

        const feeData = (window.feesManager?.fees?.[id]) || { total: 0, paid: 0 };
        const balance = (feeData.total || 0) - (feeData.paid || 0);
        const canSeeFees = isAdmin || feesPerms.view || feesPerms === true || feesPerms.ledger;

        let html = `
            <div class="profile-container" style="padding-bottom: 60px;">
                <div class="profile-header-card" style="background: linear-gradient(135deg, var(--surface-light), var(--surface)); border: 1px solid var(--card-border); padding: 40px; border-radius: 32px; margin-bottom: 32px;">
                    <div style="display:flex; align-items:center; gap:40px;">
                        <div class="profile-avatar-large" style="width:120px; height:120px; font-size:3rem; background:var(--accent-secondary); color:#000;">${(s.name || 'S').charAt(0).toUpperCase()}</div>
                        <div class="profile-main-info">
                            <h1 style="font-size: 3rem; margin-bottom: 12px; font-weight:900; letter-spacing:-1px;">${s.name}</h1>
                            <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
                                ${this.wingBadgeHtml(s.studentType || 'preschool')}
                                <span style="background:rgba(255,255,255,0.05); padding:8px 20px; border-radius:12px; font-size:0.9rem; font-family:monospace; color:var(--text-dim);">UID: ${id.slice(-8).toUpperCase()}</span>
                                <span style="background:rgba(255,255,255,0.05); padding:8px 20px; border-radius:12px; font-size:0.9rem; font-family:monospace; color:var(--text-dim);">APP NO: ${s.appNumber || 'N/A'}</span>
                                <span style="color:var(--success); font-weight:700; font-size:0.9rem;"><i data-lucide="shield-check" style="width:16px; height:16px; vertical-align:middle; margin-right:6px;"></i> VERIFIED BY: ${s.verifiedBy || 'System'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="profile-info-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:32px;">
                    <div class="profile-info-card" style="background:var(--surface); border:1px solid var(--card-border); padding:32px; border-radius:24px;">
                        <div class="form-section-title" style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;"><i data-lucide="user"></i> 1. Student Information</div>
                        <div class="data-grid" style="grid-template-columns: 1fr 1fr; gap:20px;">
                            <div class="data-item"><div class="data-label">Full Name</div><div class="data-value">${s.name}</div></div>
                            <div class="data-item"><div class="data-label">Date of Enrollment</div><div class="data-value">${parseInputDate(s.enrollmentDate)}</div></div>
                            <div class="data-item"><div class="data-label">Date of Birth</div><div class="data-value">${parseInputDate(s.dob)}</div></div>
                            <div class="data-item"><div class="data-label">Age (as on June 1)</div><div class="data-value">${s.ageAsOfJune || 'N/A'}</div></div>
                            <div class="data-item"><div class="data-label">Gender</div><div class="data-value">${s.gender || 'N/A'}</div></div>
                            <div class="data-item"><div class="data-label">Aadhaar Number</div><div class="data-value">${s.aadhaarNo || 'N/A'}</div></div>
                            <div class="data-item"><div class="data-label">Nationality</div><div class="data-value">${s.nationality || 'N/A'}</div></div>
                            <div class="data-item"><div class="data-label">Admission Class</div><div class="data-value" style="color:var(--accent-secondary); font-weight:800;">${s.admissionForClass || 'N/A'}</div></div>
                            ${s.studentType === 'tuition' ? `<div class="data-item" style="grid-column: span 2;"><div class="data-label" style="color:#fbbf24;">Student Login Email</div><div class="data-value" style="font-size:0.85rem; font-family:monospace;">${s.studentEmail || '<span style="color:var(--accent-primary)">Not set</span>'}</div></div>` : ''}
                        </div>
                        <div class="data-item" style="margin-top:20px;"><div class="data-label">Residential Address</div><div class="data-value" style="font-size:0.9rem; line-height:1.5;">${s.address || ''}<br>${s.city || ''}, ${s.state || ''} - ${s.pinCode || ''}</div></div>
                    </div>
                    
                    <div class="profile-info-card" style="background:var(--surface); border:1px solid var(--card-border); padding:32px; border-radius:24px;">
                        <div class="form-section-title" style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;"><i data-lucide="users"></i> 2 & 3. Family Details</div>
                        <div style="margin-bottom:20px;">
                            <div style="font-size:0.7rem; font-weight:800; color:var(--accent-secondary); text-transform:uppercase; margin-bottom:10px;">Mother's Information</div>
                            <div class="data-grid" style="grid-template-columns: 1fr 1fr; gap:12px;">
                                <div class="data-item"><div class="data-label">Name</div><div class="data-value">${s.motherName || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Phone</div><div class="data-value">${s.motherPhone || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Occupation</div><div class="data-value">${s.motherOccupation || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Qualification</div><div class="data-value">${s.motherQualification || 'N/A'}</div></div>
                                <div class="data-item" style="grid-column: span 2;"><div class="data-label">Email</div><div class="data-value" style="font-size:0.75rem;">${s.motherEmail || 'N/A'}</div></div>
                            </div>
                        </div>
                        <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:20px;">
                            <div style="font-size:0.7rem; font-weight:800; color:var(--accent-secondary); text-transform:uppercase; margin-bottom:10px;">Father's Information</div>
                            <div class="data-grid" style="grid-template-columns: 1fr 1fr; gap:12px;">
                                <div class="data-item"><div class="data-label">Name</div><div class="data-value">${s.fatherName || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Phone</div><div class="data-value">${s.fatherPhone || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Occupation</div><div class="data-value">${s.fatherOccupation || 'N/A'}</div></div>
                                <div class="data-item"><div class="data-label">Qualification</div><div class="data-value">${s.fatherQualification || 'N/A'}</div></div>
                                <div class="data-item" style="grid-column: span 2;"><div class="data-label">Email</div><div class="data-value" style="font-size:0.75rem;">${s.fatherEmail || 'N/A'}</div></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="profile-info-grid" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:32px; margin-top:32px;">
                    <div class="profile-info-card" style="background:var(--surface); border:1px solid var(--card-border); padding:32px; border-radius:24px;">
                        <div class="form-section-title" style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;"><i data-lucide="phone-call"></i> 4. Emergency Contact</div>
                        <div class="data-grid" style="grid-template-columns: 1fr; gap:15px;">
                            <div class="data-item"><div class="data-label">Name</div><div class="data-value" style="font-size:1.1rem;">${s.emergencyContactName || 'N/A'}</div></div>
                            <div class="data-item"><div class="data-label">Relationship</div><div class="data-value">${s.emergencyRelationship || 'N/A'}</div></div>
                            <div class="data-item"><div class="data-label">Phone</div><div class="data-value" style="font-size:1.3rem; color:var(--accent-primary); font-weight:800;">${s.emergencyPhone || 'N/A'}</div></div>
                        </div>
                    </div>

                    <div class="profile-info-card" style="background:var(--surface); border:1px solid var(--card-border); padding:32px; border-radius:24px;">
                        <div class="form-section-title" style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;"><i data-lucide="users"></i> 5. Sibling Details</div>
                        <div class="data-grid" style="grid-template-columns: 1fr; gap:15px;">
                            <div class="data-item"><div class="data-label">Has Siblings?</div><div class="data-value">${s.hasSiblings ? 'Yes' : 'No'}</div></div>
                            ${s.hasSiblings ? `<div class="data-item"><div class="data-label">Sibling 1 Name</div><div class="data-value">${s.sibling1Name || 'N/A'}</div></div><div class="data-item"><div class="data-label">Sibling 1 Age/School</div><div class="data-value">${s.sibling1Detail || 'N/A'}</div></div>` : ''}
                        </div>
                    </div>

                    <div class="profile-info-card" style="background:var(--surface); border:1px solid var(--card-border); padding:32px; border-radius:24px;">
                        <div class="form-section-title" style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;"><i data-lucide="book-open"></i> 7. Background</div>
                        <div class="data-grid" style="grid-template-columns: 1fr; gap:15px;">
                            <div class="data-item"><div class="data-label">Religion</div><div class="data-value">${s.religion || 'N/A'}</div></div>
                            <div class="data-item"><div class="data-label">Caste</div><div class="data-value">${s.caste || 'N/A'}</div></div>
                        </div>
                    </div>
                </div>

                <div class="profile-info-grid" style="display:grid; grid-template-columns: 1.2fr 1fr; gap:32px; margin-top:32px;">
                    <div class="profile-info-card" style="background:var(--surface); border:1px solid var(--card-border); padding:32px; border-radius:24px;">
                        <div class="form-section-title" style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;"><i data-lucide="heart-pulse"></i> 8. Medical Information</div>
                        <div class="data-grid" style="grid-template-columns: 1fr 1fr; gap:20px;">
                            <div class="data-item" style="grid-column: span 2;"><div class="data-label">Allergies</div><div class="data-value" style="color:${s.allergiesList ? 'var(--accent-primary)' : 'var(--text-dim)'};">${s.allergiesList || 'None Reported'}</div></div>
                            <div class="data-item" style="grid-column: span 2;"><div class="data-label">Medical Conditions</div><div class="data-value">${s.medicalConditions || 'None Reported'}</div></div>
                            <div class="data-item"><div class="data-label">Physician</div><div class="data-value">${s.physicianName || 'N/A'}</div></div>
                            <div class="data-item"><div class="data-label">Physician Phone</div><div class="data-value">${s.physicianPhone || 'N/A'}</div></div>
                        </div>
                    </div>
                    <div class="profile-info-card" style="background:var(--surface); border:1px solid var(--card-border); padding:32px; border-radius:24px;">
                        <div class="form-section-title" style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;"><i data-lucide="shield-check"></i> 9. Authorized Pickups</div>
                        <div class="data-grid" style="grid-template-columns: 1fr; gap:15px;">
                            <div class="data-item"><div class="data-label">Pickup 1 Name</div><div class="data-value" style="font-size:1.1rem;">${s.pickup1Name || 'N/A'}</div></div>
                            <div class="data-item"><div class="data-label">Relationship</div><div class="data-value">${s.pickup1Rel || 'N/A'}</div></div>
                        </div>
                    </div>
                </div>

                ${canSeeFees ? `
                <div style="margin-top: 32px;">
                    <div class="profile-info-card" style="background:var(--surface); border:1px solid var(--card-border); padding:32px; border-radius:24px;">
                        <div class="form-section-title" style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;"><i data-lucide="wallet"></i> Financial Status</div>
                        <div class="highlights" style="margin-top:0; grid-template-columns: repeat(3, 1fr);">
                            <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);"><h3>Commitment</h3><div>₹${(feeData.total || 0).toLocaleString('en-IN')}</div></div>
                            <div class="highlight-item" style="border-left: 4px solid var(--success);"><h3>Received</h3><div style="color:var(--success)">₹${(feeData.paid || 0).toLocaleString('en-IN')}</div></div>
                            <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);"><h3>Due</h3><div style="color:var(--accent-primary)">₹${balance.toLocaleString('en-IN')}</div></div>
                        </div>
                        <button class="btn btn-ghost btn-sm" style="margin-top:20px; width:100%; border:1px dashed rgba(255,255,255,0.1); height:45px;" onclick="window.feesManager.switchView('student_fees', '${id}')">OPEN FULL ACCOUNTING LEDGER <i data-lucide="external-link"></i></button>
                    </div>
                </div>` : ''}
            </div>`;
        container.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    showStudentForm(id = null, defaultType = null) {
        const s = id ? this.students[id] : {};
        const isTuition = (s.studentType || defaultType || 'preschool') === 'tuition';

        // ── Preschool fields (unchanged) ─────────────────────────────────────
        const preschoolFields = `
            <div class="form-section-title"><i data-lucide="user"></i> 1. Student Information</div>
            <div class="form-group"><label>Full Name of Child</label><input type="text" id="sf-name" class="form-control" value="${s.name || ''}" placeholder="As per Birth Certificate"></div>
            <div class="form-grid-3">
                <div class="form-group"><label>Date of Birth</label><input type="date" id="sf-dob" class="form-control" value="${s.dob || ''}"></div>
                <div class="form-group"><label>Age (as on June 1)</label><input type="text" id="sf-age" class="form-control" value="${s.ageAsOfJune || ''}"></div>
                <div class="form-group"><label>Gender</label><select id="sf-gender" class="form-control"><option value="Male" ${s.gender==='Male'?'selected':''}>Male</option><option value="Female" ${s.gender==='Female'?'selected':''}>Female</option></select></div>
            </div>
            <div class="form-group"><label>Home Address</label><input type="text" id="sf-address" class="form-control" value="${s.address || ''}"></div>
            <div class="form-grid-3">
                <div class="form-group"><label>City</label><input type="text" id="sf-city" class="form-control" value="${s.city || 'Salem'}"></div>
                <div class="form-group"><label>State</label><input type="text" id="sf-state" class="form-control" value="${s.state || 'Tamil Nadu'}"></div>
                <div class="form-group"><label>Pin Code</label><input type="text" id="sf-pin" class="form-control" value="${s.pinCode || ''}"></div>
            </div>
            <div class="form-section-title"><i data-lucide="users"></i> 2 & 3. Parents Details</div>
            <div style="background:rgba(255,255,255,0.02);padding:15px;border-radius:12px;margin-bottom:15px;">
                <label style="color:var(--accent-secondary);font-size:0.7rem;font-weight:800;text-transform:uppercase;">Mother's Details</label>
                <div class="form-group" style="margin-top:10px;"><input type="text" id="sf-m-name" class="form-control" value="${s.motherName || ''}" placeholder="Mother's Name"></div>
                <div class="form-grid-2"><input type="text" id="sf-m-occ" class="form-control" value="${s.motherOccupation || ''}" placeholder="Occupation"><input type="text" id="sf-m-qual" class="form-control" value="${s.motherQualification || ''}" placeholder="Qualification"></div>
                <div class="form-grid-2" style="margin-top:10px;"><input type="text" id="sf-m-phone" class="form-control" value="${s.motherPhone || ''}" placeholder="Phone Number"><input type="email" id="sf-m-email" class="form-control" value="${s.motherEmail || ''}" placeholder="Email (parent portal login)"></div>
            </div>
            <div style="background:rgba(255,255,255,0.02);padding:15px;border-radius:12px;">
                <label style="color:var(--accent-secondary);font-size:0.7rem;font-weight:800;text-transform:uppercase;">Father's Details</label>
                <div class="form-group" style="margin-top:10px;"><input type="text" id="sf-f-name" class="form-control" value="${s.fatherName || ''}" placeholder="Father's Name"></div>
                <div class="form-grid-2"><input type="text" id="sf-f-occ" class="form-control" value="${s.fatherOccupation || ''}" placeholder="Occupation"><input type="text" id="sf-f-qual" class="form-control" value="${s.fatherQualification || ''}" placeholder="Qualification"></div>
                <div class="form-grid-2" style="margin-top:10px;"><input type="text" id="sf-f-phone" class="form-control" value="${s.fatherPhone || ''}" placeholder="Phone Number"><input type="email" id="sf-f-email" class="form-control" value="${s.fatherEmail || ''}" placeholder="Email (parent portal login)"></div>
            </div>
            <div class="form-section-title"><i data-lucide="phone-call"></i> 4. Emergency Contact</div>
            <div class="form-grid-2"><div class="form-group"><label>Name</label><input type="text" id="sf-e-name" class="form-control" value="${s.emergencyContactName || ''}"></div><div class="form-group"><label>Relationship</label><input type="text" id="sf-e-rel" class="form-control" value="${s.emergencyRelationship || ''}"></div></div>
            <div class="form-group"><label>Emergency Phone</label><input type="text" id="sf-e-phone" class="form-control" value="${s.emergencyPhone || ''}"></div>
            <div class="form-section-title"><i data-lucide="users"></i> 5. Sibling Details</div>
            <div class="form-group"><label><input type="checkbox" id="sf-has-siblings" ${s.hasSiblings?'checked':''}> Has Siblings?</label></div>
            <div class="form-grid-2"><div class="form-group"><label>Sibling 1 Name</label><input type="text" id="sf-s1-name" class="form-control" value="${s.sibling1Name || ''}"></div><div class="form-group"><label>Sibling 1 Age/School</label><input type="text" id="sf-s1-det" class="form-control" value="${s.sibling1Detail || ''}"></div></div>
            <div class="form-section-title"><i data-lucide="book-open"></i> 6 & 7. Official & Background</div>
            <div class="form-grid-3">
                <div class="form-group"><label>Aadhaar No</label><input type="text" id="sf-aadhaar" class="form-control" value="${s.aadhaarNo || ''}"></div>
                <div class="form-group"><label>Admission for Class</label><input type="text" id="sf-class" class="form-control" value="${s.admissionForClass || ''}"></div>
                <div class="form-group"><label>Date of Enrollment</label><input type="date" id="sf-enroll-date" class="form-control" value="${s.enrollmentDate || ''}"></div>
            </div>
            <div class="form-grid-3">
                <div class="form-group"><label>Nationality</label><input type="text" id="sf-nat" class="form-control" value="${s.nationality || 'Indian'}"></div>
                <div class="form-group"><label>Religion</label><input type="text" id="sf-relig" class="form-control" value="${s.religion || ''}"></div>
                <div class="form-group"><label>Caste</label><input type="text" id="sf-caste" class="form-control" value="${s.caste || ''}"></div>
            </div>
            <div class="form-section-title"><i data-lucide="heart-pulse"></i> 8. Medical Information</div>
            <div class="form-group"><label>Allergies (if any)</label><input type="text" id="sf-allergies" class="form-control" value="${s.allergiesList || ''}"></div>
            <div class="form-group"><label>Medical Conditions</label><input type="text" id="sf-medical" class="form-control" value="${s.medicalConditions || ''}"></div>
            <div class="form-grid-2"><div class="form-group"><label>Physician Name</label><input type="text" id="sf-phys-name" class="form-control" value="${s.physicianName || ''}"></div><div class="form-group"><label>Physician Phone</label><input type="text" id="sf-phys-phone" class="form-control" value="${s.physicianPhone || ''}"></div></div>
            <div class="form-section-title"><i data-lucide="shield-check"></i> 9. Authorized Pickups</div>
            <div class="form-grid-2"><div class="form-group"><label>Pickup 1 Name</label><input type="text" id="sf-p1-name" class="form-control" value="${s.pickup1Name || ''}"></div><div class="form-group"><label>Relationship</label><input type="text" id="sf-p1-rel" class="form-control" value="${s.pickup1Rel || ''}"></div></div>
            <div class="form-section-title"><i data-lucide="clipboard-check"></i> 10 & 11. Consent & Office Use</div>
            <div class="form-grid-2"><div class="form-group"><label>Application Number</label><input type="text" id="sf-app-no" class="form-control" value="${s.appNumber || ''}"></div><div class="form-group"><label>Verified By</label><input type="text" id="sf-verified" class="form-control" value="${s.verifiedBy || ''}"></div></div>`;

        // ── Tuition fields (redesigned) ──────────────────────────────────────
        const tuitionFields = `
            <div class="form-section-title"><i data-lucide="user"></i> 1. Student Information</div>
            <div class="form-group"><label>Full Name</label><input type="text" id="sf-name" class="form-control" value="${s.name || ''}" placeholder="Student's full name"></div>
            <div class="form-grid-3">
                <div class="form-group"><label>Date of Birth</label><input type="date" id="sf-dob" class="form-control" value="${s.dob || ''}"></div>
                <div class="form-group"><label>Gender</label><select id="sf-gender" class="form-control"><option value="Male" ${s.gender==='Male'?'selected':''}>Male</option><option value="Female" ${s.gender==='Female'?'selected':''}>Female</option></select></div>
                <div class="form-group"><label>Personal Phone</label><input type="text" id="sf-student-phone" class="form-control" value="${s.studentPhone || ''}" placeholder="Student's own number"></div>
            </div>
            <div class="form-grid-2">
                <div class="form-group"><label>School Currently Attending</label><input type="text" id="sf-school" class="form-control" value="${s.currentSchool || ''}" placeholder="e.g. Government Boys Hr Sec School"></div>
                <div class="form-group"><label>Current Class / Grade</label><input type="text" id="sf-current-class" class="form-control" value="${s.currentClass || ''}" placeholder="e.g. 10th Standard"></div>
            </div>
            <div class="form-group"><label>Home Address</label><input type="text" id="sf-address" class="form-control" value="${s.address || ''}"></div>
            <div class="form-grid-3">
                <div class="form-group"><label>City</label><input type="text" id="sf-city" class="form-control" value="${s.city || 'Salem'}"></div>
                <div class="form-group"><label>State</label><input type="text" id="sf-state" class="form-control" value="${s.state || 'Tamil Nadu'}"></div>
                <div class="form-group"><label>Pin Code</label><input type="text" id="sf-pin" class="form-control" value="${s.pinCode || ''}"></div>
            </div>

            <div class="form-section-title"><i data-lucide="book-open"></i> 2. Tuition Details</div>
            <div class="form-grid-2">
                <div class="form-group"><label>Class / Level Enrolling For</label><input type="text" id="sf-class" class="form-control" value="${s.admissionForClass || ''}" placeholder="e.g. 10th Std Maths, 12th Bio Group"></div>
                <div class="form-group"><label>Medium of Instruction</label><select id="sf-medium" class="form-control"><option value="" ${!s.medium?'selected':''}>Select medium</option><option value="English" ${s.medium==='English'?'selected':''}>English Medium</option><option value="Tamil" ${s.medium==='Tamil'?'selected':''}>Tamil Medium</option></select></div>
            </div>
            <div class="form-group"><label>Subjects Taking Tuition For</label><input type="text" id="sf-subjects" class="form-control" value="${s.subjects || ''}" placeholder="e.g. Maths, Physics, Chemistry"></div>
            <div class="form-grid-2">
                <div class="form-group"><label>Preferred Days</label><input type="text" id="sf-pref-days" class="form-control" value="${s.preferredDays || ''}" placeholder="e.g. Mon, Wed, Fri"></div>
                <div class="form-group"><label>Preferred Time</label><input type="text" id="sf-pref-time" class="form-control" value="${s.preferredTime || ''}" placeholder="e.g. 4:00 PM – 6:00 PM"></div>
            </div>

            <div class="form-section-title"><i data-lucide="bar-chart-2"></i> 3. Academic Background</div>
            <div class="form-grid-2">
                <div class="form-group"><label>Previous Year Marks / %</label><input type="text" id="sf-prev-marks" class="form-control" value="${s.previousMarks || ''}" placeholder="e.g. 78% or 312/500"></div>
                <div class="form-group"><label>Weak Areas / Focus Needed</label><input type="text" id="sf-weak-areas" class="form-control" value="${s.weakAreas || ''}" placeholder="e.g. Algebra, Organic Chemistry"></div>
            </div>
            <div class="form-group"><label>Additional Notes</label><textarea id="sf-notes" class="form-control" rows="2" placeholder="Any other information relevant to teaching this student">${s.notes || ''}</textarea></div>

            <div class="form-section-title"><i data-lucide="users"></i> 4. Parent / Guardian</div>
            <div style="background:rgba(255,255,255,0.02);padding:15px;border-radius:12px;">
                <div class="form-grid-2">
                    <div class="form-group"><label>Guardian Name</label><input type="text" id="sf-m-name" class="form-control" value="${s.motherName || s.fatherName || ''}" placeholder="Mother's / Father's name"></div>
                    <div class="form-group"><label>Relationship</label><select id="sf-guardian-rel" class="form-control"><option value="Mother" ${(s.guardianRelationship||'Mother')==='Mother'?'selected':''}>Mother</option><option value="Father" ${s.guardianRelationship==='Father'?'selected':''}>Father</option><option value="Guardian" ${s.guardianRelationship==='Guardian'?'selected':''}>Other Guardian</option></select></div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group"><label>Phone</label><input type="text" id="sf-m-phone" class="form-control" value="${s.motherPhone || s.fatherPhone || ''}" placeholder="Parent phone number"></div>
                    <div class="form-group"><label>Email <span style="font-size:0.7rem;color:var(--accent-secondary);">(parent portal login)</span></label><input type="email" id="sf-m-email" class="form-control" value="${s.motherEmail || s.fatherEmail || ''}" placeholder="Parent's email address"></div>
                </div>
            </div>

            <div class="form-section-title"><i data-lucide="phone-call"></i> 5. Emergency Contact</div>
            <div class="form-grid-2"><div class="form-group"><label>Name</label><input type="text" id="sf-e-name" class="form-control" value="${s.emergencyContactName || ''}"></div><div class="form-group"><label>Relationship</label><input type="text" id="sf-e-rel" class="form-control" value="${s.emergencyRelationship || ''}"></div></div>
            <div class="form-group"><label>Emergency Phone</label><input type="text" id="sf-e-phone" class="form-control" value="${s.emergencyPhone || ''}"></div>

            <div class="form-section-title"><i data-lucide="clipboard-check"></i> 6. Official Details</div>
            <div class="form-grid-3">
                <div class="form-group"><label>Aadhaar No</label><input type="text" id="sf-aadhaar" class="form-control" value="${s.aadhaarNo || ''}"></div>
                <div class="form-group"><label>Date of Enrollment</label><input type="date" id="sf-enroll-date" class="form-control" value="${s.enrollmentDate || ''}"></div>
                <div class="form-group"><label>Application Number</label><input type="text" id="sf-app-no" class="form-control" value="${s.appNumber || ''}"></div>
            </div>
            <div class="form-group"><label>Verified By</label><input type="text" id="sf-verified" class="form-control" value="${s.verifiedBy || ''}"></div>`;

        const typeToggle = `(function(v){
            document.getElementById('sf-preschool-fields').style.display    = v==='preschool'?'block':'none';
            document.getElementById('sf-tuition-fields').style.display      = v==='tuition'?'block':'none';
            document.getElementById('sf-student-email-section').style.display = v==='tuition'?'block':'none';
        })(this.value)`;

        const content = `
            <div class="form-scroll-container" style="max-height:72vh;overflow-y:auto;padding-right:15px;">
                <!-- Enrollment type selector -->
                <div class="form-group" style="margin-bottom:20px;background:rgba(255,255,255,0.02);padding:16px;border-radius:14px;border:1px solid var(--card-border);">
                    <label style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:10px;display:block;">Enrollment Type <span style="color:var(--accent-primary)">*</span></label>
                    <select id="sf-type" class="form-control" style="font-weight:700;font-size:1rem;" onchange="${typeToggle}" ${id ? '' : 'disabled style="font-weight:700;font-size:1rem;opacity:0.8;"'}>
                        <option value="preschool" ${!isTuition?'selected':''}>Preschool</option>
                        <option value="tuition"   ${isTuition?'selected':''}>Tuition</option>
                    </select>
                    ${id ? '' : '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;">Type is set by the tab you opened this from.</div>'}
                    <!-- Tuition: student's own login email -->
                    <div id="sf-student-email-section" style="display:${isTuition?'block':'none'};margin-top:14px;padding:14px;background:rgba(251,191,36,0.05);border-radius:12px;border:1px solid rgba(251,191,36,0.2);">
                        <label style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#fbbf24;margin-bottom:8px;display:block;"><i data-lucide="at-sign" style="width:12px;height:12px;"></i> Student Login Email <span style="color:var(--accent-primary)">*</span></label>
                        <input type="email" id="sf-student-email" class="form-control" value="${s.studentEmail || ''}" placeholder="student@example.com">
                        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:6px;">Tuition students use this email to log into their portal.</div>
                    </div>
                </div>

                <div id="sf-preschool-fields" style="display:${isTuition?'none':'block'};">${preschoolFields}</div>
                <div id="sf-tuition-fields"   style="display:${isTuition?'block':'none'};">${tuitionFields}</div>
            </div>`;
        AppDialog.confirm({
            title: id ? 'Update Student Record' : 'New Admission', width: '850px', content,
            onOpen: (overlay) => { if (window.lucide) window.lucide.createIcons({ root: overlay }); },
            onConfirm: async () => {
                const v = el => document.getElementById(el)?.value || '';
                const type = v('sf-type');
                const isTuitionForm = type === 'tuition';

                // Shared fields present in both forms
                const base = {
                    studentType: type,
                    studentEmail: (v('sf-student-email')).trim().toLowerCase(),
                    name:         v('sf-name'),
                    dob:          v('sf-dob'),
                    gender:       v('sf-gender'),
                    address:      v('sf-address'),
                    city:         v('sf-city'),
                    state:        v('sf-state'),
                    pinCode:      v('sf-pin'),
                    aadhaarNo:    v('sf-aadhaar'),
                    admissionForClass: v('sf-class'),
                    enrollmentDate:    v('sf-enroll-date'),
                    emergencyContactName: v('sf-e-name'),
                    emergencyRelationship: v('sf-e-rel'),
                    emergencyPhone: v('sf-e-phone'),
                    appNumber:    v('sf-app-no'),
                    verifiedBy:   v('sf-verified'),
                    updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
                };

                let data;
                if (isTuitionForm) {
                    // Tuition-specific fields
                    // Parent email maps to motherEmail so portal login works
                    const parentEmail = (v('sf-m-email')).trim().toLowerCase();
                    const guardianRel = v('sf-guardian-rel') || 'Mother';
                    data = {
                        ...base,
                        studentPhone:       v('sf-student-phone'),
                        currentSchool:      v('sf-school'),
                        currentClass:       v('sf-current-class'),
                        medium:             v('sf-medium'),
                        subjects:           v('sf-subjects'),
                        preferredDays:      v('sf-pref-days'),
                        preferredTime:      v('sf-pref-time'),
                        previousMarks:      v('sf-prev-marks'),
                        weakAreas:          v('sf-weak-areas'),
                        notes:              v('sf-notes'),
                        guardianRelationship: guardianRel,
                        // Store parent as mother or father based on relationship
                        motherName:  guardianRel !== 'Father' ? v('sf-m-name') : '',
                        motherPhone: guardianRel !== 'Father' ? v('sf-m-phone') : '',
                        motherEmail: guardianRel !== 'Father' ? parentEmail : '',
                        fatherName:  guardianRel === 'Father' ? v('sf-m-name') : '',
                        fatherPhone: guardianRel === 'Father' ? v('sf-m-phone') : '',
                        fatherEmail: guardianRel === 'Father' ? parentEmail : '',
                    };
                } else {
                    // Preschool-specific fields
                    data = {
                        ...base,
                        ageAsOfJune:          v('sf-age'),
                        nationality:          v('sf-nat'),
                        religion:             v('sf-relig'),
                        caste:                v('sf-caste'),
                        motherName:           v('sf-m-name'),
                        motherOccupation:     v('sf-m-occ'),
                        motherQualification:  v('sf-m-qual'),
                        motherPhone:          v('sf-m-phone'),
                        motherEmail:          (v('sf-m-email')).trim().toLowerCase(),
                        fatherName:           v('sf-f-name'),
                        fatherOccupation:     v('sf-f-occ'),
                        fatherQualification:  v('sf-f-qual'),
                        fatherPhone:          v('sf-f-phone'),
                        fatherEmail:          (v('sf-f-email')).trim().toLowerCase(),
                        hasSiblings:          document.getElementById('sf-has-siblings')?.checked || false,
                        sibling1Name:         v('sf-s1-name'),
                        sibling1Detail:       v('sf-s1-det'),
                        allergiesList:        v('sf-allergies'),
                        medicalConditions:    v('sf-medical'),
                        physicianName:        v('sf-phys-name'),
                        physicianPhone:       v('sf-phys-phone'),
                        pickup1Name:          v('sf-p1-name'),
                        pickup1Rel:           v('sf-p1-rel'),
                    };
                }
                if (!data.name) return false;
                const ref = firestore.collection('modules').doc('student_directory').collection('students');
                let studentId = id;
                if (id) {
                    await ref.doc(id).update(data);
                } else {
                    const newDoc = await ref.add(data);
                    studentId = newDoc.id;
                }
                window.AppLogger.log(id ? 'EDIT_STUDENT' : 'ADD_STUDENT', 'student_directory', { name: data.name }, studentId);
                updateStudentEmailIndex(studentId, data).catch(e => console.warn('Email index update failed:', e));
                AppDialog.toast('Record saved', 'success'); return true;
            }
        });
    },

    switchReportType(type) { this.reportType = type; this.rerender(); },

    renderAttendanceReports() {
        const container = this._attTarget || document.getElementById('student-content-attendance-reports');
        if (!container) return;
        this.currentView = 'attendance_reports';
        if (!this._attTarget) {
            this._setToolbar(`<div class="report-controls" style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;"><div class="segment-controller"><button class="segment-btn ${this.currentWingFilter === 'preschool' ? 'active' : ''}" onclick="window.studentDirectory.setAttendanceWingFilter('preschool')">Preschool</button><button class="segment-btn ${this.currentWingFilter === 'tuition' ? 'active' : ''}" onclick="window.studentDirectory.setAttendanceWingFilter('tuition')">Tuition</button></div><div class="search-box"><i data-lucide="calendar"></i><input type="date" class="form-control" value="${this.selectedDate}" onchange="window.studentDirectory.handleDateChange(this.value)"></div><div class="segment-controller"><button class="segment-btn ${this.reportType === 'daily' ? 'active' : ''}" onclick="window.studentDirectory.switchReportType('daily')">Daily</button><button class="segment-btn ${this.reportType === 'weekly' ? 'active' : ''}" onclick="window.studentDirectory.switchReportType('weekly')">Weekly</button><button class="segment-btn ${this.reportType === 'monthly' ? 'active' : ''}" onclick="window.studentDirectory.switchReportType('monthly')">Monthly</button></div></div><button class="btn btn-secondary" onclick="window.print()"><i data-lucide="printer"></i> Print Analysis</button>`);
        }
        if (this.reportType === 'daily') this.renderDailyReport(container);
        else if (this.reportType === 'weekly') this.renderWeeklyReport(container);
        else if (this.reportType === 'monthly') this.renderMonthlyReport(container);
    },

    renderDailyReport(container) {
        const filteredIds = Object.keys(this.students).filter(id => (this.students[id].studentType || 'preschool') === this.currentWingFilter);
        let p = 0, a = 0, l = 0;
        filteredIds.forEach(id => { const st = this.attendance[id]?.status; if (st === 'present') p++; else if (st === 'absent') a++; else if (st === 'late') l++; });
        const wingLabel = this.currentWingFilter === 'preschool' ? 'Preschool' : 'Tuition';
        container.innerHTML = `<div class="report-page"><div class="report-hero"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Attendance Summary</h2><p style="color:var(--text-dim); font-size:1.1rem;">${wingLabel} presence breakdown for ${parseInputDate(this.selectedDate)}</p></div><div class="report-body"><div class="metrics-grid"><div class="metric-card"><div class="metric-icon" style="background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary);"><i data-lucide="users"></i></div><div class="metric-info"><h3>Total Students</h3><div class="metric-value">${filteredIds.length}</div></div></div><div class="metric-card"><div class="metric-icon" style="background: rgba(74, 222, 128, 0.1); color: var(--success);"><i data-lucide="check-circle"></i></div><div class="metric-info"><h3>Present</h3><div class="metric-value" style="color:var(--success)">${p}</div></div></div><div class="metric-card"><div class="metric-icon" style="background: rgba(241, 97, 91, 0.1); color: var(--accent-primary);"><i data-lucide="user-x"></i></div><div class="metric-info"><h3>Absent</h3><div class="metric-value" style="color:var(--accent-primary)">${a}</div></div></div><div class="metric-card"><div class="metric-icon" style="background: rgba(251, 191, 36, 0.1); color: #fbbf24;"><i data-lucide="clock"></i></div><div class="metric-info"><h3>Late</h3><div class="metric-value" style="color:#fbbf24">${l}</div></div></div></div><table class="console-table"><thead><tr><th>Student</th><th>Class</th><th>Status</th><th style="text-align:right">Time</th></tr></thead><tbody>${filteredIds.sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || '')).map(id => { const att = this.attendance[id] || { status: 'none' }, labels = { 'present': 'Present', 'absent': 'Absent', 'late': 'Late', 'none': 'Not Marked' }, classes = { 'present': 'status-success', 'absent': 'status-danger', 'late': 'status-warning', 'none': 'status-none' }; return `<tr><td><strong>${this.students[id].name}</strong></td><td>${this.students[id].admissionForClass || 'N/A'}</td><td><span class="status-pill ${classes[att.status]}">${labels[att.status]}</span></td><td style="text-align:right; font-size:0.85rem; color:var(--text-dim)">${att.timestamp ? new Date(att.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    },

    async renderWeeklyReport(container) {
        container.innerHTML = '<div class="empty-state"><i data-lucide="loader" style="animation:spin 1s linear infinite"></i><p>Compiling weekly matrix...</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        const dates = []; for (let i = 6; i >= 0; i--) { const d = new Date(this.selectedDate); d.setDate(d.getDate() - i); dates.push(d.toISOString().split('T')[0]); }
        const weeklyData = {}; for (const d of dates) { const snap = await db.ref(`modules/student_directory/attendance/${d}`).once('value'); weeklyData[d] = snap.val() || {}; }
        const wingLabel = this.currentWingFilter === 'preschool' ? 'Preschool' : 'Tuition';
        const filteredIds = Object.keys(this.students).filter(id => (this.students[id].studentType || 'preschool') === this.currentWingFilter);
        container.innerHTML = `<div class="report-page"><div class="report-hero"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Weekly Attendance Matrix</h2><p style="color:var(--text-dim); font-size:1.1rem;">${wingLabel} presence overview for the last 7 days</p></div><div class="report-body" style="padding:0;"><div style="overflow-x:auto;"><table class="console-table" style="margin-top:0; border:none; border-radius:0;"><thead><tr><th style="width:250px;">Student</th>${dates.map(d => `<th style="text-align:center; font-size:0.7rem">${d.split('-').slice(1).reverse().join('/')}</th>`).join('')}<th style="text-align:right; width:80px;">Rate</th></tr></thead><tbody>${filteredIds.sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || '')).map(id => { let p = 0; let row = `<tr><td><strong>${this.students[id].name}</strong></td>`; dates.forEach(d => { const s = weeklyData[d][id]?.status; if (s === 'present') { p++; row += '<td><div class="attendance-matrix-cell matrix-present">P</div></td>'; } else if (s === 'late') { p++; row += '<td><div class="attendance-matrix-cell matrix-late">L</div></td>'; } else if (s === 'absent') row += '<td><div class="attendance-matrix-cell matrix-absent">A</div></td>'; else row += '<td><div class="attendance-matrix-cell matrix-empty">-</div></td>'; }); row += `<td style="text-align:right; font-weight:800; color:var(--accent-secondary);">${Math.round((p/7)*100)}%</td></tr>`; return row; }).join('')}</tbody></table></div></div></div>`;
    },

    renderMonthlyReport(container) { container.innerHTML = '<div class="empty-state"><i data-lucide="bar-chart-3"></i><p>Monthly analytics view is being processed.</p></div>'; },

    migrateUntaggedStudents() {
        const untagged = Object.entries(this.students).filter(([, s]) => !s.studentType);
        if (untagged.length === 0) {
            AppDialog.toast('All students already have an enrollment type.', 'info');
            return;
        }
        AppDialog.confirm({
            title: 'Tag Unassigned Students',
            msg: `${untagged.length} student(s) have no enrollment type. Tag all of them as Preschool to complete the migration?`,
            onConfirm: async () => {
                const batch = firestore.batch();
                untagged.forEach(([id]) => {
                    batch.update(
                        firestore.collection('modules').doc('student_directory').collection('students').doc(id),
                        { studentType: 'preschool' }
                    );
                });
                await batch.commit();
                window.AppLogger.log('MIGRATE_STUDENT_TYPES', 'student_directory', { count: untagged.length });
                AppDialog.toast(`${untagged.length} student(s) tagged as Preschool.`, 'success');
                return true;
            }
        });
    },

    async rebuildEmailIndex() {
        const all = Object.entries(this.students);
        AppDialog.toast('Rebuilding index…', 'info');

        // 1. Remove stale RTDB index from previous implementation
        db.ref('studentEmailIndex').remove().catch(() => {});

        // 2. Remove stale Firestore studentEmailIndex collection if it exists
        try {
            const oldFs = await firestore.collection('studentEmailIndex').get();
            if (!oldFs.empty) {
                let b = firestore.batch(); let n = 0;
                oldFs.forEach(doc => { b.delete(doc.ref); if (++n % 490 === 0) { b.commit(); b = firestore.batch(); n = 0; } });
                await b.commit();
            }
        } catch (e) { /* ignore */ }

        // 3. Delete all existing system_enrollment student entries and rebuild fresh
        try {
            const stale = await firestore.collection('allowedUsers').where('addedBy', '==', 'system_enrollment').get();
            if (!stale.empty) {
                let b = firestore.batch(); let n = 0;
                stale.forEach(doc => { b.delete(doc.ref); if (++n % 490 === 0) { b.commit(); b = firestore.batch(); n = 0; } });
                await b.commit();
            }
        } catch (e) { console.warn('Could not clean old student entries:', e); }

        // 4. Rebuild from all current students
        for (const [studentId, data] of all) {
            await updateStudentEmailIndex(studentId, data);
        }

        AppDialog.toast(`Done — ${all.length} students synced`, 'success');
    },

    deleteStudent(id) {
        const s = this.students[id];
        AppDialog.confirm({
            title: 'Delete Student', msg: `Permanently delete ${s.name}?`, danger: true, onConfirm: async () => {
                await firestore.collection('modules').doc('student_directory').collection('students').doc(id).delete();
                deleteStudentEmailIndex(s).catch(() => {});
                window.AppLogger.log('DELETE_STUDENT', 'student_directory', { name: s.name }, id); return true;
            }
        });
    },

    printStudentReport(id) { 
        const s = this.students[id];
        window.AppLogger.log('PRINT_STUDENT_REPORT', 'student_directory', { name: s?.name }, id);
        window.print();
    }
};

// Provision allowedUsers entries for every login email on a student record.
// Role 'student' is filtered out of the People directory so it stays clean.
async function updateStudentEmailIndex(studentId, data) {
    // entries: [email, dashboardType, permissionGroup]
    const entries = [];
    if (data.studentType === 'tuition') {
        if (data.studentEmail) entries.push([data.studentEmail, 'student', 'tuition_student']);
        if (data.motherEmail)  entries.push([data.motherEmail,  'parent',  'parent']);
        if (data.fatherEmail)  entries.push([data.fatherEmail,  'parent',  'parent']);
    } else {
        // Preschool — parents only
        if (data.motherEmail) entries.push([data.motherEmail, 'parent', 'parent']);
        if (data.fatherEmail) entries.push([data.fatherEmail, 'parent', 'parent']);
    }

    for (const [email, dashboardType, permissionGroup] of entries) {
        try {
            const ref = firestore.collection('allowedUsers').doc(email);
            const existing = await ref.get();
            const doc = {
                isAdmin: false,
                role: 'student',
                permissions: {},
                permissionGroup,
                dashboardType,
                linkedStudentId: studentId,
                addedBy: 'system_enrollment',
                addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                email
            };
            if (!existing.exists || existing.data().role === 'student') {
                await ref.set(doc, { merge: false });
            } else if (existing.exists && existing.data().role === 'student' && !existing.data().linkedStudentId) {
                await ref.update({ linkedStudentId: studentId, dashboardType, permissionGroup });
            }
        } catch (e) { console.warn(`Could not provision login for ${email}:`, e); }
    }
}

async function deleteStudentEmailIndex(data) {
    const emails = [data.studentEmail, data.motherEmail, data.fatherEmail].filter(Boolean);
    for (const email of emails) {
        try {
            const doc = await firestore.collection('allowedUsers').doc(email).get();
            if (doc.exists && doc.data().role === 'student' && doc.data().addedBy === 'system_enrollment') {
                await firestore.collection('allowedUsers').doc(email).delete();
            }
        } catch (e) { console.warn(`Could not remove login for ${email}:`, e); }
    }
}
