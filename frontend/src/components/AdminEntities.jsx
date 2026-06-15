import React, { useState, useEffect } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { rtdb } from '../firebase';
import { LayoutGrid, EyeOff, Eye, Search, CheckSquare } from 'lucide-react';

export default function AdminEntities() {
  const [areas, setAreas] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dbRef = ref(rtdb, 'modules/smart_campus/areas');
    const unsubscribe = onValue(dbRef, (snap) => {
      setAreas(snap.val() || {});
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const toggleSelection = (uniqueId) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(uniqueId)) {
      newSelection.delete(uniqueId);
    } else {
      newSelection.add(uniqueId);
    }
    setSelectedItems(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredDevices.length && filteredDevices.length > 0) {
      setSelectedItems(new Set());
    } else {
      const newSelection = new Set(filteredDevices.map(d => d.uniqueId));
      setSelectedItems(newSelection);
    }
  };

  const updateVisibility = async (hide) => {
    if (selectedItems.size === 0) return;
    
    const updates = {};
    selectedItems.forEach(uniqueId => {
      const [areaId, devKey] = uniqueId.split('|||');
      updates[`modules/smart_campus/areas/${areaId}/devices/${devKey}/hidden`] = hide ? true : null;
    });

    try {
      await update(ref(rtdb), updates);
      setSelectedItems(new Set());
    } catch (err) {
      console.error("Failed to update visibility", err);
      alert("Failed to update visibility.");
    }
  };

  // Process data
  let allDevices = [];
  Object.keys(areas).forEach(areaId => {
    if (areaId === 'no_area' || !areas[areaId].devices) return;
    const areaName = areas[areaId].name || areaId;

    Object.keys(areas[areaId].devices).forEach(deviceId => {
      const device = areas[areaId].devices[deviceId];
      allDevices.push({ 
        areaId, 
        areaName, 
        deviceId, 
        uniqueId: `${areaId}|||${deviceId}`,
        ...device 
      });
    });
  });

  const filteredDevices = allDevices.filter(d => {
    const text = `${d.name} ${d.areaName} ${d.domain}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  }).sort((a, b) => a.areaName.localeCompare(b.areaName) || a.name.localeCompare(b.name));


  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
          <input 
            type="text" 
            placeholder="Search entities..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-64 bg-brand-bg border border-brand-card-border rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-brand-text"
          />
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <button 
            onClick={toggleSelectAll}
            className="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-md font-medium text-sm transition-colors whitespace-nowrap"
          >
            <CheckSquare size={16} /> 
            {selectedItems.size === filteredDevices.length && filteredDevices.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          <button 
            onClick={() => updateVisibility(true)}
            disabled={selectedItems.size === 0}
            className="flex items-center gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/20 text-red-500 px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <EyeOff size={16} /> Hide
          </button>
          <button 
            onClick={() => updateVisibility(false)}
            disabled={selectedItems.size === 0}
            className="flex items-center gap-2 bg-green-50 hover:bg-green-100 dark:bg-green-900/10 dark:hover:bg-green-900/20 text-green-600 dark:text-green-500 px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Eye size={16} /> Unhide
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredDevices.map(d => {
          const isSelected = selectedItems.has(d.uniqueId);
          const isHidden = !!d.hidden;
          
          return (
            <div 
              key={d.uniqueId} 
              onClick={() => toggleSelection(d.uniqueId)}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                isSelected 
                  ? 'bg-brand-primary/10 border-brand-primary/50' 
                  : isHidden 
                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30 opacity-70' 
                    : 'bg-brand-card border-brand-card-border hover:border-brand-primary/30'
              }`}
            >
              <div className="mt-1">
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-brand-primary border-brand-primary text-white' : 'border-brand-card-border'}`}>
                  {isSelected && <CheckSquare size={14} />}
                </div>
              </div>
              <div>
                <div className="font-bold text-brand-text leading-tight">{d.name} <span className="text-xs font-normal text-brand-text-dim">({d.domain})</span></div>
                <div className="text-sm text-brand-text-dim mt-1 flex items-center gap-1">
                  <LayoutGrid size={12} /> {d.areaName}
                </div>
                {isHidden && (
                  <div className="text-xs font-bold text-red-500 mt-2 uppercase tracking-wide">Hidden</div>
                )}
              </div>
            </div>
          );
        })}
        {filteredDevices.length === 0 && (
          <div className="col-span-full py-12 text-center text-brand-text-dim">
            No entities found matching your search.
          </div>
        )}
      </div>
    </div>
  );
}
