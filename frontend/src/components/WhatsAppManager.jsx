import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Radio, Users, History, AlertCircle, FlaskConical } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import WhatsAppChats from './WhatsAppChats';
import WhatsAppBroadcast from './WhatsAppBroadcast';
import WhatsAppLists from './WhatsAppLists';
import WhatsAppHistory from './WhatsAppHistory';
import { CHANNELS, channelPerms } from '../utils/messagingChannels';

import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';

// Communications: WhatsApp at /whatsapp/*, Arattai at /whatsapp/arattai/*. Both use the
// same four screens, pointed at their own channel.
export default function WhatsAppManager() {
  const { userData } = useAuth();
  const wa = channelPerms(CHANNELS.whatsapp, userData);
  const ar = channelPerms(CHANNELS.arattai, userData);

  if (!wa.any && !ar.any) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-brand-card rounded-2xl border border-brand-card-border shadow-sm">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim">You do not have permission to access the Communications module.</p>
      </div>
    );
  }

  const available = [wa.any && CHANNELS.whatsapp, ar.any && CHANNELS.arattai].filter(Boolean);

  return (
    <Routes>
      <Route
        path="arattai/*"
        element={ar.any ? <ChannelView channel={CHANNELS.arattai} perms={ar} available={available} /> : <Navigate to="/whatsapp" replace />}
      />
      <Route
        path="*"
        element={wa.any ? <ChannelView channel={CHANNELS.whatsapp} perms={wa} available={available} /> : <Navigate to={CHANNELS.arattai.basePath} replace />}
      />
    </Routes>
  );
}

function ChannelView({ channel, perms, available }) {
  const location = useLocation();
  const last = location.pathname.split('/').filter(Boolean).pop();
  const activeView = ['chats', 'broadcast', 'lists', 'history'].includes(last) ? last : 'chats';

  const tabs = [
    { id: 'chats', label: 'Live Chats', icon: MessageSquare, show: perms.access },
    { id: 'broadcast', label: 'Broadcast', icon: Radio, show: perms.broadcast },
    { id: 'lists', label: 'Audience Lists', icon: Users, show: perms.manage },
    { id: 'history', label: 'History', icon: History, show: perms.manage }
  ];

  return (
    <div className="h-full flex flex-col -mx-4 md:-mx-8 bg-brand-bg relative">
      {/* Module Navigation */}
      <div className="flex items-center scroll-tabs edge-fade border-b border-brand-card-border bg-brand-sidebar px-2 sm:px-6 sticky top-0 z-10 shrink-0">
        {available.length > 1 && (
          <div className="flex shrink-0 bg-brand-bg rounded-lg p-0.5 border border-brand-card-border mr-2 sm:mr-4" role="tablist" aria-label="Channel">
            {available.map(c => (
              <Link
                key={c.id}
                to={c.basePath}
                role="tab"
                aria-selected={c.id === channel.id}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${c.id === channel.id ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-text-dim hover:text-brand-text'}`}
              >
                {c.label}
              </Link>
            ))}
          </div>
        )}
        {tabs.filter(t => t.show).map(tab => (
          <Link
            key={tab.id}
            to={`${channel.basePath}/${tab.id}`}
            className={`flex items-center gap-2 px-3 sm:px-4 py-3.5 sm:py-4 font-medium text-sm transition-colors border-b-2 ${
              activeView === tab.id
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-brand-text-dim hover:text-brand-text hover:border-brand-card-border'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </Link>
        ))}
      </div>

      {channel.id === 'arattai' && <ArattaiModeBanner />}

      {/* Sub-Views Container */}
      <div className="flex-1 overflow-hidden relative">
        <Routes>
          <Route path="/" element={<Navigate to="chats" replace />} />
          <Route path="chats" element={<WhatsAppChats key={channel.id} channel={channel} />} />
          <Route path="broadcast" element={<WhatsAppBroadcast key={channel.id} channel={channel} />} />
          <Route path="lists" element={<WhatsAppLists key={channel.id} channel={channel} />} />
          <Route path="history" element={<WhatsAppHistory key={channel.id} channel={channel} />} />
          <Route path="*" element={<Navigate to={`${channel.basePath}/chats`} replace />} />
        </Routes>
      </div>
    </div>
  );
}

// Arattai runs in sandbox until its Business API is published; say so wherever it's used,
// so nobody thinks parents were actually messaged.
function ArattaiModeBanner() {
  const [account, setAccount] = useState(null);
  useEffect(() => {
    httpsCallable(functions, 'checkArattaiAccount')()
      .then(res => setAccount(res.data))
      .catch(err => setAccount({ mode: 'error', label: err.message }));
  }, []);

  if (!account) return null;
  if (account.mode === 'sandbox') {
    return (
      <div className="flex items-start gap-2 px-4 sm:px-6 py-2.5 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b border-amber-500/20 shrink-0">
        <FlaskConical size={14} className="shrink-0 mt-0.5" />
        <span><span className="font-bold">Sandbox:</span> Arattai's Business API isn't released yet, so nothing here is really sent. Messages and delivery receipts are simulated.</span>
      </div>
    );
  }
  if (!account.connected) {
    return (
      <div className="flex items-start gap-2 px-4 sm:px-6 py-2.5 text-xs bg-red-500/10 text-red-600 dark:text-red-400 border-b border-red-500/20 shrink-0">
        <AlertCircle size={14} className="shrink-0 mt-0.5" />
        <span><span className="font-bold">Not connected:</span> {account.label}</span>
      </div>
    );
  }
  return null;
}
