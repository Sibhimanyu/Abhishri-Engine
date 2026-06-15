import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ScrollText, FileCheck } from 'lucide-react';
import FeesLedger from './FeesLedger';
import FeesPlans from './FeesPlans';

export default function FeeCollection() {
  const { userData } = useAuth();
  const location = useLocation();
  const activeView = location.pathname.split('/')[2] || 'preschool';

  const isAdmin = userData?.isAdmin;
  const perms = userData?.permissions?.fees_accounting || {};
  const isMaster = isAdmin || perms === true;

  const tabs = [
    { id: 'preschool', label: 'Preschool Ledger', icon: ScrollText, show: isMaster || perms?.ledger },
    { id: 'tuition', label: 'Tuition Ledger', icon: ScrollText, show: isMaster || perms?.ledger },
    { id: 'plans', label: 'Fee Packages', icon: FileCheck, show: isMaster || perms?.config }
  ];

  if (!isMaster && !perms?.view && !perms?.ledger && !perms?.config) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-8 rounded-xl text-center m-6">
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim">You do not have permission to access the Fee Collection module.</p>
      </div>
    );
  }

  const defaultTab = tabs.find(t => t.show)?.id || 'preschool';

  return (
    <div className="h-full flex flex-col -mx-4 md:-mx-8 bg-brand-bg relative">
      <div className="bg-brand-sidebar pt-2 shrink-0">
        <div className="flex overflow-x-auto hide-scrollbar gap-1 border-b border-brand-card-border px-4 md:px-8">
          {tabs.filter(t => t.show).map(tab => (
            <Link
              key={tab.id}
              to={`/fee-collection/${tab.id}`}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeView === tab.id 
                  ? 'border-brand-primary text-brand-primary bg-brand-primary/5' 
                  : 'border-transparent text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <Routes>
          <Route path="/" element={<Navigate to={defaultTab} replace />} />
          <Route path="preschool/*" element={<FeesLedger wing="preschool" />} />
          <Route path="tuition/*" element={<FeesLedger wing="tuition" />} />
          <Route path="plans" element={<FeesPlans />} />
          <Route path="*" element={<div className="text-center py-12 text-brand-text-dim">Module section under construction.</div>} />
        </Routes>
      </div>
    </div>
  );
}
