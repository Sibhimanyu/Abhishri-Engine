// UI and Navigation Helper Functions

function getAreaIcon(name) {
    const lower = name.toLowerCase();

    // Floors
    if (lower.includes('ground floor') || lower.includes('ground_floor')) return 'home';
    if (lower.includes('first floor') || lower.includes('first_floor')) return 'layers';
    if (lower.includes('terrace')) return 'cloud';

    // Specific Rooms
    if (lower.includes('kitchen')) return 'utensils';
    if (lower.includes('auditorium')) return 'mic';
    if (lower.includes('central room') || lower.includes('central_room')) return 'grid-3x3';
    if (lower.includes('reception')) return 'info';
    if (lower.includes('bathroom') || lower.includes('toilet')) return 'bath';
    if (lower.includes('exit room') || lower.includes('exit_room')) return 'door-open';
    if (lower.includes('entrance room') || lower.includes('entrance_room')) return 'door-closed';
    if (lower.includes('staircase')) return 'move-vertical';

    // Zones
    if (lower.includes('zone 1') || lower.includes('zone_1')) return 'square-1';
    if (lower.includes('zone 2') || lower.includes('zone_2')) return 'square-2';
    if (lower.includes('zone 3') || lower.includes('zone_3')) return 'square-3';
    if (lower.includes('zone 4') || lower.includes('zone_4')) return 'square-4';
    if (lower.includes('zone')) return 'map-pin';

    // Office/Work Spaces
    if (lower.includes('computer lab') || lower.includes('lab')) return 'monitor';
    if (lower.includes('ceo') || lower.includes('admin') || lower.includes('office')) return 'briefcase';

    // General Categories
    if (lower.includes('living')) return 'sofa';
    if (lower.includes('bedroom')) return 'bed';
    if (lower.includes('classroom')) return 'graduation-cap';
    if (lower.includes('library')) return 'book-open';
    if (lower.includes('gym')) return 'dumbbell';
    if (lower.includes('parking') || lower.includes('garage')) return 'car';
    if (lower.includes('garden')) return 'tree-pine';
    if (lower.includes('server')) return 'server';
    if (lower.includes('maintenance')) return 'wrench';
    if (lower.includes('gate') || lower.includes('security')) return 'shield';

    return 'box';
}

function formatName(name) {
    if (!name) return name;
    return name.split(/[\._ ]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function toggleSidebar() {
    const activeApp = document.querySelector('.app-wrapper.active');
    if (!activeApp) return;

    const sidebar = activeApp.querySelector('.console-sidebar');
    const overlay = activeApp.querySelector('.sidebar-overlay');
    const toggle = activeApp.querySelector('.mobile-nav-toggle');

    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
    if (toggle) toggle.classList.toggle('active');

    // Update icons
    lucide.createIcons();
}

function closeSidebar() {
    if (window.innerWidth <= 1024) {
        document.querySelectorAll('.console-sidebar').forEach(el => el.classList.remove('open'));
        document.querySelectorAll('.sidebar-overlay').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-toggle').forEach(el => el.classList.remove('active'));
    }
}

function switchView(viewId, areaId = null) {
    window.smartCampus.currentView = viewId;
    window.smartCampus.activeAreaId = areaId;

    // Update Sidebar items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (viewId === 'overview' && item.innerText.includes('Overview')) item.classList.add('active');
        if (areaId && item.dataset.areaId === areaId) item.classList.add('active');
    });

    // Update View Visibility - SCOPED TO SMART CAMPUS ONLY
    // PREVIOUS BUG: This was selecting ALL .view elements on the page, hiding WhatsApp/Staff views
    const smartCampusApp = document.getElementById('smart-campus-app');
    if (smartCampusApp) {
        smartCampusApp.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    }

    if (viewId === 'overview') {
        document.getElementById('view-overview').classList.add('active');
        document.getElementById('screen-title').innerText = 'Campus Overview';
        document.getElementById('screen-subtitle').innerText = 'Monitoring all smart systems';
    } else {
        const area = window.smartCampus.areas[areaId];
        if (area) {
            const areaName = formatName(area.name || areaId);
            document.getElementById('view-room').classList.add('active');
            document.getElementById('screen-title').innerText = areaName;
            document.getElementById('screen-subtitle').innerText = `Controlling ${Object.keys(area.devices || {}).length} items`;
            window.smartCampus.renderAreaDetails(areaId);
        }
    }

    if (window.innerWidth <= 1024) {
        closeSidebar();
    }
    lucide.createIcons();
}

