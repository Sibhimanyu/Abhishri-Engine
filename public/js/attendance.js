// Attendance Panel — Staff / Preschool / Tuition, each with mark + report modes

window.attendancePanel = {
    currentView: 'preschool',   // 'preschool' | 'tuition' | 'staff'
    mode: 'mark',           // 'mark' | 'report'
    selectedDate: new Date().toISOString().split('T')[0],
    reportType: 'daily',    // 'daily' | 'weekly' | 'monthly'

    switchView(viewName) {
        this.currentView = viewName;
        this.mode = 'mark'; // reset to mark on tab switch
        if (window.location.hash !== `#attendance/${viewName}`) {
            window.location.hash = `attendance/${viewName}`;
        }
        document.querySelectorAll('#sidebar-nav-attendance .nav-item').forEach(el => el.classList.remove('active'));
        const nav = document.getElementById(`nav-att-${viewName}`);
        if (nav) nav.classList.add('active');
        document.querySelectorAll('.att-subview').forEach(el => el.style.display = 'none');
        const view = document.getElementById(`att-view-${viewName}`);
        if (view) view.style.display = 'block';
        this.render();
        if (typeof closeSidebar === 'function') closeSidebar();
    },

    setMode(mode) {
        this.mode = mode;
        this.render();
    },

    handleDateChange(date) {
        this.selectedDate = date;
        if (this.currentView === 'staff') {
            window.staffDirectory.selectedDate = date;
            window.staffDirectory.subscribeToAttendance(date);
        } else {
            window.studentDirectory.selectedDate = date;
            window.studentDirectory.subscribeToAttendance(date);
        }
        this.render();
    },

    setReportType(type) {
        this.reportType = type;
        if (this.currentView === 'staff') window.staffDirectory.reportType = type;
        else window.studentDirectory.reportType = type;
        this.render();
    },

    initialize() {
        window.staffDirectory.subscribe();
        window.studentDirectory.subscribe();
        const hash = window.location.hash.replace('#', '');
        const parts = hash.split('/');
        if (parts.length >= 2 && ['staff','preschool','tuition'].includes(parts[1])) {
            this.currentView = parts[1];
        }
        this.switchView(this.currentView);
    },

    render() {
        const hash = window.location.hash.replace('#', '');
        if (!hash.startsWith('attendance')) return;

        const parts = hash.split('/');
        if (parts.length >= 2) this.currentView = parts[1];

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const staffPerms = userData.permissions?.staff_directory || {};
        const studentPerms = userData.permissions?.student_directory || {};

        // Sidebar nav visibility
        const setNavVisible = (id, visible) => {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? 'flex' : 'none';
        };
        const canStaff    = isAdmin || staffPerms.attendance_mark || staffPerms.attendance_self || staffPerms.attendance_view;
        const canStudents = isAdmin || studentPerms.attendance_mark || studentPerms.attendance_view;
        setNavVisible('nav-att-staff',     canStaff);
        setNavVisible('nav-att-preschool', canStudents);
        setNavVisible('nav-att-tuition',   canStudents);

        // Titles
        const titles = { staff: 'Staff Attendance', preschool: 'Preschool Kids Attendance', tuition: 'Tuition Students Attendance' };
        const el = document.getElementById('att-screen-title');
        if (el) el.innerText = titles[this.currentView] || 'Attendance';
        const sub = document.getElementById('att-screen-subtitle');
        if (sub) sub.innerText = this.mode === 'mark' ? 'Mark today\'s presence' : 'Attendance analysis';

        // Build toolbar
        const canMark   = this.currentView === 'staff'
            ? isAdmin || staffPerms.attendance_mark || staffPerms.attendance_self
            : isAdmin || studentPerms.attendance_mark;
        const canReport = this.currentView === 'staff'
            ? isAdmin || staffPerms.attendance_view
            : isAdmin || studentPerms.attendance_view;

        const modeToggle = `
            <div class="segment-controller">
                ${canMark   ? `<button class="segment-btn ${this.mode === 'mark'   ? 'active' : ''}" onclick="window.attendancePanel.setMode('mark')"><i data-lucide="check-square" style="width:14px;height:14px;"></i> Mark</button>` : ''}
                ${canReport ? `<button class="segment-btn ${this.mode === 'report' ? 'active' : ''}" onclick="window.attendancePanel.setMode('report')"><i data-lucide="bar-chart-2" style="width:14px;height:14px;"></i> Report</button>` : ''}
            </div>`;

        const datePicker = `<div class="search-box" style="flex:none; width:auto;"><i data-lucide="calendar"></i><input type="date" class="form-control" style="border:none; background:transparent; color:var(--text-main); padding:10px; min-width:140px;" value="${this.selectedDate}" onchange="window.attendancePanel.handleDateChange(this.value)"></div>`;

        const reportToggle = this.mode === 'report' ? `
            <div class="segment-controller">
                <button class="segment-btn ${this.reportType === 'daily'   ? 'active' : ''}" onclick="window.attendancePanel.setReportType('daily')">Daily</button>
                <button class="segment-btn ${this.reportType === 'weekly'  ? 'active' : ''}" onclick="window.attendancePanel.setReportType('weekly')">Weekly</button>
                <button class="segment-btn ${this.reportType === 'monthly' ? 'active' : ''}" onclick="window.attendancePanel.setReportType('monthly')">Monthly</button>
            </div>` : '';

        const toolbar = document.getElementById('att-toolbar');
        if (toolbar && !(toolbar.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) {
            toolbar.innerHTML = modeToggle + datePicker + reportToggle;
            if (typeof lucide !== 'undefined') lucide.createIcons({ root: toolbar });
        }

        // Render content into the active tab's container
        const containerId = `att-${this.currentView}-content`;
        const container = document.getElementById(containerId);
        if (!container) return;

        window.staffDirectory.appContext = 'attendance';
        window.studentDirectory.appContext = 'attendance';

        if (this.currentView === 'staff') {
            if (this.mode === 'mark') {
                window.staffDirectory.selectedDate = this.selectedDate;
                window.staffDirectory._renderAttendanceInto(container);
            } else {
                window.staffDirectory.reportType = this.reportType;
                window.staffDirectory._renderAttendanceReportInto(container);
            }
        } else {
            const wing = this.currentView; // 'preschool' | 'tuition'
            window.studentDirectory.currentWingFilter = wing;
            window.studentDirectory.selectedDate = this.selectedDate;
            if (this.mode === 'mark') {
                window.studentDirectory._renderAttendanceInto(container, wing);
            } else {
                window.studentDirectory.reportType = this.reportType;
                window.studentDirectory._renderAttendanceReportInto(container, wing);
            }
        }

        window.staffDirectory.appContext = 'people';
        window.studentDirectory.appContext = 'people';

        if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
    },
};
