import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, ShieldCheck, MapPin, MessageCircle, MessagesSquare, LayoutGrid, ScrollText, BellRing, FileText } from 'lucide-react';
import AdminUserPermissions from './AdminUserPermissions';
import AdminAttendanceSetup from './AdminAttendanceSetup';
import AdminWhatsAppConfig from './AdminWhatsAppConfig';
import AdminArattaiConfig from './AdminArattaiConfig';
import AdminStaffNotifications from './AdminStaffNotifications';
import AdminTemplates from './AdminTemplates';
import AdminEntities from './AdminEntities';
import AdminAuditLog from './AdminAuditLog';
import PageTabs from './PageTabs';

// /settings/* doesn't declare per-tab sub-routes, so a deep link like /settings/arattai
// needs to be read here directly rather than always falling back to the default tab.
const tabFromPath = (pathname) => pathname.split('/')[2] || 'users';

export default function SettingsAdmin() {
  const { userData } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Derived straight from the URL — no local state needed, and it keeps a deep link
  // in sync with the visible tab.
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
    { id: 'arattai', label: 'Arattai Config', icon: MessagesSquare, show: isMaster },
    { id: 'staff-notifications', label: 'Staff Notifications', icon: BellRing, show: isMaster },
    { id: 'templates', label: 'Templates', icon: FileText, show: isMaster },
    { id: 'audit', label: 'Audit Log', icon: ScrollText, show: isMaster },
  ];
  const tabs = allTabs.filter(t => t.show);

  return (
    <div className="space-y-6">

      {/* Tabs: flush under the top bar */}
      <PageTabs
        ariaLabel="Settings"
        className="-mx-4 md:-mx-8 -mt-4 md:-mt-8"
        activeId={activeTab}
        onSelect={goToTab}
        tabs={tabs}
      />

      {/* Content */}
      <div className="animate-in fade-in duration-300">
        {activeTab === 'users' && (isMaster || canManageStaff) && <AdminUserPermissions />}
        {activeTab === 'entities' && isMaster && <AdminEntities />}
        {activeTab === 'attendance' && isMaster && <AdminAttendanceSetup />}
        {activeTab === 'whatsapp' && isMaster && <AdminWhatsAppConfig />}
        {activeTab === 'arattai' && isMaster && <AdminArattaiConfig />}
        {activeTab === 'staff-notifications' && isMaster && <AdminStaffNotifications />}
        {activeTab === 'templates' && isMaster && <AdminTemplates />}
        {activeTab === 'audit' && isMaster && <AdminAuditLog />}
      </div>
    </div>
  );
}
