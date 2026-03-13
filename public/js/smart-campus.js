// Smart Campus Module - Entities, Areas, and Device Control

window.smartCampus = {
    areas: {},
    currentView: 'overview',
    activeAreaId: null,
    pendingStates: {},
    areasListener: null,

    subscribe() {
        if (this.areasListener) return;

        this.areasListener = db.ref('modules/smart_campus/areas').on('value', snap => {
            const newAreas = snap.val() || {};

            // Check and clear pending states
            Object.keys(this.pendingStates).forEach(entityId => {
                let foundState = null;
                Object.values(newAreas).forEach(area => {
                    if (area.devices) {
                        Object.values(area.devices).forEach(device => {
                            if (device.entity_id === entityId) {
                                foundState = device.state;
                            }
                        });
                    }
                });

                if (foundState === this.pendingStates[entityId]?.state) {
                    delete this.pendingStates[entityId];
                }
            });

            // Preserve 'hidden' property from existing devices
            Object.keys(newAreas).forEach(areaId => {
                if (newAreas[areaId].devices && this.areas[areaId]?.devices) {
                    Object.keys(newAreas[areaId].devices).forEach(deviceKey => {
                        if (this.areas[areaId].devices[deviceKey]?.hidden) {
                            newAreas[areaId].devices[deviceKey].hidden = true;
                        }
                    });
                }
            });

            this.areas = newAreas;
            if (this.currentView === 'admin') window.adminPanel.render();
            if (this.currentView === 'room' && this.activeAreaId) this.renderAreaDetails(this.activeAreaId);
            this.renderDashboard();
        }, error => {
            console.error("DB Error:", error);
        });
    },

    renderDashboard() {
        const nav = document.getElementById('sidebar-nav');
        const roomsGrid = document.getElementById('rooms-grid');

        const validAreaIds = Object.keys(this.areas).filter(id => id !== 'no_area' && this.areas[id].devices);
        const sortedAreaIds = validAreaIds.sort((a, b) => (this.areas[a].name || a).localeCompare(this.areas[b].name || b));

        // 1. Sidebar Areas
        const backToPortalItem = nav.querySelector('div[onclick*="portal"]');
        const overviewItem = nav.querySelector('div[onclick*="overview"]');
        const adminSideItem = document.getElementById('nav-item-admin');
        nav.innerHTML = '';
        if (backToPortalItem) nav.appendChild(backToPortalItem);
        if (overviewItem) nav.appendChild(overviewItem);
        if (adminSideItem) {
            nav.appendChild(adminSideItem);
            const userData = window.currentUserData || {};
            if (userData.isAdmin) adminSideItem.style.display = 'flex';
        }

        sortedAreaIds.forEach(id => {
            const area = this.areas[id];
            const areaName = formatName(area.name || id);
            const item = document.createElement('div');
            item.className = `nav-item ${this.activeAreaId === id ? 'active' : ''}`;
            item.dataset.areaId = id;
            item.onclick = () => switchView('room', id);
            item.innerHTML = `
        <i data-lucide="${getAreaIcon(area.name || id)}"></i>
        <span>${areaName}</span>
      `;
            nav.appendChild(item);
        });

        // 2. Overview Stats
        let totalDevices = 0;
        let activeDevices = 0;
        sortedAreaIds.forEach(id => {
            Object.values(this.areas[id].devices).forEach(d => {
                if (!d.hidden) {
                    totalDevices++;
                    if (d.state === 'on') activeDevices++;
                }
            });
        });

        document.getElementById('active-rooms-count').innerText = sortedAreaIds.length;
        document.getElementById('total-entities-count').innerText = totalDevices;
        document.getElementById('active-entities-count').innerText = activeDevices;

        // 3. Overview Grid
        roomsGrid.innerHTML = '';
        sortedAreaIds.forEach(id => {
            const area = this.areas[id];
            const areaName = formatName(area.name || id);
            const visibleDevices = Object.values(area.devices || {}).filter(d => !d.hidden);
            const deviceCount = visibleDevices.length;

            const card = document.createElement('div');
            card.className = 'card';
            card.onclick = () => switchView('room', id);
            card.innerHTML = `
        <div class="card-header">
          <div class="card-icon">
            <i data-lucide="${getAreaIcon(area.name || id)}"></i>
          </div>
          <i data-lucide="chevron-right" style="color: var(--text-dim); width: 20px;"></i>
        </div>
        <div class="card-info">
          <h2>${areaName}</h2>
          <div class="card-stats">${deviceCount} Devices</div>
        </div>
      `;
            roomsGrid.appendChild(card);
        });

        // 4. Update Detail View if active
        if (this.currentView === 'room' && this.activeAreaId) {
            this.renderAreaDetails(this.activeAreaId);
        }

        lucide.createIcons();

        const loader = document.getElementById('loader');
        if (loader) loader.classList.add('hidden');
    },

    renderAreaDetails(areaId) {
        const area = this.areas[areaId];
        const container = document.getElementById('room-content');
        container.innerHTML = '';

        if (!area || !area.devices) return;

        // Permission check for control actions
        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const scPerms = userData.permissions?.smart_campus || {};
        const canControl = isAdmin || scPerms === true || scPerms.control;

        const devices = Object.keys(area.devices)
            .map(id => ({ id, ...area.devices[id] }))
            .filter(d => !d.hidden);

        const grouped = {
            fan: [],
            switch: [],
            light: [],
            sensor: [],
            binary_sensor: [],
            other: []
        };

        devices.forEach(d => {
            const groupKey = grouped[d.domain] ? d.domain : 'other';
            grouped[groupKey].push(d);
        });

        ['fan', 'switch', 'light', 'sensor', 'binary_sensor', 'other'].forEach(key => {
            const groupItems = grouped[key];
            if (groupItems.length === 0) return;

            const config = DOMAIN_GROUPS[key] || DOMAIN_GROUPS['other'];

            const header = document.createElement('div');
            header.className = 'group-header';
            header.innerHTML = `
        <i data-lucide="${config.icon}" style="width: 20px; height: 20px"></i>
        <span>${config.label}</span>
      `;
            container.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'room-entities-group';
            grid.innerHTML = groupItems.sort((a, b) => a.name.localeCompare(b.name)).map(device => {
                const { id, domain, name, entity_id, state } = device;
                const icon = iconMap[domain] || 'box';
                const isOn = state === 'on';
                const isUnavailable = state === 'unavailable' || state === 'unknown';
                const isPending = this.pendingStates[entity_id] !== undefined;
                const displayName = formatName(name);

                if (domain === 'sensor' || domain === 'binary_sensor') {
                    return `
            <div class="entity sensor-card ${isUnavailable ? 'unavailable' : ''}">
              <div style="display:flex; align-items:center; gap:16px;">
                <i data-lucide="${icon}"></i>
                <span class="entity-name">${displayName}</span>
              </div>
              <div class="sensor-value">${isUnavailable ? 'OFFLINE' : (state || '--')}</div>
            </div>
          `;
                }

                if (domain === 'fan') {
                    const percentage = device.attributes?.percentage || 0;
                    const level = SPEED_LEVELS.reduce((prev, curr, idx) => {
                        return (Math.abs(curr - percentage) < Math.abs(SPEED_LEVELS[prev] - percentage) ? idx : prev);
                    }, 0);

                    return `
            <div id="${id}" class="entity ${isOn ? 'on' : ''} ${isUnavailable ? 'unavailable' : ''} ${isPending ? 'loading' : ''} ${!canControl ? 'view-only' : ''}" ${canControl ? `onclick="toggleDevice('${id}', '${entity_id}', '${domain}', '${state}')"` : ''}>
              <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                <i data-lucide="${icon}"></i>
                <span class="entity-name">${displayName}</span>
              </div>
              <div class="speed-control" onclick="event.stopPropagation()">
                <div class="speed-header">
                  <span>Speed</span>
                  <span class="speed-val">${level === 0 ? 'Off' : 'Level ' + level}</span>
                </div>
                <input type="range" class="speed-slider" min="0" max="6" value="${level}" 
                       oninput="updateFanSpeedUI(this)" 
                       onchange="setFanSpeed('${id}', '${entity_id}', this.value)"
                       ${isUnavailable || !canControl ? 'disabled' : ''}>
              </div>
            </div>
          `;
                }

                return `
          <div id="${id}" class="entity ${isOn ? 'on' : ''} ${isUnavailable ? 'unavailable' : ''} ${isPending ? 'loading' : ''} ${!canControl ? 'view-only' : ''}" ${canControl ? `onclick="toggleDevice('${id}', '${entity_id}', '${domain}', '${state}')"` : ''}>
            <i data-lucide="${icon}"></i>
            <span class="entity-name">${displayName}</span>
          </div>
        `;
            }).join('');
            container.appendChild(grid);
        });

        lucide.createIcons();
    }
};

