/**
 * Student Directory Module (Firestore Version)
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
    reportType: 'daily',

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
                this.render();
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

    renderSidebar() {
        const userData = window.currentUserData || {};
        const studentPerms = userData.permissions?.student_directory || {};
        const perfPerms = userData.permissions?.student_performance || {};
        const isAdmin = userData.isAdmin;

        const mapping = {
            'directory': { mod: 'student_directory', act: 'view' },
            'manage': { mod: 'student_directory', act: 'add' }, // Show manage if they can add (entry point)
            'attendance': { mod: 'student_directory', act: 'attendance_mark' },
            'attendance_reports': { mod: 'student_directory', act: 'attendance_view' },
            'performance': { mod: 'student_performance', act: 'view' }
        };

        Object.keys(mapping).forEach(view => {
            const el = document.getElementById(`nav-student-${view}`);
            if (el) {
                const p = mapping[view];
                const hasPerm = isAdmin || (userData.permissions?.[p.mod] && userData.permissions[p.mod][p.act]);
                el.style.display = hasPerm ? 'flex' : 'none';
            }
        });
    },

    switchView(view, id = null) {
        this.currentView = view;
        this.currentStudentId = id;
        
        let hash = `students/${view}`;
        if (id) hash += `/${id}`;
        window.location.hash = hash;

        // Reset search on view change
        if (view !== 'directory' && view !== 'manage') this.searchQuery = '';

        this.render();
        if (typeof closeSidebar === 'function') closeSidebar();
    },

    handleSearch(query) {
        this.searchQuery = query;
        this.render();
    },

    render() {
        if (!window.location.hash.startsWith('#students')) return;

        const container = document.getElementById('student-content');
        if (!container) return;

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const studentPerms = userData.permissions?.student_directory || {};
        const perfPerms = userData.permissions?.student_performance || {};

        // Block views based on granular permissions
        if (!isAdmin) {
            const viewMapping = {
                'directory': { mod: 'student_directory', act: 'view' },
                'manage': { mod: 'student_directory', act: 'add' }, // Entry point needs add or edit or delete
                'attendance': { mod: 'student_directory', act: 'attendance_mark' },
                'attendance_reports': { mod: 'student_directory', act: 'attendance_view' },
                'performance': { mod: 'student_performance', act: 'view' },
                'report': { mod: 'student_directory', act: 'view' }
            };
            const p = viewMapping[this.currentView];
            
            // Special check for manage: allow if they have add, edit, or delete
            let hasManageEntry = false;
            if (this.currentView === 'manage') {
                hasManageEntry = studentPerms.add || studentPerms.edit || studentPerms.delete;
            } else {
                hasManageEntry = userData.permissions?.[p.mod] && userData.permissions[p.mod][p.act];
            }

            if (p && !hasManageEntry) {
                container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-dim);">You do not have permission to access this section.</div>';
                return;
            }
        }

        this.renderSidebar();

        // Hide all subviews
        document.querySelectorAll('.student-subview').forEach(el => el.style.display = 'none');
        document.querySelectorAll('#sidebar-nav-students .nav-item').forEach(el => el.classList.remove('active'));

        const activeNav = document.getElementById(`nav-student-${this.currentView}`);
        if (activeNav) activeNav.classList.add('active');

        const subtitle = document.getElementById('student-screen-subtitle');
        if (subtitle) {
            if (this.currentView === 'report' && this.currentStudentId) {
                const s = this.students[this.currentStudentId];
                subtitle.innerText = s ? `Detailed Report for ${s.name}` : 'Student Report';
            } else {
                const labels = {
                    directory: 'Browse and search student records',
                    manage: 'Add, update or remove student files',
                    attendance: 'Mark daily presence',
                    attendance_reports: 'Visual attendance insights',
                    performance: 'Learning & development tracking'
                };
                subtitle.innerText = labels[this.currentView] || 'Student Directory';
            }
        }

        const activeView = document.getElementById(`student-view-${this.currentView}`);
        if (activeView) {
            activeView.style.display = 'block';
            activeView.style.animation = 'fadeIn 0.5s ease-out';
        }

        if (this.currentView === 'directory') this.renderDirectory();
        else if (this.currentView === 'manage') this.renderManage();
        else if (this.currentView === 'attendance') this.renderAttendance();
        else if (this.currentView === 'attendance_reports') this.renderAttendanceReports();
        else if (this.currentView === 'performance') this.renderPerformance();
        else if (this.currentView === 'report') this.renderReport(this.currentStudentId);

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderDirectory() {
        const container = document.getElementById('student-content-directory');
        if (!container) return;

        if (!this.dataLoaded) {
            container.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:100px 0; opacity:0.7;"><div class="loading-spinner"></div><p style="margin-top:20px; font-weight:600; color:var(--text-dim);">SYNCHRONIZING RECORDS...</p></div>`;
            return;
        }

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Search by name or ID..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>`;
        }

        const sortedIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            const q = this.searchQuery.toLowerCase();
            return (s.name || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        if (sortedIds.length === 0) {
            container.innerHTML = `<div class="empty-state"><i data-lucide="users"></i><p>${this.searchQuery ? 'No students match your search.' : 'No students enrolled yet.'}</p></div>`;
            return;
        }

        let html = `<div class="metrics-grid">
            <div class="metric-card"><div class="metric-icon" style="background: rgba(115, 199, 200, 0.15); color: var(--accent-secondary);"><i data-lucide="users"></i></div><div class="metric-info"><h3>Total Enrolled</h3><div class="metric-value">${Object.keys(this.students).length}</div></div></div>
        </div><div class="directory-grid">`;

        sortedIds.forEach(id => {
            const s = this.students[id];
            html += `<div class="directory-card" onclick="window.studentDirectory.switchView('report', '${id}')">
                <div class="member-header"><div class="member-avatar">${(s.name || 'S').charAt(0).toUpperCase()}</div><div class="member-info"><h3>${s.name}</h3></div></div>
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

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            let toolbarHtml = `<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Search admissions..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>`;
            toolbarHtml += '<div style="display:flex; gap:10px;">';
            if (isAdmin) toolbarHtml += `<button class="btn btn-secondary" onclick="window.studentDirectory.seedSampleStudent()"><i data-lucide="database"></i> Seed</button>`;
            if (isAdmin || studentPerms.add) toolbarHtml += `<button class="btn btn-primary" onclick="window.studentDirectory.showStudentForm()"><i data-lucide="user-plus"></i> New Admission</button>`;
            toolbarHtml += '</div>';
            toolbar.innerHTML = toolbarHtml;
        }

        const sortedIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            const q = this.searchQuery.toLowerCase();
            return (s.name || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        let html = `<div class="section-title">Admission Records</div><table class="console-table"><thead><tr><th>Student</th><th>Parent</th><th>Contact</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
        sortedIds.forEach(id => {
            const s = this.students[id];
            html += `<tr><td><strong>${s.name}</strong></td><td>${s.fatherName || s.motherName || 'N/A'}</td><td>${s.fatherPhone || s.motherPhone || 'N/A'}</td>
                <td style="text-align:right"><div class="table-actions" style="justify-content:flex-end">
                    ${(isAdmin || studentPerms.edit) ? `<button class="btn-icon" onclick="window.studentDirectory.showStudentForm('${id}')"><i data-lucide="edit-3"></i></button>` : ''}
                    ${(isAdmin || studentPerms.delete) ? `<button class="btn-icon text-danger" onclick="window.studentDirectory.deleteStudent('${id}')"><i data-lucide="trash-2"></i></button>` : ''}
                </div></td></tr>`;
        });
        container.innerHTML = html + '</tbody></table>';
    },

    renderAttendance() {
        const container = document.getElementById('student-content-attendance');
        if (!container) return;

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <div class="search-box"><i data-lucide="calendar"></i><input type="date" class="form-control" value="${this.selectedDate}" onchange="window.studentDirectory.handleDateChange(this.value)"></div>
                <div class="search-box" style="margin-left:16px;"><i data-lucide="search"></i><input type="text" placeholder="Quick find student..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>
            `;
        }

        const sortedIds = Object.keys(this.students).filter(id => (this.students[id].name || '').toLowerCase().includes(this.searchQuery.toLowerCase())).sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Attendance Marker</h2>
                    <p style="color:var(--text-dim); font-size:1.1rem;">Mark daily presence for ${parseInputDate(this.selectedDate)}</p>
                </div>
                <div class="report-body">
                    <table class="console-table">
                        <thead><tr><th>Student</th><th style="text-align:right; min-width:280px;">Status</th></tr></thead>
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

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `<button class="btn btn-secondary" onclick="window.studentDirectory.switchView('directory')"><i data-lucide="arrow-left"></i> Back to Directory</button>
                <div style="margin-left:auto; display:flex; gap:10px;"><button class="btn btn-primary" onclick="window.studentDirectory.printStudentReport('${id}')"><i data-lucide="printer"></i> Print Report</button></div>`;
        }

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const feesPerms = userData.permissions?.fees_accounting || {};
        const perfPerms = userData.permissions?.student_performance || {};

        const feeData = (window.feesManager?.fees?.[id]) || { total: 0, paid: 0 };
        const balance = (feeData.total || 0) - (feeData.paid || 0);
        
        // Pulses with safety catch
        let allPulses = [];
        let latestPulses = [];
        if (isAdmin || perfPerms.view || perfPerms === true) {
            try {
                const pulseSnap = await firestore.collection('modules').doc('student_directory').collection('performance_logs')
                    .where('studentId', '==', id).limit(50).get();
                pulseSnap.forEach(doc => allPulses.push(doc.data()));
                allPulses.sort((a, b) => new Date(b.date) - new Date(a.date));
                latestPulses = allPulses.slice(0, 3);
            } catch (e) {
                console.warn("Performance pulse access restricted or failed", e);
            }
        }

        const canSeeFees = isAdmin || feesPerms.view || feesPerms === true || feesPerms.ledger;
        const canSeePerf = isAdmin || perfPerms.view || perfPerms === true;

        let html = `
            <div class="profile-container" style="padding-bottom: 60px;">
                <div class="profile-header-card" style="background: linear-gradient(135deg, var(--surface-light), var(--surface)); border: 1px solid var(--card-border); padding: 40px; border-radius: 32px; margin-bottom: 32px;">
                    <div style="display:flex; align-items:center; gap:40px;">
                        <div class="profile-avatar-large" style="width:120px; height:120px; font-size:3rem; background:var(--accent-secondary); color:#000;">${(s.name || 'S').charAt(0).toUpperCase()}</div>
                        <div class="profile-main-info">
                            <h1 style="font-size: 3rem; margin-bottom: 12px; font-weight:900; letter-spacing:-1px;">${s.name}</h1>
                            <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
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

                <div class="profile-info-grid" style="display:grid; grid-template-columns: ${canSeeFees && canSeePerf ? '1.5fr 1fr' : '1fr'}; gap:32px; margin-top: 32px;">
                    ${canSeeFees ? `
                    <div class="profile-info-card" style="background:var(--surface); border:1px solid var(--card-border); padding:32px; border-radius:24px;">
                        <div class="form-section-title" style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;"><i data-lucide="wallet"></i> Financial Status</div>
                        <div class="highlights" style="margin-top:0; grid-template-columns: repeat(3, 1fr);">
                            <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);"><h3>Commitment</h3><div>₹${(feeData.total || 0).toLocaleString('en-IN')}</div></div>
                            <div class="highlight-item" style="border-left: 4px solid var(--success);"><h3>Received</h3><div style="color:var(--success)">₹${(feeData.paid || 0).toLocaleString('en-IN')}</div></div>
                            <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);"><h3>Due</h3><div style="color:var(--accent-primary)">₹${balance.toLocaleString('en-IN')}</div></div>
                        </div>
                        <button class="btn btn-ghost btn-sm" style="margin-top:20px; width:100%; border:1px dashed rgba(255,255,255,0.1); height:45px;" onclick="window.feesManager.switchView('student_fees', '${id}')">OPEN FULL ACCOUNTING LEDGER <i data-lucide="external-link"></i></button>
                    </div>` : ''}
                    
                    ${canSeePerf ? `
                    <div class="profile-info-card" style="background:var(--surface); border:1px solid var(--card-border); padding:32px; border-radius:24px;">
                        <div class="form-section-title" style="margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;"><i data-lucide="zap"></i> Growth Pulse</div>
                        ${latestPulses.length > 0 ? latestPulses.map(p => `<div style="padding:12px; background:rgba(255,255,255,0.02); border-radius:12px; margin-bottom:10px; border-left:3px solid var(--accent-secondary);"><div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px;"><span style="font-weight:700;">${p.category}</span><span style="opacity:0.6;">${p.date}</span></div><div style="font-size:0.85rem; line-height:1.4; color:var(--text-main);">${p.notes}</div></div>`).join('') : '<div class="empty-state" style="padding:20px;"><p>No development logs found.</p></div>'}
                        <button class="btn btn-ghost btn-sm" style="width:100%; margin-top:10px;" onclick="window.studentDirectory.switchView('performance', '${id}')">FULL PERFORMANCE HISTORY <i data-lucide="chevron-right"></i></button>
                    </div>` : ''}
                </div>
            </div>`;
        container.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    renderPerformance() {
        const container = document.getElementById('student-content-performance');
        if (!container) return;
        if (this.currentStudentId) { this.renderStudentPulse(this.currentStudentId); return; }
        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) toolbar.innerHTML = `<div class="search-box"><i data-lucide="search"></i><input type="text" placeholder="Filter by student or category..." oninput="window.studentDirectory.handleSearch(this.value)" value="${this.searchQuery}"></div>`;
        container.innerHTML = `<div class="section-title">Institutional Growth Pulse</div><div id="global-pulse-list"></div>`;
        this.renderGlobalPulse();
    },

    async renderGlobalPulse() {
        const list = document.getElementById('global-pulse-list'); if (!list) return;
        const snap = await firestore.collection('modules').doc('student_directory').collection('performance_logs').orderBy('timestamp', 'desc').limit(20).get();
        let html = `<div style="display:flex; flex-direction:column; gap:16px;">`;
        snap.forEach(doc => {
            const p = doc.data(), s = this.students[p.studentId] || { name: 'Unknown Student' };
            html += `<div class="console-card" style="padding:20px; border-left: 4px solid var(--accent-secondary);"><div style="display:flex; justify-content:space-between; margin-bottom:10px;"><div><strong style="font-size:1.1rem; color:var(--text-main);">${s.name}</strong> <span style="font-size:0.8rem; color:var(--text-dim); margin-left:10px;">• ${p.category}</span></div><div style="font-size:0.8rem; opacity:0.6;">${p.date}</div></div><p style="margin:0; line-height:1.5;">${p.notes}</p><div style="margin-top:12px; font-size:0.7rem; color:var(--text-dim); display:flex; justify-content:space-between;"><span>Log ID: ${doc.id.slice(-6).toUpperCase()}</span><span>Recorded by: ${p.createdBy}</span></div></div>`;
        });
        list.innerHTML = html + '</div>' + (snap.empty ? '<div class="empty-state">No performance logs found.</div>' : '');
    },

    async renderStudentPulse(id) {
        const container = document.getElementById('student-content-performance'), s = this.students[id]; if (!s) return;
        const userData = window.currentUserData || {}, isAdmin = userData.isAdmin, perfPerms = userData.permissions?.student_performance || {}, canLog = isAdmin || perfPerms === true || perfPerms.log;
        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) toolbar.innerHTML = `<button class="btn btn-secondary" onclick="window.studentDirectory.switchView('report', '${id}')"><i data-lucide="arrow-left"></i> Profile</button><div style="margin-left:auto; display:flex; gap:10px;">${canLog ? `<button class="btn btn-primary" onclick="window.studentDirectory.showPulseEntryForm('${id}')"><i data-lucide="plus-circle"></i> Log Daily Pulse</button>` : ''}</div>`;
        const snap = await firestore.collection('modules').doc('student_directory').collection('performance_logs').where('studentId', '==', id).limit(100).get();
        const logs = []; snap.forEach(doc => logs.push(doc.data()));
        logs.sort((a,b) => new Date(b.date) - new Date(a.date));
        let logsHtml = ''; logs.slice(0, 15).forEach(d => { logsHtml += `<div class="pulse-entry"><div class="pulse-date">${parseInputDate(d.date)}</div><div class="pulse-content"><div class="pulse-category">${d.category}</div><div class="pulse-notes">${d.notes}</div></div><div class="pulse-rating">${'★'.repeat(d.rating)}</div></div>`; });
        container.innerHTML = `<div class="performance-header"><h2>Growth Pulse: ${s.name}</h2><p>Development milestones and skill progression</p></div><div class="pulse-timeline">${logsHtml || '<div class="empty-state"><i data-lucide="activity"></i><p>No activity logs found.</p></div>'}</div>`;
        if (window.lucide) lucide.createIcons();
    },

    showPulseEntryForm(id) {
        const s = this.students[id];
        const content = `<div class="form-group"><label>Date</label><input type="date" id="p-date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div><div class="form-group" style="margin-top:15px;"><label>Focus Category</label><select id="p-cat" class="form-control"><option>Academics</option><option>Social & Behavioral</option><option>Physical Development</option><option>Creative Arts</option><option>Discipline</option></select></div><div class="form-group" style="margin-top:15px;"><label>Rating (1-5)</label><input type="number" id="p-rating" class="form-control" value="3" min="1" max="5"></div><div class="form-group" style="margin-top:15px;"><label>Observations & Notes</label><textarea id="p-notes" class="form-control" rows="4" placeholder="What happened today?"></textarea></div>`;
        AppDialog.confirm({
            title: `Log Development: ${s.name}`, content,
            onConfirm: async () => {
                const logData = { studentId: id, date: document.getElementById('p-date').value, notes: document.getElementById('p-notes').value, rating: parseInt(document.getElementById('p-rating').value), category: document.getElementById('p-cat').value, createdBy: auth.currentUser.email, timestamp: firebase.firestore.FieldValue.serverTimestamp() };
                await firestore.collection('modules').doc('student_directory').collection('performance_logs').add(logData);
                window.AppLogger.log('LOG_PULSE', 'student_directory', { category: logData.category, studentName: s.name }, id);
                AppDialog.toast('Pulse recorded', 'success'); this.renderStudentPulse(id); return true;
            }
        });
    },

    showStudentForm(id = null) {
        const s = id ? this.students[id] : {};
        const content = `<div class="form-scroll-container" style="max-height: 70vh; overflow-y: auto; padding-right: 15px;"><div class="form-section-title"><i data-lucide="user"></i> 1. Student Information</div><div class="form-group"><label>Full Name of Child</label><input type="text" id="sf-name" class="form-control" value="${s.name || ''}" placeholder="As per Birth Certificate" /></div><div class="form-grid-3"><div class="form-group"><label>Date of Birth</label><input type="date" id="sf-dob" class="form-control" value="${s.dob || ''}" /></div><div class="form-group"><label>Age (as on June 1)</label><input type="text" id="sf-age" class="form-control" value="${s.ageAsOfJune || ''}" /></div><div class="form-group"><label>Gender</label><select id="sf-gender" class="form-control"><option value="Male" ${s.gender==='Male'?'selected':''}>Male</option><option value="Female" ${s.gender==='Female'?'selected':''}>Female</option></select></div></div><div class="form-group"><label>Home Address</label><input type="text" id="sf-address" class="form-control" value="${s.address || ''}" /></div><div class="form-grid-3"><div class="form-group"><label>City</label><input type="text" id="sf-city" class="form-control" value="${s.city || 'Salem'}"></div><div class="form-group"><label>State</label><input type="text" id="sf-state" class="form-control" value="${s.state || 'Tamil Nadu'}"></div><div class="form-group"><label>Pin Code</label><input type="text" id="sf-pin" class="form-control" value="${s.pinCode || ''}"></div></div><div class="form-section-title"><i data-lucide="users"></i> 2 & 3. Parents Details</div><div style="background:rgba(255,255,255,0.02); padding:15px; border-radius:12px; margin-bottom:15px;"><label style="color:var(--accent-secondary); font-size:0.7rem; font-weight:800; text-transform:uppercase;">Mother's Details</label><div class="form-group" style="margin-top:10px;"><input type="text" id="sf-m-name" class="form-control" value="${s.motherName || ''}" placeholder="Mother's Name"></div><div class="form-grid-2"><input type="text" id="sf-m-occ" class="form-control" value="${s.motherOccupation || ''}" placeholder="Occupation"><input type="text" id="sf-m-qual" class="form-control" value="${s.motherQualification || ''}" placeholder="Qualification"></div><div class="form-grid-2" style="margin-top:10px;"><input type="text" id="sf-m-phone" class="form-control" value="${s.motherPhone || ''}" placeholder="Phone Number"><input type="email" id="sf-m-email" class="form-control" value="${s.motherEmail || ''}" placeholder="Email Address"></div></div><div style="background:rgba(255,255,255,0.02); padding:15px; border-radius:12px;"><label style="color:var(--accent-secondary); font-size:0.7rem; font-weight:800; text-transform:uppercase;">Father's Details</label><div class="form-group" style="margin-top:10px;"><input type="text" id="sf-f-name" class="form-control" value="${s.fatherName || ''}" placeholder="Father's Name"></div><div class="form-grid-2"><input type="text" id="sf-f-occ" class="form-control" value="${s.fatherOccupation || ''}" placeholder="Occupation"><input type="text" id="sf-f-qual" class="form-control" value="${s.fatherQualification || ''}" placeholder="Qualification"></div><div class="form-grid-2" style="margin-top:10px;"><input type="text" id="sf-f-phone" class="form-control" value="${s.fatherPhone || ''}" placeholder="Phone Number"><input type="email" id="sf-f-email" class="form-control" value="${s.fatherEmail || ''}" placeholder="Email Address"></div></div><div class="form-section-title"><i data-lucide="phone-call"></i> 4. Emergency Contact</div><div class="form-grid-2"><div class="form-group"><label>Name</label><input type="text" id="sf-e-name" class="form-control" value="${s.emergencyContactName || ''}"></div><div class="form-group"><label>Relationship</label><input type="text" id="sf-e-rel" class="form-control" value="${s.emergencyRelationship || ''}"></div></div><div class="form-group"><label>Emergency Phone</label><input type="text" id="sf-e-phone" class="form-control" value="${s.emergencyPhone || ''}"></div><div class="form-section-title"><i data-lucide="users"></i> 5. Sibling Details</div><div class="form-group"><label><input type="checkbox" id="sf-has-siblings" ${s.hasSiblings ? 'checked' : ''}> Has Siblings?</label></div><div class="form-grid-2"><div class="form-group"><label>Sibling 1 Name</label><input type="text" id="sf-s1-name" class="form-control" value="${s.sibling1Name || ''}"></div><div class="form-group"><label>Sibling 1 Age/School</label><input type="text" id="sf-s1-det" class="form-control" value="${s.sibling1Detail || ''}"></div></div><div class="form-section-title"><i data-lucide="book-open"></i> 6 & 7. Official & Background</div><div class="form-grid-3"><div class="form-group"><label>Aadhaar No</label><input type="text" id="sf-aadhaar" class="form-control" value="${s.aadhaarNo || ''}"></div><div class="form-group"><label>Admission for Class</label><input type="text" id="sf-class" class="form-control" value="${s.admissionForClass || ''}"></div><div class="form-group"><label>Date of Enrollment</label><input type="date" id="sf-enroll-date" class="form-control" value="${s.enrollmentDate || ''}"></div></div><div class="form-grid-3"><div class="form-group"><label>Nationality</label><input type="text" id="sf-nat" class="form-control" value="${s.nationality || 'Indian'}"></div><div class="form-group"><label>Religion</label><input type="text" id="sf-relig" class="form-control" value="${s.religion || ''}"></div><div class="form-group"><label>Caste</label><input type="text" id="sf-caste" class="form-control" value="${s.caste || ''}"></div></div><div class="form-section-title"><i data-lucide="heart-pulse"></i> 8. Medical Information</div><div class="form-group"><label>Allergies (if any)</label><input type="text" id="sf-allergies" class="form-control" value="${s.allergiesList || ''}"></div><div class="form-group"><label>Medical Conditions</label><input type="text" id="sf-medical" class="form-control" value="${s.medicalConditions || ''}"></div><div class="form-grid-2"><div class="form-group"><label>Physician Name</label><input type="text" id="sf-phys-name" class="form-control" value="${s.physicianName || ''}"></div><div class="form-group"><label>Physician Phone</label><input type="text" id="sf-phys-phone" class="form-control" value="${s.physicianPhone || ''}"></div></div><div class="form-section-title"><i data-lucide="shield-check"></i> 9. Authorized Pickups</div><div class="form-grid-2"><div class="form-group"><label>Pickup 1 Name</label><input type="text" id="sf-p1-name" class="form-control" value="${s.pickup1Name || ''}"></div><div class="form-group"><label>Relationship</label><input type="text" id="sf-p1-rel" class="form-control" value="${s.pickup1Rel || ''}"></div></div><div class="form-section-title"><i data-lucide="clipboard-check"></i> 10 & 11. Consent & Office Use</div><div class="form-grid-2"><div class="form-group"><label>Application Number</label><input type="text" id="sf-app-no" class="form-control" value="${s.appNumber || ''}"></div><div class="form-group"><label>Verified By</label><input type="text" id="sf-verified" class="form-control" value="${s.verifiedBy || ''}"></div></div></div>`;
        AppDialog.confirm({
            title: id ? 'Update Student Record' : 'New Admission', width: '850px', content,
            onOpen: (overlay) => { if (window.lucide) window.lucide.createIcons({ root: overlay }); },
            onConfirm: async () => {
                const data = { name: document.getElementById('sf-name').value, dob: document.getElementById('sf-dob').value, ageAsOfJune: document.getElementById('sf-age').value, gender: document.getElementById('sf-gender').value, address: document.getElementById('sf-address').value, city: document.getElementById('sf-city').value, state: document.getElementById('sf-state').value, pinCode: document.getElementById('sf-pin').value, motherName: document.getElementById('sf-m-name').value, motherOccupation: document.getElementById('sf-m-occ').value, motherQualification: document.getElementById('sf-m-qual').value, motherPhone: document.getElementById('sf-m-phone').value, motherEmail: document.getElementById('sf-m-email').value, fatherName: document.getElementById('sf-f-name').value, fatherOccupation: document.getElementById('sf-f-occ').value, fatherQualification: document.getElementById('sf-f-qual').value, fatherPhone: document.getElementById('sf-f-phone').value, fatherEmail: document.getElementById('sf-f-email').value, emergencyContactName: document.getElementById('sf-e-name').value, emergencyRelationship: document.getElementById('sf-e-rel').value, emergencyPhone: document.getElementById('sf-e-phone').value, hasSiblings: document.getElementById('sf-has-siblings').checked, sibling1Name: document.getElementById('sf-s1-name').value, sibling1Detail: document.getElementById('sf-s1-det').value, aadhaarNo: document.getElementById('sf-aadhaar').value, admissionForClass: document.getElementById('sf-class').value, enrollmentDate: document.getElementById('sf-enroll-date').value, nationality: document.getElementById('sf-nat').value, religion: document.getElementById('sf-relig').value, caste: document.getElementById('sf-caste').value, allergiesList: document.getElementById('sf-allergies').value, medicalConditions: document.getElementById('sf-medical').value, physicianName: document.getElementById('sf-phys-name').value, physicianPhone: document.getElementById('sf-phys-phone').value, pickup1Name: document.getElementById('sf-p1-name').value, pickup1Rel: document.getElementById('sf-p1-rel').value, appNumber: document.getElementById('sf-app-no').value, verifiedBy: document.getElementById('sf-verified').value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                if (!data.name) return false;
                const ref = firestore.collection('modules').doc('student_directory').collection('students');
                if (id) await ref.doc(id).update(data); else await ref.add(data);
                window.AppLogger.log(id ? 'EDIT_STUDENT' : 'ADD_STUDENT', 'student_directory', { name: data.name }, id);
                AppDialog.toast('Record saved', 'success'); return true;
            }
        });
    },

    switchReportType(type) { this.reportType = type; this.render(); },

    renderAttendanceReports() {
        const container = document.getElementById('student-content-attendance-reports'); if (!container) return;
        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) toolbar.innerHTML = `<div class="report-controls" style="display:flex; gap:16px; align-items:center;"><div class="search-box"><i data-lucide="calendar"></i><input type="date" class="form-control" value="${this.selectedDate}" onchange="window.studentDirectory.handleDateChange(this.value)"></div><div class="segment-controller"><button class="segment-btn ${this.reportType === 'daily' ? 'active' : ''}" onclick="window.studentDirectory.switchReportType('daily')">Daily</button><button class="segment-btn ${this.reportType === 'weekly' ? 'active' : ''}" onclick="window.studentDirectory.switchReportType('weekly')">Weekly</button><button class="segment-btn ${this.reportType === 'monthly' ? 'active' : ''}" onclick="window.studentDirectory.switchReportType('monthly')">Monthly</button></div></div><button class="btn btn-secondary" onclick="window.print()"><i data-lucide="printer"></i> Print Analysis</button>`;
        if (this.reportType === 'daily') this.renderDailyReport(container);
        else if (this.reportType === 'weekly') this.renderWeeklyReport(container);
        else if (this.reportType === 'monthly') this.renderMonthlyReport(container);
    },

    renderDailyReport(container) {
        let p = 0, a = 0, l = 0; Object.values(this.attendance).forEach(val => { if (val.status === 'present') p++; else if (val.status === 'absent') a++; else if (val.status === 'late') l++; });
        container.innerHTML = `<div class="report-page"><div class="report-hero"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Attendance Summary</h2><p style="color:var(--text-dim); font-size:1.1rem;">Presence breakdown for ${parseInputDate(this.selectedDate)}</p></div><div class="report-body"><div class="metrics-grid"><div class="metric-card"><div class="metric-icon" style="background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary);"><i data-lucide="users"></i></div><div class="metric-info"><h3>Total Students</h3><div class="metric-value">${Object.keys(this.students).length}</div></div></div><div class="metric-card"><div class="metric-icon" style="background: rgba(74, 222, 128, 0.1); color: var(--success);"><i data-lucide="check-circle"></i></div><div class="metric-info"><h3>Present</h3><div class="metric-value" style="color:var(--success)">${p}</div></div></div><div class="metric-card"><div class="metric-icon" style="background: rgba(241, 97, 91, 0.1); color: var(--accent-primary);"><i data-lucide="user-x"></i></div><div class="metric-info"><h3>Absent</h3><div class="metric-value" style="color:var(--accent-primary)">${a}</div></div></div><div class="metric-card"><div class="metric-icon" style="background: rgba(251, 191, 36, 0.1); color: #fbbf24;"><i data-lucide="clock"></i></div><div class="metric-info"><h3>Late</h3><div class="metric-value" style="color:#fbbf24">${l}</div></div></div></div><table class="console-table"><thead><tr><th>Student</th><th>Class</th><th>Status</th><th style="text-align:right">Time</th></tr></thead><tbody>${Object.keys(this.students).sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || '')).map(id => { const att = this.attendance[id] || { status: 'none' }, labels = { 'present': 'Present', 'absent': 'Absent', 'late': 'Late', 'none': 'Not Marked' }, classes = { 'present': 'status-success', 'absent': 'status-danger', 'late': 'status-warning', 'none': 'status-none' }; return `<tr><td><strong>${this.students[id].name}</strong></td><td>${this.students[id].admissionForClass || 'N/A'}</td><td><span class="status-pill ${classes[att.status]}">${labels[att.status]}</span></td><td style="text-align:right; font-size:0.85rem; color:var(--text-dim)">${att.timestamp ? new Date(att.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    },

    async renderWeeklyReport(container) {
        container.innerHTML = '<div class="empty-state"><i data-lucide="loader" style="animation:spin 1s linear infinite"></i><p>Compiling weekly matrix...</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        const dates = []; for (let i = 6; i >= 0; i--) { const d = new Date(this.selectedDate); d.setDate(d.getDate() - i); dates.push(d.toISOString().split('T')[0]); }
        const weeklyData = {}; for (const d of dates) { const snap = await db.ref(`modules/student_directory/attendance/${d}`).once('value'); weeklyData[d] = snap.val() || {}; }
        container.innerHTML = `<div class="report-page"><div class="report-hero"><h2 style="font-size:2rem; font-weight:800; margin-bottom:8px;">Weekly Attendance Matrix</h2><p style="color:var(--text-dim); font-size:1.1rem;">Student presence overview for the last 7 days</p></div><div class="report-body" style="padding:0;"><div style="overflow-x:auto;"><table class="console-table" style="margin-top:0; border:none; border-radius:0;"><thead><tr><th style="width:250px;">Student</th>${dates.map(d => `<th style="text-align:center; font-size:0.7rem">${d.split('-').slice(1).reverse().join('/')}</th>`).join('')}<th style="text-align:right; width:80px;">Rate</th></tr></thead><tbody>${Object.keys(this.students).sort((a,b) => (this.students[a].name || '').localeCompare(this.students[b].name || '')).map(id => { let p = 0; let row = `<tr><td><strong>${this.students[id].name}</strong></td>`; dates.forEach(d => { const s = weeklyData[d][id]?.status; if (s === 'present') { p++; row += '<td><div class="attendance-matrix-cell matrix-present">P</div></td>'; } else if (s === 'late') { p++; row += '<td><div class="attendance-matrix-cell matrix-late">L</div></td>'; } else if (s === 'absent') row += '<td><div class="attendance-matrix-cell matrix-absent">A</div></td>'; else row += '<td><div class="attendance-matrix-cell matrix-empty">-</div></td>'; }); row += `<td style="text-align:right; font-weight:800; color:var(--accent-secondary);">${Math.round((p/7)*100)}%</td></tr>`; return row; }).join('')}</tbody></table></div></div></div>`;
    },

    renderMonthlyReport(container) { container.innerHTML = '<div class="empty-state"><i data-lucide="bar-chart-3"></i><p>Monthly analytics view is being processed.</p></div>'; },

    deleteStudent(id) {
        const s = this.students[id];
        AppDialog.confirm({
            title: 'Delete Student', msg: `Permanently delete ${s.name}?`, danger: true, onConfirm: async () => {
                await firestore.collection('modules').doc('student_directory').collection('students').doc(id).delete();
                window.AppLogger.log('DELETE_STUDENT', 'student_directory', { name: s.name }, id); return true;
            }
        });
    },

    seedSampleStudent() {
        const sample = { name: "Aarav Sharma", dob: "2018-05-15", ageAsOfJune: "7y 1m", gender: "Male", address: "Flat 402, Lotus Apartments, MG Road", city: "Salem", state: "Tamil Nadu", pinCode: "636001", motherName: "Priya Sharma", motherOccupation: "Software Engineer", motherQualification: "B.E. Computer Science", motherPhone: "919876543211", motherEmail: "priya.s@example.com", fatherName: "Rajesh Sharma", fatherOccupation: "Business Owner", fatherQualification: "MBA", fatherPhone: "919876543210", fatherEmail: "rajesh.s@example.com", emergencyContactName: "Vikram Seth", emergencyPhone: "919822334455", hasSiblings: true, sibling1Name: "Ananya Sharma", sibling1Detail: "4y • Abhishri Academy", aadhaarNo: "1234-5678-9012", admissionForClass: "Grade 2", enrollmentDate: "2025-04-01", nationality: "Indian", religion: "Hindu", updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        firestore.collection('modules').doc('student_directory').collection('students').add(sample).then(() => AppDialog.toast('Sample student with full profile added!', 'success'));
    },

    printStudentReport(id) { 
        const s = this.students[id];
        window.AppLogger.log('PRINT_STUDENT_REPORT', 'student_directory', { name: s?.name }, id);
        window.print(); 
    }
};
