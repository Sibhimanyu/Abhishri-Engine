import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, ShieldCheck, MapPin, MessageCircle, LayoutGrid, ScrollText, MessageSquare } from 'lucide-react';
import AdminUserPermissions from './AdminUserPermissions';
import AdminAttendanceSetup from './AdminAttendanceSetup';
import AdminWhatsAppConfig from './AdminWhatsAppConfig';
import AdminEntities from './AdminEntities';
import AdminAuditLog from './AdminAuditLog';
import AdminFeedback from './AdminFeedback';

// /settings/* doesn't declare per-tab sub-routes, so a deep link like /settings/feedback
// (used by the top-bar Feedback widget's "Review Feedback" link) needs to be read here
// directly rather than always falling back to the default tab.
const tabFromPath = (pathname) => pathname.split('/')[2] || 'users';

export default function SettingsAdmin() {
  const { userData } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Derived straight from the URL — no local state needed, and it keeps a deep link like
  // /settings/feedback (from the top-bar Feedback widget) in sync with the visible tab.
  const activeTab = tabFromPath(location.pathname);

  const goToTab = (id) => navigate(`/settings/${id}`);

  const isMaster = userData?.isAdmin;
  const canManageStaff = userData?.permissions?.staff_directory?.manage === true || userData?.permissions?.staff_directory === true;

  if (!isMaster && !canManageStaff) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-8 rounded-xl text-center flex flex-col items-center">
        <Shield className="text-red-500 mb-4" size={48} />
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim max-w-md">You do not have Administrator privileges to view or manage system settings.</p>
      </div>
    );
  }

  const allTabs = [
    { id: 'users', label: 'User Permissions', icon: ShieldCheck, show: isMaster || canManageStaff },
    { id: 'entities', label: 'Entities', icon: LayoutGrid, show: isMaster },
    { id: 'attendance', label: 'Attendance Setup', icon: MapPin, show: isMaster },
    { id: 'whatsapp', label: 'WhatsApp Config', icon: MessageCircle, show: isMaster },
    { id: 'audit', label: 'Audit Log', icon: ScrollText, show: isMaster },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare, show: isMaster },
  ];
  const tabs = allTabs.filter(t => t.show);

  return (
    <div className="space-y-6">

      {/* Tabs */}
      <div className="flex bg-black/5 dark:bg-white/5 rounded-lg p-1 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => goToTab(tab.id)}
              className={`flex-1 min-w-[150px] px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text'
                  : 'text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Icon size={16} className={activeTab === tab.id ? 'text-brand-primary' : ''} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="animate-in fade-in duration-300">
        {activeTab === 'users' && (isMaster || canManageStaff) && <AdminUserPermissions />}
        {activeTab === 'entities' && isMaster && <AdminEntities />}
        {activeTab === 'attendance' && isMaster && <AdminAttendanceSetup />}
        {activeTab === 'whatsapp' && isMaster && <AdminWhatsAppConfig />}
        {activeTab === 'audit' && isMaster && <AdminAuditLog />}
        {activeTab === 'feedback' && isMaster && <AdminFeedback />}
      </div>
    </div>
  );
}
