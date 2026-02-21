/**
 * Staff Directory Module
 * Handles staff member management and rendering
 */

window.staffDirectory = {
    staff: {},
    attendance: {},
    isSubscribed: false,
    currentView: 'directory', // directory, manage, attendance

    initialize() {
        console.log("Initializing Staff Directory...");
    },

    subscribe() {
        if (this.isSubscribed) return;

        // Subscribe to Staff
        const staffRef = firebase.database().ref('modules/staff_directory/staff');
        staffRef.on('value', (snapshot) => {
            this.staff = snapshot.val() || {};
            this.render();
        });

        // Subscribe to Attendance (Today)
        const dateKey = new Date().toISOString().split('T')[0];
        const attendanceRef = firebase.database().ref(`modules/staff_directory/attendance/${dateKey}`);
        attendanceRef.on('value', (snapshot) => {
            this.attendance = snapshot.val() || {};
            if (this.currentView === 'attendance') {
                this.renderAttendance();
            }
        });

        this.isSubscribed = true;
    },

    switchView(viewName) {
        this.currentView = viewName;

        // Update Sidebar
        document.querySelectorAll('#sidebar-nav-staff .nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-staff-${viewName}`);
        if (activeNav) activeNav.classList.add('active');

        // Update View Containers
        document.querySelectorAll('.staff-subview').forEach(el => el.style.display = 'none');
        const activeView = document.getElementById(`staff-view-${viewName}`);
        if (activeView) activeView.style.display = 'block';

        this.render();
        if (typeof closeSidebar === 'function') closeSidebar();
    },

    render() {
        if (window.smartCampus.currentView !== 'staff' && window.location.hash !== '#staff') return;

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const perms = userData.permissions?.staff_directory || {};
        const isMaster = isAdmin || perms === true;

        const subtitle = document.getElementById('staff-screen-subtitle');
        if (subtitle) {
            subtitle.innerText = `${Object.keys(this.staff).length} staff members registered`;
        }

        // --- Sidebar Visibility Management ---
        const navManage = document.getElementById('nav-staff-manage');
        const navAttendance = document.getElementById('nav-staff-attendance');

        if (navManage) {
            const canManage = isMaster || perms.add || perms.manage || perms.delete;
            navManage.style.display = canManage ? 'flex' : 'none';
        }
        if (navAttendance) {
            const canAttend = isMaster || perms.attendance;
            navAttendance.style.display = canAttend ? 'flex' : 'none';
        }

        // If trying to access hidden view, fallback to directory
        if (this.currentView === 'manage' && !(isMaster || perms.add || perms.manage || perms.delete)) {
            this.currentView = 'directory';
        }
        if (this.currentView === 'attendance' && !(isMaster || perms.attendance)) {
            this.currentView = 'directory';
        }

        // Clear Toolbar Actions by default
        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) toolbar.innerHTML = '';

        if (this.currentView === 'directory') {
            this.renderDirectory();
        } else if (this.currentView === 'manage') {
            this.renderManage();
        } else if (this.currentView === 'attendance') {
            this.renderAttendance();
        }

        lucide.createIcons();
    },

    renderDirectory() {
        const container = document.getElementById('staff-grid-directory');
        if (!container) return;

        // Search Bar Only
        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
            <div class="search-box">
                <i data-lucide="search" style="width: 18px; color: var(--text-dim);"></i>
                <input type="text" id="staff-search-dir" placeholder="Search staff..." oninput="window.staffDirectory.filterDirectory()">
            </div>
        `;
        }

        container.innerHTML = this.generateCardHtml(this.staff, false); // false = no actions
    },

    renderManage() {
        const container = document.getElementById('staff-grid-manage');
        if (!container) return;

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const perms = userData.permissions?.staff_directory || {};
        const canAdd = isAdmin || perms === true || perms.add;

        // Search + Add Button
        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
            <div class="search-box">
                <i data-lucide="search" style="width: 18px; color: var(--text-dim);"></i>
                <input type="text" id="staff-search-manage" placeholder="Search staff..." oninput="window.staffDirectory.filterManage()">
            </div>
            ${canAdd ? `
                <div class="toolbar-actions">
                    <button class="btn btn-primary" onclick="window.staffDirectory.showAddModal()">
                        <i data-lucide="user-plus"></i> Add Staff
                    </button>
                </div>
            ` : ''}
        `;
        }

        container.innerHTML = this.generateCardHtml(this.staff, true); // true = with actions
    },

    renderAttendance() {
        const container = document.getElementById('staff-attendance-list');
        if (!container) return;

        const toolbar = document.getElementById('staff-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
            <div style="font-weight: 700; font-size: 1rem; width: 100%; text-align: center;">
                ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
        `;
        }

        if (Object.keys(this.staff).length === 0) {
            container.innerHTML = '<div class="empty-state">No staff found</div>';
            return;
        }

        const listHtml = Object.entries(this.staff).map(([id, staff]) => {
            const status = (this.attendance[id] && this.attendance[id].status) ? this.attendance[id].status : 'none';

            return `
            <div class="card" style="flex-direction: row; align-items: center; padding: 16px; margin-bottom: 16px; width: 100%;">
                <div class="card-icon" style="width: 48px; height: 48px; min-width: 48px; background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary); overflow: hidden; padding: 0;">
                    ${staff.photoUrl
                    ? `<img src="${staff.photoUrl}" alt="${staff.name}" style="width: 100%; height: 100%; object-fit: cover;">`
                    : `<i data-lucide="user"></i>`}
                </div>
                
                <div style="flex: 1; margin-left: 16px;">
                    <div style="font-weight: 700; font-size: 1.1rem;">${staff.name}</div>
                    <div style="color: var(--text-dim); font-size: 0.9rem;">${staff.designation}</div>
                </div>

                <div style="display: flex; gap: 8px;">
                     <button class="btn ${status === 'present' ? 'btn-primary' : 'btn-secondary'}" 
                             onclick="window.staffDirectory.toggleAttendance('${id}', 'present')"
                             style="${status === 'present' ? 'background: var(--success); border-color: var(--success);' : ''}">
                         <i data-lucide="check"></i> Present
                     </button>
                     <button class="btn ${status === 'absent' ? 'btn-primary' : 'btn-secondary'}" 
                             onclick="window.staffDirectory.toggleAttendance('${id}', 'absent')"
                             style="${status === 'absent' ? 'background: var(--accent-primary); border-color: var(--accent-primary);' : ''}">
                         <i data-lucide="x"></i> Absent
                     </button>
                </div>
            </div>
            `;
        }).join('');

        container.innerHTML = listHtml;
    },

    ensureModal() {
        if (document.getElementById('staff-modal')) return;

        const modalHtml = `
            <div id="staff-modal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="staff-modal-title">Add Staff Member</h2>
                        <button class="close-btn" onclick="window.staffDirectory.closeModal()">&times;</button>
                    </div>
                    <form id="staff-form" onsubmit="window.staffDirectory.handleStaffSubmit(event)">
                        <input type="hidden" id="staff-id">
                        <div class="form-group">
                            <label>Full Name</label>
                            <input type="text" id="staff-name" required placeholder="e.g. John Doe">
                        </div>
                        <div class="form-group">
                            <label>Designation</label>
                            <input type="text" id="staff-designation" required placeholder="e.g. Senior Teacher">
                        </div>
                        <div class="form-group">
                            <label>Department</label>
                            <input type="text" id="staff-department" placeholder="e.g. Science">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Phone</label>
                                <input type="tel" id="staff-phone" placeholder="e.g. +91 98765 43210">
                            </div>
                            <div class="form-group">
                                <label>Email</label>
                                <input type="email" id="staff-email" placeholder="e.g. john@abhishri.com">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Photo URL (Optional)</label>
                            <input type="url" id="staff-photo-url" placeholder="https://example.com/photo.jpg">
                        </div>
                        <div class="form-group">
                            <label>Bio/Notes</label>
                            <textarea id="staff-bio" rows="3" placeholder="A brief about the staff member..."></textarea>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="window.staffDirectory.closeModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Staff Member</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    generateCardHtml(staffData, showActions) {
        if (!staffData || Object.keys(staffData).length === 0) {
            return `
                <div class="empty-state">
                    <i data-lucide="users"></i>
                    <p>No staff members found.</p>
                </div>
            `;
        }

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const perms = userData.permissions?.staff_directory || {};
        const canManage = isAdmin || perms === true || perms.manage;
        const canDelete = isAdmin || perms === true || perms.delete;

        return Object.entries(staffData).map(([id, staff]) => `
            <div class="card" ${showActions && canManage ? `onclick="window.staffDirectory.editStaff('${id}')"` : ''} style="cursor: ${(showActions && canManage) ? 'pointer' : 'default'}">
                <div class="card-header">
                    <div class="card-icon" style="background: rgba(115, 199, 200, 0.1); color: var(--accent-secondary); overflow: hidden; padding: 0;">
                        ${staff.photoUrl
                ? `<img src="${staff.photoUrl}" alt="${staff.name}" style="width: 100%; height: 100%; object-fit: cover;">`
                : `<i data-lucide="user"></i>`}
                    </div>
                    ${showActions && canDelete ? `
                        <div class="card-actions" style="display: flex; gap: 8px;">
                            <button class="icon-btn danger" onclick="event.stopPropagation(); window.staffDirectory.deleteStaff('${id}')" 
                                    style="background: transparent; border: none; color: #f43f5e; cursor: pointer; padding: 4px;">
                                <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
                
                <div class="card-info">
                    <h2>${staff.name}</h2>
                    <p style="color: var(--text-dim); margin-bottom: 12px; font-size: 0.95rem;">${staff.designation}</p>
                    
                    <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; color: var(--text-dim);">
                        ${staff.department ? `
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i data-lucide="building-2" style="width: 14px; height: 14px;"></i>
                                <span>${staff.department}</span>
                            </div>
                        ` : ''}
                        
                        ${staff.email ? `
                            <a href="mailto:${staff.email}" onclick="event.stopPropagation()" style="display: flex; align-items: center; gap: 8px; color: var(--text-dim); text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='var(--accent-secondary)'" onmouseout="this.style.color='var(--text-dim)'">
                                <i data-lucide="mail" style="width: 14px; height: 14px;"></i>
                                <span>${staff.email}</span>
                            </a>
                        ` : ''}
                        
                        ${staff.phone ? `
                            <a href="tel:${staff.phone}" onclick="event.stopPropagation()" style="display: flex; align-items: center; gap: 8px; color: var(--text-dim); text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='var(--accent-secondary)'" onmouseout="this.style.color='var(--text-dim)'">
                                <i data-lucide="phone" style="width: 14px; height: 14px;"></i>
                                <span>${staff.phone}</span>
                            </a>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    },

    toggleAttendance(id, status) {
        const dateKey = new Date().toISOString().split('T')[0];
        const update = {
            status: status,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        firebase.database().ref(`modules/staff_directory/attendance/${dateKey}/${id}`).update(update);
    },

    filterDirectory() {
        this.filterStaff('staff-search-dir', 'staff-grid-directory', false);
    },

    filterManage() {
        this.filterStaff('staff-search-manage', 'staff-grid-manage', true);
    },

    filterStaff(inputId, containerId, showActions) {
        const query = document.getElementById(inputId).value.toLowerCase();
        const filtered = {};

        Object.entries(this.staff).forEach(([id, staff]) => {
            if (staff.name.toLowerCase().includes(query) ||
                staff.designation.toLowerCase().includes(query) ||
                (staff.department && staff.department.toLowerCase().includes(query))) {
                filtered[id] = staff;
            }
        });

        document.getElementById(containerId).innerHTML = this.generateCardHtml(filtered, showActions);
        lucide.createIcons();
    },

    showAddModal() {
        this.ensureModal();
        document.getElementById('staff-modal-title').innerText = 'Add Staff Member';
        document.getElementById('staff-form').reset();
        document.getElementById('staff-id').value = '';
        document.getElementById('staff-modal').style.display = 'flex';
    },

    closeModal() {
        document.getElementById('staff-modal').style.display = 'none';
    },

    editStaff(id) {
        const staff = this.staff[id];
        if (!staff) return;

        this.ensureModal();
        document.getElementById('staff-modal-title').innerText = 'Edit Staff Member';
        document.getElementById('staff-id').value = id;
        document.getElementById('staff-name').value = staff.name || '';
        document.getElementById('staff-designation').value = staff.designation || '';
        document.getElementById('staff-department').value = staff.department || '';
        document.getElementById('staff-phone').value = staff.phone || '';
        document.getElementById('staff-email').value = staff.email || '';
        document.getElementById('staff-photo-url').value = staff.photoUrl || '';
        document.getElementById('staff-bio').value = staff.bio || '';

        document.getElementById('staff-modal').style.display = 'flex';
    },

    async handleStaffSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('staff-id').value;
        const staffData = {
            name: document.getElementById('staff-name').value,
            designation: document.getElementById('staff-designation').value,
            department: document.getElementById('staff-department').value,
            phone: document.getElementById('staff-phone').value,
            email: document.getElementById('staff-email').value,
            photoUrl: document.getElementById('staff-photo-url').value,
            bio: document.getElementById('staff-bio').value,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };

        try {
            if (id) {
                await firebase.database().ref(`modules/staff_directory/staff/${id}`).update(staffData);
            } else {
                staffData.createdAt = firebase.database.ServerValue.TIMESTAMP;
                await firebase.database().ref('modules/staff_directory/staff').push(staffData);
            }
            this.closeModal();
        } catch (error) {
            console.error("Error saving staff:", error);
            alert("Failed to save staff member.");
        }
    },

    async deleteStaff(id) {
        if (!confirm("Are you sure you want to delete this staff member?")) return;

        try {
            await firebase.database().ref(`modules/staff_directory/staff/${id}`).remove();
        } catch (error) {
            console.error("Error deleting staff:", error);
            alert("Failed to delete staff member.");
        }
    }
};