function navigateTo(route, updateHash = true) {
    if (updateHash) window.location.hash = route;

    // Hide all views
    document.getElementById('landing-view').classList.remove('active');
    document.querySelectorAll('.app-wrapper').forEach(el => el.classList.remove('active'));

    // Close user dropdown if open
    document.getElementById('user-dropdown').classList.remove('show');

    // Check Permissions before showing
    const userData = window.currentUserData || {};
    const perms = userData.permissions || {};
    const isAdmin = userData.isAdmin;

    if (route === 'portal') {
        document.getElementById('landing-view').classList.add('active');
        renderPortalCards(userData);
    } else if (route === 'smart-campus') {
        if (isAdmin || perms.smart_campus?.view || perms.smart_campus === true) {
            document.getElementById('smart-campus-app').classList.add('active');
            window.smartCampus.subscribe();
        } else {
            alert('Access Denied');
            window.location.hash = 'portal';
        }
    } else if (route === 'admin') {
        if (isAdmin) {
            document.getElementById('admin-app').classList.add('active');
            window.smartCampus.subscribe(); // Ensure data is available
            window.smartCampus.currentView = 'admin';
            window.adminPanel.render();
            window.adminPanel.renderUserManagement();
        } else {
            alert('Access Denied');
            window.location.hash = 'portal';
        }
    } else if (route === 'students') {
        if (isAdmin || perms.student_directory?.view || perms.student_directory === true) {
            document.getElementById('student-app').classList.add('active');
        } else {
            alert('Access Denied');
            window.location.hash = 'portal';
        }
    } else if (route === 'staff') {
        if (isAdmin || perms.staff_directory?.view || perms.staff_directory === true) {
            document.getElementById('staff-app').classList.add('active');
            window.staffDirectory.subscribe();
            window.staffDirectory.render();
        } else {
            alert('Access Denied');
            window.location.hash = 'portal';
        }
    } else if (route === 'whatsapp') {
        if (isAdmin || perms.whatsapp_sender?.access || perms.whatsapp_sender === true) {
            document.getElementById('whatsapp-app').classList.add('active');
            if (window.whatsAppSender) {
                window.whatsAppSender.initialize();
                window.whatsAppSender.render();
            }
        } else {
            alert('Access Denied');
            window.location.hash = 'portal';
        }
    }
    if (window.innerWidth <= 1024) {
        closeSidebar();
    }
}

function renderPortalCards(userData) {
    const perms = userData.permissions || {};
    const isAdmin = userData.isAdmin;

    const scCard = document.getElementById('card-smart-campus');
    if (isAdmin || perms.smart_campus?.view || perms.smart_campus === true) scCard.classList.remove('disabled');
    else scCard.classList.add('disabled');

    const stCard = document.getElementById('card-students');
    if (isAdmin || perms.student_directory?.view || perms.student_directory === true) stCard.classList.remove('disabled');
    else stCard.classList.add('disabled');

    const staffCard = document.getElementById('card-staff');
    if (isAdmin || perms.staff_directory?.view || perms.staff_directory === true) staffCard.classList.remove('disabled');
    else staffCard.classList.add('disabled');

    const adminCard = document.getElementById('card-admin');
    if (isAdmin) adminCard.classList.remove('disabled');
    else adminCard.classList.add('disabled');

    const whatsappCard = document.getElementById('card-whatsapp');
    if (isAdmin || perms.whatsapp_sender?.access || perms.whatsapp_sender === true) whatsappCard.classList.remove('disabled');
    else whatsappCard.classList.add('disabled');
}

window.toggleUserDropdown = () => {
    document.getElementById('user-dropdown').classList.toggle('show');
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const widget = document.getElementById('user-widget');
    if (widget && !widget.contains(e.target)) {
        document.getElementById('user-dropdown').classList.remove('show');
    }
});


