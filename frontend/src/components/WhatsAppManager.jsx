import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Radio, Users, History, AlertCircle } from 'lucide-react';
import WhatsAppChats from './WhatsAppChats';
import WhatsAppBroadcast from './WhatsAppBroadcast';
import WhatsAppLists from './WhatsAppLists';
import WhatsAppHistory from './WhatsAppHistory';

import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';

export default function WhatsAppManager() {
  const { userData } = useAuth();
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const activeView = pathParts[pathParts.length - 1] === 'whatsapp' ? 'chats' : pathParts[pathParts.length - 1];

  // Check Permissions
  const waPerms = userData?.permissions?.whatsapp_sender;
  const isMaster = userData?.isAdmin || waPerms === true;
  
  if (!isMaster && !waPerms?.access && !waPerms?.broadcast && !waPerms?.manage) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-brand-card rounded-2xl border border-brand-card-border shadow-sm">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim">You do not have permission to access the Communications module.</p>
      </div>
    );
  }

  const tabs = [
    { id: 'chats', label: 'Live Chats', icon: MessageSquare, show: isMaster || waPerms?.access },
    { id: 'broadcast', label: 'Broadcast', icon: Radio, show: isMaster || waPerms?.broadcast },
    { id: 'lists', label: 'Audience Lists', icon: Users, show: isMaster || waPerms?.manage },
    { id: 'history', label: 'History', icon: History, show: isMaster || waPerms?.manage }
  ];

  return (
    <div className="h-full flex flex-col -mx-4 md:-mx-8 bg-brand-bg relative">
      {/* Module Navigation */}
      <div className="flex border-b border-brand-card-border bg-brand-sidebar px-6 sticky top-0 z-10 shrink-0">
        {tabs.filter(t => t.show).map(tab => (
          <Link
            key={tab.id}
            to={`/whatsapp/${tab.id}`}
            className={`flex items-center gap-2 px-4 py-4 font-medium text-sm transition-colors border-b-2 ${
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

      {/* Sub-Views Container */}
      <div className="flex-1 overflow-hidden relative">
        <Routes>
          <Route path="/" element={<Navigate to="chats" replace />} />
          <Route path="chats" element={<WhatsAppChats />} />
          <Route path="broadcast" element={<WhatsAppBroadcast />} />
          <Route path="lists" element={<WhatsAppLists />} />
          <Route path="history" element={<WhatsAppHistory />} />
          <Route path="*" element={<Navigate to="chats" replace />} />
        </Routes>
      </div>
    </div>
  );
}
