import React from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ScrollText, FileCheck } from 'lucide-react';
import FeesLedger from './FeesLedger';
import FeesPlans from './FeesPlans';
import { feeAccess } from '../utils/feeAccess';
import PageTabs from './PageTabs';

export default function FeeCollection() {
  const { userData } = useAuth();
  const location = useLocation();
  const activeView = location.pathname.split('/')[2] || 'preschool';

  const isAdmin = userData?.isAdmin;
  const perms = userData?.permissions?.fees_accounting || {};
  const isMaster = isAdmin || perms === true;
  const { canSeeLedgerTabs, canOpenFeeCollection } = feeAccess(perms, isMaster);

  const tabs = [
    { id: 'preschool', label: 'Preschool Ledger', icon: ScrollText, show: canSeeLedgerTabs },
    { id: 'tuition', label: 'Tuition Ledger', icon: ScrollText, show: canSeeLedgerTabs },
    { id: 'plans', label: 'Fee Packages', icon: FileCheck, show: isMaster || perms?.config }
  ];

  if (!canOpenFeeCollection) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-8 rounded-xl text-center m-6">
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim">You do not have permission to access the Fee Collection module.</p>
      </div>
    );
  }

  const defaultTab = tabs.find(t => t.show)?.id || 'preschool';

  return (
    <div className="h-full flex flex-col bg-brand-bg relative">
      <PageTabs
        ariaLabel="Fee collection"
        activeId={activeView}
        tabs={tabs.filter(t => t.show).map(t => ({ ...t, to: `/fee-collection/${t.id}` }))}
      />

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
