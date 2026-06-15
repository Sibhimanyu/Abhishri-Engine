import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, CreditCard, Landmark } from 'lucide-react';
import FeesTransactions from './FeesTransactions';
import FeesStaffWallets from './FeesStaffWallets';
import FeesMyExpenses from './FeesMyExpenses';

export default function Accounting() {
  const { userData } = useAuth();
  const location = useLocation();
  const activeView = location.pathname.split('/')[2] || 'transactions';

  const isAdmin = userData?.isAdmin;
  const perms = userData?.permissions?.fees_accounting || {};
  const isMaster = isAdmin || perms === true;

  const canViewAllWallets = isMaster || perms?.exp_all === true;

  const tabs = [
    { id: 'transactions', label: 'All Transactions', icon: CreditCard, show: isMaster || perms?.exp_all || perms?.trans_add || perms?.trans_delete },
    { id: 'wallets', label: 'All Wallets', icon: CreditCard, show: canViewAllWallets },
    { id: 'my-expenses', label: 'My Expenses', icon: CreditCard, show: isMaster || perms?.exp_own || perms?.wallet_view_own || perms?.exp_all }
  ];

  if (!isMaster && !perms?.view_dashboard && !perms?.exp_all && !perms?.exp_own && !perms?.wallet_view_own && !perms?.trans_add && !perms?.trans_delete) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-8 rounded-xl text-center m-6">
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim">You do not have permission to access the Accounting module.</p>
      </div>
    );
  }

  const defaultTab = tabs.find(t => t.show)?.id || 'transactions';

  return (
    <div className="h-full flex flex-col -mx-4 md:-mx-8 bg-brand-bg relative">
      <div className="bg-brand-sidebar pt-2 shrink-0">
        <div className="flex overflow-x-auto hide-scrollbar gap-1 border-b border-brand-card-border px-4 md:px-8">
          {tabs.filter(t => t.show).map(tab => (
            <Link
              key={tab.id}
              to={`/accounting/${tab.id}`}
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
          <Route path="wallets" element={<FeesStaffWallets />} />
          <Route path="transactions" element={<FeesTransactions />} />
          <Route path="my-expenses" element={<FeesMyExpenses />} />
          <Route path="*" element={<div className="text-center py-12 text-brand-text-dim">Module section under construction.</div>} />
        </Routes>
      </div>
    </div>
  );
}
