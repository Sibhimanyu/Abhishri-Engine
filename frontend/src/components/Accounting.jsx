import React from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, CreditCard, Landmark, Scale } from 'lucide-react';
import FeesTransactions from './FeesTransactions';
import FeesStaffWallets from './FeesStaffWallets';
import FeesMyExpenses from './FeesMyExpenses';
import Reconciliation from './Reconciliation';
import PageTabs from './PageTabs';

export default function Accounting() {
  const { userData } = useAuth();
  const location = useLocation();
  const activeView = location.pathname.split('/')[2] || 'transactions';

  const isAdmin = userData?.isAdmin;
  const perms = userData?.permissions?.fees_accounting || {};
  const isMaster = isAdmin || perms === true;

  const canViewAllWallets = isMaster || perms?.exp_all === true;

  const tabs = [
    { id: 'transactions', label: 'All Transactions', icon: CreditCard, show: isMaster || perms?.exp_all || perms?.view_dashboard || perms?.view || perms?.ledger },
    { id: 'wallets', label: 'All Wallets', icon: CreditCard, show: canViewAllWallets },
    { id: 'my-expenses', label: 'My Expenses', icon: CreditCard, show: isMaster || perms?.exp_own || perms?.wallet_view_own || perms?.exp_all },
    // Reconciliation reads the whole ledger, so it needs ledger-level sight rather than
    // own-expense access; closing a month additionally requires config, checked inside.
    { id: 'reconciliation', label: 'Reconciliation', icon: Scale, show: isMaster || perms?.ledger || perms?.config || perms?.view }
  ];

  if (!isMaster && !perms?.view_dashboard && !perms?.exp_all && !perms?.exp_own && !perms?.wallet_view_own) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-8 rounded-xl text-center m-6">
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim">You do not have permission to access the Accounting module.</p>
      </div>
    );
  }

  const defaultTab = tabs.find(t => t.show)?.id || 'transactions';

  return (
    <div className="h-full flex flex-col bg-brand-bg relative">
      <PageTabs
        ariaLabel="Accounting"
        activeId={activeView}
        tabs={tabs.filter(t => t.show).map(t => ({ ...t, to: `/accounting/${t.id}` }))}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <Routes>
          <Route path="/" element={<Navigate to={defaultTab} replace />} />
          <Route path="wallets" element={<FeesStaffWallets />} />
          <Route path="transactions" element={tabs[0].show ? <FeesTransactions /> : <Navigate to={`/accounting/${defaultTab}`} replace />} />
          <Route path="my-expenses" element={<FeesMyExpenses />} />
          <Route path="reconciliation" element={<Reconciliation />} />
          <Route path="*" element={<div className="text-center py-12 text-brand-text-dim">Module section under construction.</div>} />
        </Routes>
      </div>
    </div>
  );
}