// Device Control Functions
window.toggleDevice = (underscoredId, dotEntityId, domain, currentState) => {
    const userData = window.currentUserData || {};
    const isAdmin = userData.isAdmin;
    const perms = userData.permissions?.smart_campus || {};
    const canControl = isAdmin || perms === true || perms.control;

    if (!canControl) {
        AppDialog.toast('Access Denied: You do not have permission to control devices.', 'error');
        return;
    }

    const service = currentState === 'on' ? 'turn_off' : 'turn_on';
    const targetState = currentState === 'on' ? 'off' : 'on';

    const cmdRef = db.ref('modules/smart_campus/commands').push();
    const cmdKey = cmdRef.key;

    cmdRef.set({ entity_id: dotEntityId, domain, service });

    window.smartCampus.pendingStates[dotEntityId] = {
        state: targetState,
        cmdKey: cmdKey,
        timestamp: Date.now()
    };
    window.smartCampus.renderAreaDetails(window.smartCampus.activeAreaId);

    setTimeout(() => {
        if (window.smartCampus.pendingStates[dotEntityId]?.cmdKey === cmdKey) {
            console.warn(`Command timed out for ${dotEntityId}. Removing from queue.`);
            db.ref('modules/smart_campus/commands/' + cmdKey).remove();
            delete window.smartCampus.pendingStates[dotEntityId];
            window.smartCampus.renderAreaDetails(window.smartCampus.activeAreaId);
        }
    }, 5000);
};

