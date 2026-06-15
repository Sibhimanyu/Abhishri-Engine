import React, { useState, useEffect } from 'react';
import { ref, onValue, push, set, remove } from 'firebase/database';
import { rtdb } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Server, Zap, Cpu, Activity, Play, ChevronRight, Wind, Power, AlertTriangle, Fan } from 'lucide-react';

// --- Room Control Sub-Component ---
function RoomControl({ areaId, areaData, onBack, canControl, pendingStates, setPendingStates }) {
  const devices = Object.keys(areaData.devices || {})
    .map(id => ({ id, ...areaData.devices[id] }))
    .filter(d => !d.hidden)
    .sort((a, b) => a.name.localeCompare(b.name));

  const toggleDevice = (entityId, domain, currentState) => {
    if (!canControl) return;
    const targetState = currentState === 'on' ? 'off' : 'on';
    const service = currentState === 'on' ? 'turn_off' : 'turn_on';
    
    // Optimistic UI
    const tempKey = `cmd_${Date.now()}`;
    setPendingStates(prev => ({ ...prev, [entityId]: { state: targetState, cmdKey: tempKey } }));
    
    // Push Command to RTDB
    const cmdRef = push(ref(rtdb, 'modules/smart_campus/commands'));
    set(cmdRef, { entity_id: entityId, domain, service });
    
    // Timeout fallback (clears loading state after 5s)
    setTimeout(() => {
      setPendingStates(prev => {
        if (prev[entityId]?.cmdKey === tempKey) {
          const newState = { ...prev };
          delete newState[entityId];
          return newState;
        }
        return prev;
      });
    }, 5000);
  };

  const setFanSpeed = (entityId, percentage) => {
    if (!canControl) return;
    const service = percentage === 0 ? 'turn_off' : 'set_percentage';
    
    const tempKey = `cmd_fan_${Date.now()}`;
    setPendingStates(prev => ({ ...prev, [entityId]: { state: percentage === 0 ? 'off' : 'on', cmdKey: tempKey } }));
    
    const payload = { entity_id: entityId, domain: 'fan', service };
    if (service === 'set_percentage') payload.data = { percentage };
    
    const cmdRef = push(ref(rtdb, 'modules/smart_campus/commands'));
    set(cmdRef, payload);
    
    setTimeout(() => {
      setPendingStates(prev => {
        if (prev[entityId]?.cmdKey === tempKey) {
          const newState = { ...prev };
          delete newState[entityId];
          return newState;
        }
        return prev;
      });
    }, 5000);
  };

  const grouped = { fan: [], switch: [], light: [], sensor: [], other: [] };
  devices.forEach(d => {
    const key = grouped[d.domain] ? d.domain : 'other';
    grouped[key].push(d);
  });

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-brand-text-dim hover:text-brand-text font-medium bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-lg text-sm">
          ← Back to Campus
        </button>
        <h2 className="text-2xl font-bold text-brand-text">{areaData.name || 'Room Control'}</h2>
      </div>

      <div className="space-y-8">
        {Object.entries(grouped).map(([domain, items]) => {
          if (items.length === 0) return null;
          
          return (
            <div key={domain}>
              <h3 className="text-sm font-bold text-brand-text-dim uppercase tracking-wider mb-4 border-b border-brand-card-border pb-2 flex items-center gap-2">
                {domain === 'fan' && <Fan size={16} />}
                {domain === 'switch' && <Power size={16} />}
                {domain === 'light' && <Zap size={16} />}
                {domain === 'sensor' && <Activity size={16} />}
                {domain}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map(device => {
                  const { id, name, entity_id, state } = device;
                  const isPending = !!pendingStates[entity_id];
                  const displayState = isPending ? pendingStates[entity_id].state : state;
                  const isOn = displayState === 'on';
                  const isUnavailable = displayState === 'unavailable';

                  if (domain === 'sensor' || domain === 'binary_sensor') {
                    return (
                      <div key={id} className="bg-brand-card border border-brand-card-border p-5 rounded-xl shadow-sm flex justify-between items-center opacity-80">
                        <div className="flex items-center gap-3">
                          <Activity size={20} className="text-blue-500" />
                          <span className="font-medium text-brand-text">{name}</span>
                        </div>
                        <span className="font-bold text-brand-primary font-mono bg-brand-primary/10 px-2 py-1 rounded">{isUnavailable ? 'OFFLINE' : displayState}</span>
                      </div>
                    );
                  }

                  if (domain === 'fan') {
                    const pct = device.attributes?.percentage || 0;
                    // Simplify: Snap to standard levels 0, 20, 40, 60, 80, 100
                    const levels = [0, 20, 40, 60, 80, 100];
                    const currentIdx = levels.reduce((prev, curr, idx) => (Math.abs(curr - pct) < Math.abs(levels[prev] - pct) ? idx : prev), 0);
                    
                    return (
                      <div key={id} className={`border p-5 rounded-xl transition-all ${isOn ? 'bg-brand-secondary/10 border-brand-secondary/30' : 'bg-brand-card border-brand-card-border'} ${isPending ? 'opacity-50 animate-pulse' : ''}`}>
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-3">
                            <Fan size={20} className={isOn ? 'text-brand-secondary animate-spin-slow' : 'text-brand-text-dim'} />
                            <span className="font-medium text-brand-text">{name}</span>
                          </div>
                          <button onClick={() => toggleDevice(entity_id, domain, state)} disabled={!canControl || isUnavailable} className={`w-12 h-6 rounded-full relative transition-colors ${isOn ? 'bg-brand-secondary' : 'bg-brand-card-border'} ${!canControl ? 'cursor-not-allowed opacity-50' : ''}`}>
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isOn ? 'left-7' : 'left-1'}`}></div>
                          </button>
                        </div>
                        {/* Horizontal Slider */}
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-brand-text-dim mb-1 font-mono">
                            <span>Off</span><span>Speed {currentIdx}</span>
                          </div>
                          <input 
                            type="range" min="0" max="5" value={currentIdx} 
                            disabled={!canControl || isUnavailable}
                            onChange={(e) => setFanSpeed(entity_id, levels[parseInt(e.target.value)])}
                            className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${isOn ? 'bg-brand-secondary/30' : 'bg-black/10 dark:bg-white/10'}`}
                          />
                        </div>
                      </div>
                    );
                  }

                  // Default Switch / Light
                  return (
                    <div key={id} className={`border p-5 rounded-xl transition-all flex justify-between items-center ${isOn ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-brand-card border-brand-card-border'} ${isPending ? 'opacity-50 animate-pulse' : ''}`}>
                      <div className="flex items-center gap-3">
                        {domain === 'light' ? <Zap size={20} className={isOn ? 'text-yellow-500' : 'text-brand-text-dim'} /> : <Power size={20} className={isOn ? 'text-green-500' : 'text-brand-text-dim'} />}
                        <span className="font-medium text-brand-text">{name}</span>
                      </div>
                      <button onClick={() => toggleDevice(entity_id, domain, state)} disabled={!canControl || isUnavailable} className={`w-12 h-6 rounded-full relative transition-colors ${isOn ? (domain === 'light' ? 'bg-yellow-500' : 'bg-green-500') : 'bg-brand-card-border'} ${!canControl ? 'cursor-not-allowed opacity-50' : ''}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isOn ? 'left-7' : 'left-1'}`}></div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main Smart Campus Component ---
export default function SmartCampus() {
  const { userData } = useAuth();
  const [areas, setAreas] = useState({});
  const [scenes, setScenes] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeAreaId, setActiveAreaId] = useState(null);
  const [pendingStates, setPendingStates] = useState({});

  const isAdmin = userData?.isAdmin;
  const scPerms = userData?.permissions?.smart_campus || {};
  const canView = isAdmin || scPerms === true || scPerms.view || scPerms.control;
  const canControl = isAdmin || scPerms === true || scPerms.control;
  const canTriggerScenes = isAdmin || scPerms === true || scPerms.scenes || scPerms.control;

  useEffect(() => {
    if (!canView && !canTriggerScenes) {
      setLoading(false);
      return;
    }

    let unsubAreas, unsubScenes;

    if (canView) {
      const areasRef = ref(rtdb, 'modules/smart_campus/areas');
      unsubAreas = onValue(areasRef, (snap) => {
        const data = snap.val() || {};
        
        // Resolve pending states if they match incoming RTDB state
        setPendingStates(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(entityId => {
            let foundState = null;
            Object.values(data).forEach(area => {
              if (area.devices) {
                Object.values(area.devices).forEach(device => {
                  if (device.entity_id === entityId) foundState = device.state;
                });
              }
            });
            if (foundState === next[entityId].state) delete next[entityId];
          });
          return next;
        });

        setAreas(data);
        setLoading(false);
      }, (error) => {
        console.error("RTDB Error (SmartCampus Areas):", error);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    if (canTriggerScenes) {
      const scenesRef = ref(rtdb, 'modules/smart_campus/scenes');
      unsubScenes = onValue(scenesRef, (snap) => {
        setScenes(snap.val() || {});
      });
    }

    return () => {
      if (unsubAreas) unsubAreas();
      if (unsubScenes) unsubScenes();
    };
  }, [canView, canTriggerScenes]);

  const triggerScene = (sceneId, scene) => {
    if (!canTriggerScenes || !scene.devices) return;
    
    Object.keys(scene.devices).forEach(escapedEntityId => {
      const target = scene.devices[escapedEntityId];
      const entityId = escapedEntityId.replace(/:/g, '.');
      const domain = entityId.split('.')[0];
      
      const service = target.state === 'on' ? (domain === 'fan' && target.percentage !== undefined ? 'set_percentage' : 'turn_on') : 'turn_off';
      const payload = { entity_id: entityId, domain, service };
      if (service === 'set_percentage') payload.data = { percentage: target.percentage };

      const cmdRef = push(ref(rtdb, 'modules/smart_campus/commands'));
      set(cmdRef, payload);
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  if (!canView && !canTriggerScenes) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-8 rounded-xl text-center">
        <AlertTriangle className="text-red-500 mb-4 mx-auto" size={48} />
        <h3 className="text-xl font-bold text-brand-text mb-2">IoT Access Denied</h3>
        <p className="text-brand-text-dim">You do not have permission to access Smart Campus telemetry.</p>
      </div>
    );
  }

  // Render Sub-View
  if (activeAreaId && areas[activeAreaId]) {
    return <RoomControl 
             areaId={activeAreaId} 
             areaData={areas[activeAreaId]} 
             onBack={() => setActiveAreaId(null)} 
             canControl={canControl} 
             pendingStates={pendingStates}
             setPendingStates={setPendingStates}
           />;
  }

  const validAreaIds = Object.keys(areas).filter(id => id !== 'no_area' && areas[id].devices);
  validAreaIds.sort((a, b) => (areas[a].name || a).localeCompare(areas[b].name || b));

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Scenes Section */}
      {canTriggerScenes && Object.keys(scenes).length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-brand-text mb-4 flex items-center gap-2">
            <Zap className="text-yellow-500" size={24} /> Smart Scenes
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Object.entries(scenes).map(([id, scene]) => (
              <div 
                key={id} onClick={() => triggerScene(id, scene)}
                className="bg-brand-card border border-brand-card-border p-4 rounded-xl shadow-sm hover:border-yellow-500/50 hover:bg-yellow-500/5 cursor-pointer transition-all text-center group"
              >
                <div className="w-12 h-12 mx-auto bg-yellow-500/10 text-yellow-500 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Play size={20} className="ml-1" />
                </div>
                <h4 className="font-bold text-brand-text text-sm">{scene.name}</h4>
                <p className="text-brand-text-dim text-xs mt-1">{Object.keys(scene.devices || {}).length} Actions</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Areas Section */}
      {canView && (
        <section>
          <h2 className="text-xl font-bold text-brand-text mb-4 flex items-center gap-2">
            <Server className="text-brand-secondary" size={24} /> Campus Areas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {validAreaIds.length === 0 ? (
              <div className="col-span-full py-8 text-center text-brand-text-dim border border-dashed border-brand-card-border rounded-xl">No IoT areas configured.</div>
            ) : (
              validAreaIds.map(id => {
                const area = areas[id];
                const deviceCount = Object.values(area.devices || {}).filter(d => !d.hidden).length;
                const activeCount = Object.values(area.devices || {}).filter(d => !d.hidden && d.state === 'on').length;

                return (
                  <div 
                    key={id} onClick={() => setActiveAreaId(id)}
                    className="bg-brand-card border border-brand-card-border p-5 rounded-xl shadow-sm hover:border-brand-primary/50 hover:shadow-md cursor-pointer transition-all group"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-10 h-10 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                        <Cpu size={20} />
                      </div>
                      <ChevronRight size={20} className="text-brand-text-dim group-hover:text-brand-primary transition-colors" />
                    </div>
                    <h3 className="font-bold text-lg text-brand-text mb-1">{area.name || id}</h3>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-brand-text-dim">{deviceCount} Devices</span>
                      {activeCount > 0 && (
                        <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> {activeCount} Active
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
