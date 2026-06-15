import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions } from '../firebase';
import { MessageCircle, CheckCircle, AlertCircle, RefreshCw, Trash2, Wallet, Save } from 'lucide-react';

export default function AdminWhatsAppConfig() {
  const [config, setConfig] = useState({
    apiKey: '',
    wabaId: '',
    phoneNumberId: '',
    phoneNumber: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [walletBalance, setWalletBalance] = useState('--');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadConfig() {
      try {
        setLoading(true);
        const snap = await getDoc(doc(firestore, 'configs', 'whatsapp_main'));
        if (snap.exists()) {
          const data = snap.data();
          setConfig(data);
          
          if (data.apiKey) {
            checkWallet();
          }
        }
      } catch (err) {
        console.warn('Failed to load WhatsApp config', err);
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  const checkWallet = async () => {
    try {
      setWalletBalance('Syncing...');
      const checkWalletFn = httpsCallable(functions, 'checkWhatsAppWallet');
      const res = await checkWalletFn();
      setWalletBalance(res.data?.wallet !== undefined ? `₹${res.data.wallet}` : 'Error');
    } catch (e) {
      console.warn("Wallet check error:", e);
      setWalletBalance('Error');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await setDoc(doc(firestore, 'configs', 'whatsapp_main'), config, { merge: true });
      setMessage('Credentials saved successfully');
      checkWallet();
    } catch (err) {
      setMessage('Failed to save credentials: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncTemplates = async () => {
    setSyncing(true);
    setMessage('');
    try {
      const syncFn = httpsCallable(functions, 'syncWhatsAppTemplates');
      const res = await syncFn();
      setMessage(`Templates synced. Total: ${res.data?.count || 0}`);
    } catch (err) {
      setMessage('Failed to sync templates: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm("Clear all WhatsApp debug logs?")) return;
    try {
      const clearFn = httpsCallable(functions, 'clearWhatsAppLogs');
      await clearFn();
      setMessage("Logs cleared.");
    } catch (err) {
      setMessage("Failed to clear logs: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  const isConnected = !!(config.apiKey && config.wabaId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {message && (
        <div className="p-4 rounded-md bg-brand-primary/10 text-brand-primary font-medium text-sm border border-brand-primary/20">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Card */}
        <div className="bg-brand-card border border-brand-card-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                {isConnected ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                <span>{isConnected ? 'Connected' : 'Setup Required'}</span>
              </div>
              <h2 className="font-bold text-brand-text text-lg m-0">API Status</h2>
            </div>
            <p className="text-brand-text-dim text-sm mb-6">
              {isConnected ? 'WhatsApp Business API via Fast2SMS is active.' : 'Configure your Fast2SMS credentials to enable bulk messaging.'}
            </p>
          </div>

          {isConnected && (
            <div className="space-y-3">
              <button 
                onClick={handleSyncTemplates}
                disabled={syncing}
                className="w-full flex items-center justify-center gap-2 bg-brand-bg hover:bg-black/5 dark:hover:bg-white/5 border border-brand-card-border text-brand-text px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
                {syncing ? 'Syncing...' : 'Sync Message Templates'}
              </button>
              <button 
                onClick={handleClearLogs}
                className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/20 text-red-500 border border-red-100 dark:border-red-900/30 px-4 py-2 rounded-md font-medium text-sm transition-colors"
              >
                <Trash2 size={16} />
                Clear Debug Logs
              </button>
            </div>
          )}
        </div>

        {/* Wallet Balance Card */}
        <div className="bg-brand-card border border-brand-card-border rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-secondary/10 text-brand-secondary font-bold text-xs mb-4">
            <Wallet size={14} />
            <span>Wallet Balance</span>
          </div>
          <div className="text-4xl font-black text-brand-text mb-2">
            {walletBalance}
          </div>
          <div className="text-sm text-brand-text-dim font-medium">Fast2SMS Credits</div>
        </div>
      </div>

      {/* Credentials Form */}
      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-8">
        <h3 className="font-semibold text-brand-text text-lg mb-6 border-b border-brand-card-border pb-4">API Credentials</h3>
        
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-brand-text">Fast2SMS API Key</label>
            <input 
              type="password" 
              value={config.apiKey}
              onChange={e => setConfig({...config, apiKey: e.target.value})}
              placeholder="Enter API Key"
              className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-brand-text">WABA ID (WhatsApp Business Account)</label>
            <input 
              type="text" 
              value={config.wabaId}
              onChange={e => setConfig({...config, wabaId: e.target.value})}
              placeholder="Enter WABA ID"
              className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-brand-text">Phone Number ID</label>
            <input 
              type="text" 
              value={config.phoneNumberId}
              onChange={e => setConfig({...config, phoneNumberId: e.target.value})}
              placeholder="Enter Phone Number ID"
              className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-brand-text">Display Phone Number</label>
            <input 
              type="text" 
              value={config.phoneNumber}
              onChange={e => setConfig({...config, phoneNumber: e.target.value})}
              placeholder="+91 99999 99999"
              className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text"
            />
          </div>

          <button 
            type="submit" 
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-6 py-3 rounded-md font-bold text-sm transition-colors shadow-sm disabled:opacity-50 mt-4"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Credentials'}
          </button>
        </form>
      </div>
    </div>
  );
}
