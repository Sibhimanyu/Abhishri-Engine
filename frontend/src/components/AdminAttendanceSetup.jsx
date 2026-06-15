import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions } from '../firebase';
import { MapPin, Crosshair, Save } from 'lucide-react';

export default function AdminAttendanceSetup() {
  const [config, setConfig] = useState({
    schoolLatitude: '',
    schoolLongitude: '',
    allowedRadiusMeters: 100,
    lateAfter: '',
    timezone: 'Asia/Kolkata'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadConfig() {
      try {
        const snap = await getDoc(doc(firestore, 'configs', 'attendance'));
        if (snap.exists()) {
          setConfig({ ...config, ...snap.data() });
        }
      } catch (err) {
        console.warn('Could not load attendance config:', err);
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    const payload = {
      schoolLatitude: parseFloat(config.schoolLatitude),
      schoolLongitude: parseFloat(config.schoolLongitude),
      allowedRadiusMeters: parseFloat(config.allowedRadiusMeters) || 100,
      lateAfter: config.lateAfter || null,
      timezone: config.timezone || 'Asia/Kolkata'
    };

    if (!Number.isFinite(payload.schoolLatitude) || !Number.isFinite(payload.schoolLongitude)) {
      setMessage('School coordinates are required and must be valid numbers.');
      setSaving(false);
      return;
    }

    try {
      const updateStaffAttendanceConfig = httpsCallable(functions, 'updateStaffAttendanceConfig');
      await updateStaffAttendanceConfig(payload);
      setMessage('Attendance settings saved successfully.');
    } catch (err) {
      setMessage('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const fillCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Location is not available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setConfig(prev => ({
          ...prev,
          schoolLatitude: pos.coords.latitude.toFixed(7),
          schoolLongitude: pos.coords.longitude.toFixed(7)
        }));
        setMessage('Filled from current location.');
      },
      (err) => {
        setMessage(err.message || 'Could not get location.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden p-8">
        <h3 className="font-semibold text-brand-text flex items-center gap-2 text-xl mb-2">
          <MapPin size={24} className="text-brand-primary" />
          School Attendance Setup
        </h3>
        <p className="text-brand-text-dim mb-8">
          Teachers can check in only when they are within the configured school location radius.
        </p>

        {message && (
          <div className="mb-6 p-4 rounded-md bg-brand-primary/10 text-brand-primary font-medium text-sm border border-brand-primary/20">
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-text">School Latitude</label>
              <input 
                type="number" 
                step="any"
                value={config.schoolLatitude}
                onChange={e => setConfig({...config, schoolLatitude: e.target.value})}
                placeholder="18.5204"
                className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-text">School Longitude</label>
              <input 
                type="number" 
                step="any"
                value={config.schoolLongitude}
                onChange={e => setConfig({...config, schoolLongitude: e.target.value})}
                placeholder="73.8567"
                className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-text">Late After</label>
              <input 
                type="time" 
                value={config.lateAfter}
                onChange={e => setConfig({...config, lateAfter: e.target.value})}
                className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-text">Timezone</label>
              <input 
                type="text" 
                value={config.timezone}
                onChange={e => setConfig({...config, timezone: e.target.value})}
                className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-brand-text">Allowed Radius (meters)</label>
            <input 
              type="number" 
              value={config.allowedRadiusMeters}
              onChange={e => setConfig({...config, allowedRadiusMeters: e.target.value})}
              className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text"
            />
          </div>

          <div className="flex flex-wrap gap-4 pt-4">
            <button 
              type="button" 
              onClick={fillCurrentLocation}
              className="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-md font-medium text-sm transition-colors border border-brand-card-border"
            >
              <Crosshair size={16} />
              Use This Device Location
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-6 py-2 rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
