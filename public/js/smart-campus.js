// Smart Campus Module - Entities, Areas, and Device Control

window.smartCampus = {
    areas: {},
    scenes: {},
    currentView: 'overview',
    activeAreaId: null,
    pendingStates: {},
    areasListener: null,
    scenesListener: null,

    subscribe() {
        if (!this.areasListener) {
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
                console.error("DB Error (Areas):", error);
            });
        }

        if (!this.scenesListener) {
            this.scenesListener = db.ref('modules/smart_campus/scenes').on('value', snap => {
                this.scenes = snap.val() || {};
                if (this.currentView === 'scenes') this.renderScenes();
                if (this.currentView === 'admin' && window.adminPanel.currentAdminView === 'scenes') window.adminPanel.renderScenesConfig();
            }, error => {
                console.error("DB Error (Scenes):", error);
            });
        }
    },

    renderDashboard() {
        const nav = document.getElementById('sidebar-nav');
        const roomsGrid = document.getElementById('rooms-grid');

        const validAreaIds = Object.keys(this.areas).filter(id => id !== 'no_area' && this.areas[id].devices);
        const sortedAreaIds = validAreaIds.sort((a, b) => (this.areas[a].name || a).localeCompare(this.areas[b].name || b));

        // 1. Sidebar Areas
        const backToPortalItem = nav.querySelector('div[onclick*="portal"]');
        const overviewItem = nav.querySelector('div[onclick*="overview"]');
        const scenesItem = document.getElementById('nav-item-scenes');
        const adminSideItem = document.getElementById('nav-item-admin');
        nav.innerHTML = '';
        if (backToPortalItem) nav.appendChild(backToPortalItem);
        if (overviewItem) nav.appendChild(overviewItem);
        if (scenesItem) nav.appendChild(scenesItem);
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

    renderScenes() {
        const grid = document.getElementById('scenes-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const sceneIds = Object.keys(this.scenes).sort((a, b) => (this.scenes[a].name || '').localeCompare(this.scenes[b].name || ''));

        if (sceneIds.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);">
                    <i data-lucide="zap-off" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                    <p>No scenes configured yet.</p>
                </div>
            `;
            lucide.createIcons({ root: grid });
            return;
        }

        sceneIds.forEach(id => {
            const scene = this.scenes[id];
            const deviceCount = Object.keys(scene.devices || {}).length;
            const icon = scene.icon || 'zap';

            const card = document.createElement('div');
            card.className = 'card scene-card';
            card.onclick = () => this.triggerScene(id);
            card.innerHTML = `
                <div class="card-header">
                    <div class="card-icon" style="background: rgba(251, 191, 36, 0.1); color: #fbbf24;">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div class="trigger-hint">Activate <i data-lucide="play" style="width:12px; height:12px;"></i></div>
                </div>
                <div class="card-info">
                    <h2>${scene.name}</h2>
                    <div class="card-stats">${deviceCount} Actions</div>
                </div>
            `;
            grid.appendChild(card);
        });

        lucide.createIcons({ root: grid });
    },

    triggerScene(sceneId) {
        const scene = this.scenes[sceneId];
        if (!scene || !scene.devices) return;

        AppDialog.toast(`Activating scene: ${scene.name}`, 'info');

        Object.keys(scene.devices).forEach(entityId => {
            const target = scene.devices[entityId];
            const domain = entityId.split('.')[0];
            
            const service = target.state === 'on' ? (domain === 'fan' && target.percentage !== undefined ? 'set_percentage' : 'turn_on') : 'turn_off';
            
            const payload = { entity_id: entityId, domain, service };
            if (service === 'set_percentage') {
                payload.data = { percentage: target.percentage };
            }

            const cmdRef = db.ref('modules/smart_campus/commands').push();
            cmdRef.set(payload);

            // Set pending state
            this.pendingStates[entityId] = {
                state: target.state,
                cmdKey: cmdRef.key,
                timestamp: Date.now()
            };
        });

        if (this.currentView === 'room' && this.activeAreaId) {
            this.renderAreaDetails(this.activeAreaId);
        }
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