window.updateFanSpeedUI = (slider) => {
    const valSpan = slider.previousElementSibling.querySelector('.speed-val');
    const level = parseInt(slider.value);
    valSpan.innerText = level === 0 ? "Off" : `Level ${level}`;
};

window.setFanSpeed = (underscoredId, dotEntityId, level) => {
    const userData = window.currentUserData || {};
    const isAdmin = userData.isAdmin;
    const perms = userData.permissions?.smart_campus || {};
    const canControl = isAdmin || perms === true || perms.control;

    if (!canControl) {
        AppDialog.toast('Access Denied: You do not have permission to control fans.', 'error');
        return;
    }

    const idx = parseInt(level);
    const percentage = SPEED_LEVELS[idx];
    const service = level == 0 ? 'turn_off' : 'set_percentage';

    const payload = { entity_id: dotEntityId, domain: 'fan', service };
    if (service === 'set_percentage') {
        payload.data = { percentage };
    }

    const cmdRef = db.ref('modules/smart_campus/commands').push();
    const cmdKey = cmdRef.key;
    cmdRef.set(payload);

    window.smartCampus.pendingStates[dotEntityId] = {
        state: level == 0 ? 'off' : 'on',
        cmdKey: cmdKey,
        timestamp: Date.now()
    };
    window.smartCampus.renderAreaDetails(window.smartCampus.activeAreaId);

    setTimeout(() => {
        if (window.smartCampus.pendingStates[dotEntityId]?.cmdKey === cmdKey) {
            console.warn(`Fan command timed out for ${dotEntityId}. Removing.`);
            db.ref('modules/smart_campus/commands/' + cmdKey).remove();
            delete window.smartCampus.pendingStates[dotEntityId];
            window.smartCampus.renderAreaDetails(window.smartCampus.activeAreaId);
        }
    }, 5000);
};
