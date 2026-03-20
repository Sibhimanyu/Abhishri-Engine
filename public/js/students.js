/**
 * Student Directory Module (Firestore Version)
 * Handles student record management and rendering
 */

window.studentDirectory = {
    students: {},
    attendance: {},
    isSubscribed: false,
    dataLoaded: false,
    currentView: 'directory', // directory, manage, attendance, report
    currentStudentId: null,

    initialize() {
        // Any initial setup
    },

    subscribe() {
        if (this.isSubscribed) return;

        const studentsRef = firestore.collection('modules').doc('student_directory').collection('students');

        // --- Subscribe to Students (Firestore) ---
        // Using Firestore for better scalability and querying
        studentsRef.onSnapshot((querySnapshot) => {
            const data = {};
            querySnapshot.forEach((doc) => {
                data[doc.id] = doc.data();
            });
            this.students = data;
            this.dataLoaded = true;
            this.render();
        }, (error) => {
            console.error("Firestore Student Error:", error);
            AppDialog.toast('Error loading students from Firestore', 'error');
        });

        // --- Subscribe to Attendance (Today - RTDB) ---
        // Keeping attendance in RTDB for real-time "live" status updates
        const dateKey = new Date().toISOString().split('T')[0];
        const attendanceRef = db.ref(`modules/student_directory/attendance/${dateKey}`);
        
        attendanceRef.on('value', (snapshot) => {
            this.attendance = snapshot.val() || {};
            if (this.currentView === 'attendance') {
                this.renderAttendance();
            }
        });

        this.isSubscribed = true;
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

    render() {
        const hash = window.location.hash.replace('#', '');
        if (!hash.startsWith('students')) return;

        const parts = hash.split('/');
        if (parts.length >= 2) this.currentView = parts[1];
        if (parts.length >= 3) this.currentStudentId = parts[2];

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const perms = userData.permissions?.student_directory || {};
        const isMaster = isAdmin || perms === true;

        const subtitle = document.getElementById('student-screen-subtitle');
        if (subtitle) {
            if (this.currentView === 'report' && this.currentStudentId) {
                const s = this.students[this.currentStudentId];
                subtitle.innerText = s ? `Detailed Report for ${s.name}` : 'Student Report';
            } else {
                subtitle.innerText = `${Object.keys(this.students).length} students registered (Firestore)`;
            }
        }

        const navManage = document.getElementById('nav-student-manage');
        const navAttendance = document.getElementById('nav-student-attendance');

        if (navManage) {
            const canManage = isMaster || perms.manage;
            navManage.style.display = canManage ? 'flex' : 'none';
        }
        if (navAttendance) {
            const canAttend = isMaster || perms.manage; 
            navAttendance.style.display = canAttend ? 'flex' : 'none';
        }

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) toolbar.innerHTML = '';

        if (this.currentView === 'directory') {
            this.renderDirectory();
        } else if (this.currentView === 'manage') {
            this.renderManage();
        } else if (this.currentView === 'attendance') {
            this.renderAttendance();
        } else if (this.currentView === 'report') {
            this.renderReport(this.currentStudentId);
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderDirectory() {
        const container = document.getElementById('student-content-directory');
        if (!container) return;

        if (Object.keys(this.students).length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="users"></i>
                    <p>No students found in the directory.</p>
                </div>
            `;
            return;
        }

        let html = '<div class="directory-grid">';
        
        const sortedIds = Object.keys(this.students).sort((a, b) => {
            return (this.students[a].name || '').localeCompare(this.students[b].name || '');
        });

        sortedIds.forEach(id => {
            const s = this.students[id];
            html += `
                <div class="directory-card" onclick="window.studentDirectory.switchView('report', '${id}')">
                    <div class="member-header">
                        <div class="member-avatar">
                            ${(s.name || 'S').charAt(0).toUpperCase()}
                        </div>
                        <div class="member-info">
                            <h3>${s.name || 'Unknown Student'}</h3>
                            <p>${s.admissionForClass || 'N/A'} - ${s.gender || 'N/A'}</p>
                        </div>
                    </div>
                    <div class="member-details">
                        <div class="detail-item">
                            <i data-lucide="hash"></i>
                            <span>ID: ${s.studentId || id.substring(0, 8)}</span>
                        </div>
                        <div class="detail-item">
                            <i data-lucide="phone"></i>
                            <span>Father: ${s.fatherPhone || 'N/A'}</span>
                        </div>
                        <div class="detail-item">
                            <i data-lucide="phone"></i>
                            <span>Mother: ${s.motherPhone || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="member-actions">
                        <button class="btn btn-secondary btn-sm">
                            <i data-lucide="file-text" style="width:14px;height:14px;margin-right:6px;"></i> Full Report
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderReport(id) {
        const container = document.getElementById('student-content-report');
        if (!container) return;

        // If data hasn't arrived yet, show loading
        if (!this.dataLoaded) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="loader" style="animation: spin 1s linear infinite;"></i>
                    <p>Loading student record...</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const s = this.students[id];
        if (!s) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="alert-circle"></i>
                    <p>Student record not found.</p>
                    <button class="btn btn-primary" onclick="window.studentDirectory.switchView('directory')">Back to Directory</button>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <button class="btn btn-secondary" onclick="window.studentDirectory.switchView('directory')" style="margin-right:12px;">
                    <i data-lucide="arrow-left"></i> Back to Directory
                </button>
                <button class="btn btn-primary" onclick="window.studentDirectory.showStudentForm('${id}')" style="margin-right:12px;">
                    <i data-lucide="edit-3"></i> Edit Record
                </button>
                <button class="btn btn-secondary" onclick="window.studentDirectory.printStudentReport('${id}')">
                    <i data-lucide="printer"></i> Print Full Report
                </button>
            `;
        }

        const renderDataCard = (label, value) => `
            <div class="data-card">
                <div class="data-label">${label}</div>
                <div class="data-value">${value || 'N/A'}</div>
            </div>
        `;

        container.innerHTML = `
            <div class="report-page">
                <div class="report-hero">
                    <div class="profile-image-container">
                        ${s.photoUrl ? `<img src="${s.photoUrl}" alt="${s.name}">` : `<div class="profile-image-placeholder">${(s.name || 'S').charAt(0).toUpperCase()}</div>`}
                    </div>
                    <div class="hero-content">
                        <div class="hero-badges">
                            <span class="badge badge-success">Active Student</span>
                            <span class="badge badge-gray">Class: ${s.admissionForClass || 'N/A'}</span>
                        </div>
                        <h1>${s.name || 'Unknown Student'}</h1>
                        <div class="hero-meta">
                            <div class="meta-item"><i data-lucide="hash"></i> ID: ${s.studentId || id.substring(0, 8)}</div>
                            <div class="meta-item"><i data-lucide="calendar"></i> Born: ${s.dob || 'N/A'}</div>
                            <div class="meta-item"><i data-lucide="user"></i> ${s.gender || 'N/A'}</div>
                            <div class="meta-item"><i data-lucide="map-pin"></i> ${s.address?.split(',')[0] || 'Address'}</div>
                        </div>
                    </div>
                </div>

                <div class="report-body">
                    <div class="info-section">
                        <div class="section-header">
                            <i data-lucide="user-check"></i>
                            <h2>Student Profile</h2>
                        </div>
                        <div class="data-grid">
                            ${renderDataCard('Age (as on Jun 1)', s.age)}
                            ${renderDataCard('Mother Tongue', s.motherTongue)}
                            ${renderDataCard('Nationality', s.nationality)}
                            ${renderDataCard('Religion', s.religion)}
                            ${renderDataCard('Caste/Community', s.caste)}
                            ${renderDataCard('Aadhaar Number', s.aadhaar)}
                            ${renderDataCard('Blood Group', s.bloodGroup)}
                            ${renderDataCard('Identification Marks', s.idMarks)}
                        </div>
                        <div style="margin-top:24px;">
                            ${renderDataCard('Home Address', s.address)}
                        </div>
                    </div>

                    <div class="info-section">
                        <div class="section-header">
                            <i data-lucide="users"></i>
                            <h2>Parent Information</h2>
                        </div>
                        <div class="parent-info-grid">
                            <div class="parent-column">
                                <div style="color:var(--accent-secondary); font-size:0.75rem; font-weight:700; margin-bottom:16px; letter-spacing:1px;">FATHER'S DETAILS</div>
                                <div style="display:flex; flex-direction:column; gap:12px;">
                                    ${renderDataCard('Full Name', s.fatherName)}
                                    ${renderDataCard('Occupation', s.fatherOcc)}
                                    ${renderDataCard('Qualification', s.fatherQual)}
                                    ${renderDataCard('Phone Number', s.fatherPhone)}
                                    ${renderDataCard('Email Address', s.fatherEmail)}
                                </div>
                            </div>
                            <div class="parent-column">
                                <div style="color:var(--accent-secondary); font-size:0.75rem; font-weight:700; margin-bottom:16px; letter-spacing:1px;">MOTHER'S DETAILS</div>
                                <div style="display:flex; flex-direction:column; gap:12px;">
                                    ${renderDataCard('Full Name', s.motherName)}
                                    ${renderDataCard('Occupation', s.motherOcc)}
                                    ${renderDataCard('Qualification', s.motherQual)}
                                    ${renderDataCard('Phone Number', s.motherPhone)}
                                    ${renderDataCard('Email Address', s.motherEmail)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="info-section">
                        <div class="section-header">
                            <i data-lucide="shield-alert"></i>
                            <h2>Emergency & Medical</h2>
                        </div>
                        <div class="data-grid">
                            ${renderDataCard('Emergency Contact', s.emergencyName)}
                            ${renderDataCard('Relationship', s.emergencyRel)}
                            ${renderDataCard('Emergency Phone', s.emergencyPhone)}
                            ${renderDataCard('Physician Name', s.physicianName)}
                            ${renderDataCard('Physician Phone', s.physicianPhone)}
                            ${renderDataCard('Immunization Status', s.immunizationStatus ? 'Up-to-date' : 'Not marked')}
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px; margin-top:24px;">
                            ${renderDataCard('Allergies', s.hasAllergies ? (s.allergiesList || 'Yes') : 'None')}
                            ${renderDataCard('Medical Conditions', s.hasConditions ? (s.conditionsList || 'Yes') : 'None')}
                        </div>
                    </div>

                    <div class="info-section">
                        <div class="section-header">
                            <i data-lucide="link"></i>
                            <h2>Sibling & Other Details</h2>
                        </div>
                        <div class="data-grid">
                            ${renderDataCard('Has Siblings', s.hasSiblings ? 'Yes' : 'No')}
                            ${renderDataCard('Sibling 1', s.sib1Name ? `${s.sib1Name} (${s.sib1Age} yrs)` : 'N/A')}
                            ${renderDataCard('Sibling 1 School', s.sib1School)}
                            ${renderDataCard('Sibling 2', s.sib2Name ? `${s.sib2Name} (${s.sib2Age} yrs)` : 'N/A')}
                            ${renderDataCard('Sibling 2 School', s.sib2School)}
                            ${renderDataCard('Household Income', s.income)}
                        </div>
                    </div>

                    <div class="info-section">
                        <div class="section-header">
                            <i data-lucide="truck"></i>
                            <h2>Authorized Pickup Persons</h2>
                        </div>
                        <div class="data-grid">
                            ${renderDataCard('Person 1 Name', s.pickup1Name)}
                            ${renderDataCard('Relationship', s.pickup1Rel)}
                            ${renderDataCard('Phone', s.pickup1Phone)}
                            ${renderDataCard('Person 2 Name', s.pickup2Name)}
                            ${renderDataCard('Relationship', s.pickup2Rel)}
                            ${renderDataCard('Phone', s.pickup2Phone)}
                        </div>
                    </div>

                    <div class="office-use-section" style="margin-top:40px; padding:30px; background:rgba(255,255,255,0.03); border-radius:16px; border:1px dashed var(--card-border);">
                        <div style="color:var(--text-dim); text-transform:uppercase; font-size:0.7rem; font-weight:700; letter-spacing:1px; margin-bottom:20px;">Office Administration Records</div>
                        <div class="data-grid" style="grid-template-columns: repeat(4, 1fr);">
                            ${renderDataCard('Application No', s.appNo)}
                            ${renderDataCard('Date Received', s.appDate)}
                            ${renderDataCard('Verified By', s.staffVerify)}
                            ${renderDataCard('Fee Status', s.feePaid ? 'Paid' : 'Pending')}
                        </div>
                        <div style="margin-top:24px; color:var(--text-dim); font-size:0.75rem;">
                            Profile created/updated: ${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : 'N/A'}
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderManage() {
        const container = document.getElementById('student-content-manage');
        if (!container) return;

        const toolbar = document.getElementById('student-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <button class="btn btn-primary" onclick="window.studentDirectory.showStudentForm()">
                    <i data-lucide="plus"></i> Add New Admission
                </button>
            `;
        }

        let html = `
            <table class="console-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Student ID</th>
                        <th>Class</th>
                        <th>Gender</th>
                        <th>Parent Phone</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const sortedIds = Object.keys(this.students).sort((a, b) => {
            return (this.students[a].name || '').localeCompare(this.students[b].name || '');
        });

        sortedIds.forEach(id => {
            const s = this.students[id];
            html += `
                <tr>
                    <td><strong>${s.name || 'N/A'}</strong></td>
                    <td>${s.studentId || 'N/A'}</td>
                    <td>${s.admissionForClass || 'N/A'}</td>
                    <td>${s.gender || 'N/A'}</td>
                    <td>${s.fatherPhone || s.motherPhone || 'N/A'}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-icon" onclick="window.studentDirectory.switchView('report', '${id}')" title="View Report">
                                <i data-lucide="file-text"></i>
                            </button>
                            <button class="btn-icon" onclick="window.studentDirectory.showStudentForm('${id}')" title="Edit">
                                <i data-lucide="edit-3"></i>
                            </button>
                            <button class="btn-icon btn-icon-danger" onclick="window.studentDirectory.deleteStudent('${id}')" title="Delete">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        if (sortedIds.length === 0) {
            html += '<tr><td colspan="6" style="text-align:center; padding: 40px;">No students to display.</td></tr>';
        }

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    },

    renderAttendance() {
        const container = document.getElementById('student-content-attendance');
        if (!container) return;

        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        let html = `
            <div class="attendance-header" style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h2 style="font-size: 1.25rem;">Daily Attendance</h2>
                    <p style="color: var(--text-dim)">${today}</p>
                </div>
            </div>
            <table class="console-table">
                <thead>
                    <tr>
                        <th>Student Name</th>
                        <th>Class</th>
                        <th>Status</th>
                        <th>Last Updated</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const sortedIds = Object.keys(this.students).sort((a, b) => {
            return (this.students[a].name || '').localeCompare(this.students[b].name || '');
        });

        sortedIds.forEach(id => {
            const s = this.students[id];
            const att = this.attendance[id] || { status: 'none' };
            
            html += `
                <tr>
                    <td><strong>${s.name || 'N/A'}</strong></td>
                    <td>${s.admissionForClass || 'N/A'}</td>
                    <td>
                        <div class="attendance-actions">
                            <button class="btn-chip ${att.status === 'present' ? 'active' : ''}" onclick="window.studentDirectory.markAttendance('${id}', 'present')">P</button>
                            <button class="btn-chip btn-chip-danger ${att.status === 'absent' ? 'active' : ''}" onclick="window.studentDirectory.markAttendance('${id}', 'absent')">A</button>
                            <button class="btn-chip btn-chip-warning ${att.status === 'late' ? 'active' : ''}" onclick="window.studentDirectory.markAttendance('${id}', 'late')">L</button>
                        </div>
                    </td>
                    <td style="font-size: 0.85rem; color: var(--text-dim)">
                        ${att.timestamp ? new Date(att.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    },

    showStudentForm(id = null) {
        if (typeof AppDialog === 'undefined') return;
        const s = id ? this.students[id] : {};

        const content = `
            <div class="form-scroll-container">
                <!-- Section 1: Student Information -->
                <div class="form-section-title">Student Information</div>
                <div class="form-group">
                    <label>Full Name of Child</label>
                    <input type="text" id="sf-name" class="form-control" value="${s.name || ''}" placeholder="Full Name">
                </div>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Date of Birth</label>
                        <input type="date" id="sf-dob" class="form-control" value="${s.dob || ''}">
                    </div>
                    <div class="form-group">
                        <label>Age (as on June 1)</label>
                        <input type="number" id="sf-age" class="form-control" value="${s.age || ''}">
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
                    <input type="text" id="sf-address" class="form-control" value="${s.address || ''}" placeholder="Street Address, City, State, Pin Code">
                </div>

                <!-- Section 2: Parent Details -->
                <div class="form-section-title">Parent Details (Father)</div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Father's Name</label>
                        <input type="text" id="sf-father-name" class="form-control" value="${s.fatherName || ''}">
                    </div>
                    <div class="form-group">
                        <label>Occupation</label>
                        <input type="text" id="sf-father-occ" class="form-control" value="${s.fatherOcc || ''}">
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Qualification</label>
                        <input type="text" id="sf-father-qual" class="form-control" value="${s.fatherQual || ''}">
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="text" id="sf-father-phone" class="form-control" value="${s.fatherPhone || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" id="sf-father-email" class="form-control" value="${s.fatherEmail || ''}">
                </div>

                <div class="form-section-title">Parent Details (Mother)</div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Mother's Name</label>
                        <input type="text" id="sf-mother-name" class="form-control" value="${s.motherName || ''}">
                    </div>
                    <div class="form-group">
                        <label>Occupation</label>
                        <input type="text" id="sf-mother-occ" class="form-control" value="${s.motherOcc || ''}">
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Qualification</label>
                        <input type="text" id="sf-mother-qual" class="form-control" value="${s.motherQual || ''}">
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="text" id="sf-mother-phone" class="form-control" value="${s.motherPhone || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" id="sf-mother-email" class="form-control" value="${s.motherEmail || ''}">
                </div>

                <!-- Section 3: Emergency Contact -->
                <div class="form-section-title">Emergency Contact Information</div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Contact Name</label>
                        <input type="text" id="sf-emergency-name" class="form-control" value="${s.emergencyName || ''}">
                    </div>
                    <div class="form-group">
                        <label>Relationship</label>
                        <input type="text" id="sf-emergency-rel" class="form-control" value="${s.emergencyRel || ''}">
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="text" id="sf-emergency-phone" class="form-control" value="${s.emergencyPhone || ''}">
                    </div>
                    <div class="form-group">
                        <label>Address</label>
                        <input type="text" id="sf-emergency-addr" class="form-control" value="${s.emergencyAddr || ''}">
                    </div>
                </div>

                <!-- Section 4: Siblings -->
                <div class="form-section-title">Sibling Details</div>
                <div class="checkbox-group">
                    <input type="checkbox" id="sf-has-siblings" ${s.hasSiblings ? 'checked' : ''}>
                    <label for="sf-has-siblings">Does the child have siblings?</label>
                </div>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Sibling 1 Name</label>
                        <input type="text" id="sf-sib1-name" class="form-control" value="${s.sib1Name || ''}">
                    </div>
                    <div class="form-group">
                        <label>Age</label>
                        <input type="number" id="sf-sib1-age" class="form-control" value="${s.sib1Age || ''}">
                    </div>
                    <div class="form-group">
                        <label>School</label>
                        <input type="text" id="sf-sib1-school" class="form-control" value="${s.sib1School || ''}">
                    </div>
                </div>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Sibling 2 Name</label>
                        <input type="text" id="sf-sib2-name" class="form-control" value="${s.sib2Name || ''}">
                    </div>
                    <div class="form-group">
                        <label>Age</label>
                        <input type="number" id="sf-sib2-age" class="form-control" value="${s.sib2Age || ''}">
                    </div>
                    <div class="form-group">
                        <label>School</label>
                        <input type="text" id="sf-sib2-school" class="form-control" value="${s.sib2School || ''}">
                    </div>
                </div>

                <!-- Section 5: Additional Details -->
                <div class="form-section-title">Additional & Background Details</div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Aadhaar No</label>
                        <input type="text" id="sf-aadhaar" class="form-control" value="${s.aadhaar || ''}">
                    </div>
                    <div class="form-group">
                        <label>Admission for Class</label>
                        <input type="text" id="sf-admission-class" class="form-control" value="${s.admissionForClass || ''}">
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Mother Tongue</label>
                        <input type="text" id="sf-mother-tongue" class="form-control" value="${s.motherTongue || ''}">
                    </div>
                    <div class="form-group">
                        <label>Blood Group</label>
                        <input type="text" id="sf-blood-group" class="form-control" value="${s.bloodGroup || ''}">
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Previous School</label>
                        <input type="text" id="sf-prev-school" class="form-control" value="${s.prevSchool || ''}">
                    </div>
                    <div class="form-group">
                        <label>Nationality</label>
                        <input type="text" id="sf-nationality" class="form-control" value="${s.nationality || ''}">
                    </div>
                </div>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Religion</label>
                        <input type="text" id="sf-religion" class="form-control" value="${s.religion || ''}">
                    </div>
                    <div class="form-group">
                        <label>Caste/Community</label>
                        <input type="text" id="sf-caste" class="form-control" value="${s.caste || ''}">
                    </div>
                    <div class="form-group">
                        <label>Household Income</label>
                        <input type="text" id="sf-income" class="form-control" value="${s.income || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Identification Marks</label>
                    <input type="text" id="sf-id-marks" class="form-control" value="${s.idMarks || ''}">
                </div>

                <!-- Section 6: Medical Information -->
                <div class="form-section-title">Medical Information</div>
                <div class="checkbox-group">
                    <input type="checkbox" id="sf-has-allergies" ${s.hasAllergies ? 'checked' : ''}>
                    <label for="sf-has-allergies">Has Allergies?</label>
                </div>
                <div class="form-group">
                    <label>List Allergies</label>
                    <input type="text" id="sf-allergies-list" class="form-control" value="${s.allergiesList || ''}">
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="sf-has-conditions" ${s.hasConditions ? 'checked' : ''}>
                    <label for="sf-has-conditions">Medical Conditions?</label>
                </div>
                <div class="form-group">
                    <label>Specify Conditions</label>
                    <input type="text" id="sf-conditions-list" class="form-control" value="${s.conditionsList || ''}">
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Primary Physician Name</label>
                        <input type="text" id="sf-physician-name" class="form-control" value="${s.physicianName || ''}">
                    </div>
                    <div class="form-group">
                        <label>Physician Phone</label>
                        <input type="text" id="sf-physician-phone" class="form-control" value="${s.physicianPhone || ''}">
                    </div>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="sf-immunization" ${s.immunizationStatus ? 'checked' : ''}>
                    <label for="sf-immunization">Immunization Up-to-date?</label>
                </div>

                <!-- Section 7: Pickup Persons -->
                <div class="form-section-title">Authorized Pickup Persons</div>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Pickup 1 Name</label>
                        <input type="text" id="sf-pickup1-name" class="form-control" value="${s.pickup1Name || ''}">
                    </div>
                    <div class="form-group">
                        <label>Relationship</label>
                        <input type="text" id="sf-pickup1-rel" class="form-control" value="${s.pickup1Rel || ''}">
                    </div>
                    <div class="form-group">
                        <label>Phone</label>
                        <input type="text" id="sf-pickup1-phone" class="form-control" value="${s.pickup1Phone || ''}">
                    </div>
                </div>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Pickup 2 Name</label>
                        <input type="text" id="sf-pickup2-name" class="form-control" value="${s.pickup2Name || ''}">
                    </div>
                    <div class="form-group">
                        <label>Relationship</label>
                        <input type="text" id="sf-pickup2-rel" class="form-control" value="${s.pickup2Rel || ''}">
                    </div>
                    <div class="form-group">
                        <label>Phone</label>
                        <input type="text" id="sf-pickup2-phone" class="form-control" value="${s.pickup2Phone || ''}">
                    </div>
                </div>

                <!-- Section 8: Office Use -->
                <div class="form-section-title">For Office Use Only</div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Application Number</label>
                        <input type="text" id="sf-app-no" class="form-control" value="${s.appNo || ''}">
                    </div>
                    <div class="form-group">
                        <label>Date Received</label>
                        <input type="date" id="sf-app-date" class="form-control" value="${s.appDate || ''}">
                    </div>
                </div>
                <div class="form-grid-2">
                    <div class="form-group">
                        <label>Receiving Staff</label>
                        <input type="text" id="sf-staff-recv" class="form-control" value="${s.staffRecv || ''}">
                    </div>
                    <div class="form-group">
                        <label>Verifying Staff</label>
                        <input type="text" id="sf-staff-verify" class="form-control" value="${s.staffVerify || ''}">
                    </div>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="sf-fee-paid" ${s.feePaid ? 'checked' : ''}>
                    <label for="sf-fee-paid">Application Fee Paid?</label>
                </div>
            </div>
        `;

        AppDialog.confirm({
            title: id ? 'Edit Admission Record' : 'New School Admission',
            content: content,
            width: '800px',
            confirmText: id ? 'Update Record' : 'Save Admission',
            onConfirm: () => {
                const getVal = (id) => document.getElementById(id).value;
                const getCheck = (id) => document.getElementById(id).checked;

                const data = {
                    name: getVal('sf-name'),
                    dob: getVal('sf-dob'),
                    age: getVal('sf-age'),
                    gender: getVal('sf-gender'),
                    address: getVal('sf-address'),
                    
                    fatherName: getVal('sf-father-name'),
                    fatherOcc: getVal('sf-father-occ'),
                    fatherQual: getVal('sf-father-qual'),
                    fatherPhone: getVal('sf-father-phone'),
                    fatherEmail: getVal('sf-father-email'),

                    motherName: getVal('sf-mother-name'),
                    motherOcc: getVal('sf-mother-occ'),
                    motherQual: getVal('sf-mother-qual'),
                    motherPhone: getVal('sf-mother-phone'),
                    motherEmail: getVal('sf-mother-email'),

                    emergencyName: getVal('sf-emergency-name'),
                    emergencyRel: getVal('sf-emergency-rel'),
                    emergencyPhone: getVal('sf-emergency-phone'),
                    emergencyAddr: getVal('sf-emergency-addr'),

                    hasSiblings: getCheck('sf-has-siblings'),
                    sib1Name: getVal('sf-sib1-name'),
                    sib1Age: getVal('sf-sib1-age'),
                    sib1School: getVal('sf-sib1-school'),
                    sib2Name: getVal('sf-sib2-name'),
                    sib2Age: getVal('sf-sib2-age'),
                    sib2School: getVal('sf-sib2-school'),

                    aadhaar: getVal('sf-aadhaar'),
                    admissionForClass: getVal('sf-admission-class'),
                    motherTongue: getVal('sf-mother-tongue'),
                    bloodGroup: getVal('sf-blood-group'),
                    prevSchool: getVal('sf-prev-school'),
                    nationality: getVal('sf-nationality'),
                    religion: getVal('sf-religion'),
                    caste: getVal('sf-caste'),
                    idMarks: getVal('sf-id-marks'),
                    income: getVal('sf-income'),

                    hasAllergies: getCheck('sf-has-allergies'),
                    allergiesList: getVal('sf-allergies-list'),
                    hasConditions: getCheck('sf-has-conditions'),
                    conditionsList: getVal('sf-conditions-list'),
                    physicianName: getVal('sf-physician-name'),
                    physicianPhone: getVal('sf-physician-phone'),
                    immunizationStatus: getCheck('sf-immunization'),

                    pickup1Name: getVal('sf-pickup1-name'),
                    pickup1Rel: getVal('sf-pickup1-rel'),
                    pickup1Phone: getVal('sf-pickup1-phone'),
                    pickup2Name: getVal('sf-pickup2-name'),
                    pickup2Rel: getVal('sf-pickup2-rel'),
                    pickup2Phone: getVal('sf-pickup2-phone'),

                    appNo: getVal('sf-app-no'),
                    appDate: getVal('sf-app-date'),
                    staffRecv: getVal('sf-staff-recv'),
                    staffVerify: getVal('sf-staff-verify'),
                    feePaid: getCheck('sf-fee-paid'),
                    
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                if (!data.name) {
                    AppDialog.toast('Student name is required', 'error');
                    return false;
                }

                this.saveStudent(id, data);
                return true;
            }
        });
    },

    saveStudent(id, data) {
        const studentsRef = firestore.collection('modules').doc('student_directory').collection('students');
        const promise = id ? studentsRef.doc(id).update(data) : studentsRef.add(data);
        
        promise
            .then(() => AppDialog.toast(id ? 'Record updated' : 'Admission saved', 'success'))
            .catch(err => AppDialog.toast('Error saving record: ' + err.message, 'error'));
    },

    deleteStudent(id) {
        AppDialog.confirm({
            title: 'Delete Record',
            content: `<p>Are you sure you want to delete <strong>${this.students[id].name}</strong>? This will permanently remove all admission data.</p>`,
            confirmText: 'Delete Permanently',
            danger: true,
            onConfirm: () => {
                firestore.collection('modules').doc('student_directory').collection('students').doc(id).delete()
                    .then(() => AppDialog.toast('Record deleted', 'success'))
                    .catch(err => AppDialog.toast('Error deleting record: ' + err.message, 'error'));
                return true;
            }
        });
    },

    printStudentReport(id) {
        const s = this.students[id];
        if (!s) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Admission Report - ${s.name}</title>
                <style>
                    body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                    .header { text-align: center; border-bottom: 2px solid #F1615B; padding-bottom: 20px; margin-bottom: 30px; }
                    .header h1 { margin: 0; color: #F1615B; }
                    .section { margin-bottom: 25px; page-break-inside: avoid; }
                    .section-title { font-weight: bold; text-transform: uppercase; background: #f0f0f0; padding: 5px 10px; margin-bottom: 10px; border-left: 4px solid #F1615B; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                    .field { margin-bottom: 5px; }
                    .label { font-weight: bold; min-width: 150px; display: inline-block; }
                    @media print {
                        .no-print { display: none; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Abhishri Academy</h1>
                    <p>Student Admission Report</p>
                </div>

                <div class="section">
                    <div class="section-title">Student Information</div>
                    <div class="grid">
                        <div class="field"><span class="label">Name:</span> ${s.name || 'N/A'}</div>
                        <div class="field"><span class="label">Gender:</span> ${s.gender || 'N/A'}</div>
                        <div class="field"><span class="label">DOB:</span> ${s.dob || 'N/A'}</div>
                        <div class="field"><span class="label">Age (Jun 1):</span> ${s.age || 'N/A'}</div>
                        <div class="field" style="grid-column:span 2"><span class="label">Address:</span> ${s.address || 'N/A'}</div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Parent Information</div>
                    <div class="grid">
                        <div class="field"><span class="label">Father Name:</span> ${s.fatherName || 'N/A'}</div>
                        <div class="field"><span class="label">Father Phone:</span> ${s.fatherPhone || 'N/A'}</div>
                        <div class="field"><span class="label">Mother Name:</span> ${s.motherName || 'N/A'}</div>
                        <div class="field"><span class="label">Mother Phone:</span> ${s.motherPhone || 'N/A'}</div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Emergency Contact</div>
                    <div class="grid">
                        <div class="field"><span class="label">Contact Name:</span> ${s.emergencyName || 'N/A'}</div>
                        <div class="field"><span class="label">Relationship:</span> ${s.emergencyRel || 'N/A'}</div>
                        <div class="field"><span class="label">Phone:</span> ${s.emergencyPhone || 'N/A'}</div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Background & Medical</div>
                    <div class="grid">
                        <div class="field"><span class="label">Aadhaar:</span> ${s.aadhaar || 'N/A'}</div>
                        <div class="field"><span class="label">Admission Class:</span> ${s.admissionForClass || 'N/A'}</div>
                        <div class="field"><span class="label">Allergies:</span> ${s.hasAllergies ? (s.allergiesList || 'Yes') : 'None'}</div>
                        <div class="field"><span class="label">Immunization:</span> ${s.immunizationStatus ? 'Up-to-date' : 'No'}</div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Office Records</div>
                    <div class="grid">
                        <div class="field"><span class="label">App No:</span> ${s.appNo || 'N/A'}</div>
                        <div class="field"><span class="label">Date Received:</span> ${s.appDate || 'N/A'}</div>
                        <div class="field"><span class="label">Fee Paid:</span> ${s.feePaid ? 'Yes' : 'No'}</div>
                    </div>
                </div>

                <script>
                    window.onload = () => {
                        window.print();
                        setTimeout(() => { window.close(); }, 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    },

    markAttendance(studentId, status) {
        const dateKey = new Date().toISOString().split('T')[0];
        const ref = db.ref(`modules/student_directory/attendance/${dateKey}/${studentId}`);
        
        ref.set({
            status,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        }).catch(err => AppDialog.toast('Error marking attendance: ' + err.message, 'error'));
    }
};
