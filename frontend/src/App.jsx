import React, { useState } from 'react';
import { LayoutDashboard, Users, CreditCard, Settings, LogOut, Search, Bell, ChevronDown, Moon, Sun, ClipboardCheck, Cpu, MessageSquare, Briefcase, Menu, X, AlertTriangle, Database, Landmark } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, firestore, rtdb } from './firebase';
import Login from './components/Login';
import { useAuth } from './context/AuthContext';
import FeeCollection from './components/FeeCollection';
import Accounting from './components/Accounting';
import SettingsAdmin from './components/SettingsAdmin';
import StudentDirectory from './components/StudentDirectory';
import SmartCampus from './components/SmartCampus';
import Attendance from './components/Attendance';
import StudentPortal from './components/StudentPortal';
import WhatsAppManager from './components/WhatsAppManager';
import StaffDirectory from './components/StaffDirectory';
import GlobalSearch from './components/GlobalSearch';
import MainDashboard from './components/MainDashboard';
import { getCurrentTamilDate } from './utils/astrologyApi';
import { MessageCircle, Cake, CalendarDays } from 'lucide-react';
import SchoolCalendar from './components/SchoolCalendar';

import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';

function App() {
  const location = useLocation();
  const activeTab = location.pathname === '/' ? 'dashboard' : location.pathname.split('/')[1];
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingLoginsCount, setPendingLoginsCount] = useState(0);
  const [unreadWhatsAppCount, setUnreadWhatsAppCount] = useState(0);
  const [tamilBirthdayMembers, setTamilBirthdayMembers] = useState([]);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const { currentUser, userData, loading } = useAuth();

  const isMaster = userData?.isAdmin;
  
  // Permission Checkers
  const getPerm = (module, perm) => isMaster || userData?.permissions?.[module]?.[perm];
  
  const hasStaffAccess = getPerm('staff_directory', 'view');
  const hasStudentAccess = getPerm('student_directory', 'view');
  const hasAttendanceAccess = getPerm('attendance', 'view');
  const hasSmartCampusAccess = getPerm('smart_campus', 'view');
  const hasFeeCollectionAccess = isMaster || 
    userData?.permissions?.fees_accounting?.view || 
    userData?.permissions?.fees_accounting?.ledger ||
    userData?.permissions?.fees_accounting?.config;

  const hasAccountingAccess = isMaster || 
    userData?.permissions?.fees_accounting?.view_dashboard || 
    userData?.permissions?.fees_accounting?.exp_all || 
    userData?.permissions?.fees_accounting?.exp_own || 
    userData?.permissions?.fees_accounting?.wallet_view_own || 
    userData?.permissions?.fees_accounting?.trans_add ||
    userData?.permissions?.fees_accounting?.trans_delete;
  const hasWaAccess = isMaster || 
    userData?.permissions?.whatsapp_sender?.access || 
    userData?.permissions?.whatsapp_sender?.broadcast || 
    userData?.permissions?.whatsapp_sender?.manage;

  React.useEffect(() => {
    if (!userData?.isAdmin) return;
    
    let unsubscribe = () => {};
    import('firebase/firestore').then(({ collection, onSnapshot }) => {
      let allowedEmails = new Set();
      let pendingDocs = [];

      const updatePendingCount = () => {
        const validPending = pendingDocs.filter(doc => !allowedEmails.has(doc.id.toLowerCase()));
        setPendingLoginsCount(validPending.length);
      };

      const usersRef = collection(firestore, 'allowed_users');
      const unsubUsers = onSnapshot(usersRef, (snap) => {
        allowedEmails = new Set(snap.docs.map(d => d.id.toLowerCase()));
        updatePendingCount();
      });

      const pendingRef = collection(firestore, 'unauthorized_logins');
      const unsubPending = onSnapshot(pendingRef, (snap) => {
        pendingDocs = snap.docs;
        updatePendingCount();
      });

      unsubscribe = () => {
        unsubUsers();
        unsubPending();
      };
    });
    return () => unsubscribe();
  }, [userData?.isAdmin]);

  // WhatsApp Listener
  React.useEffect(() => {
    if (!hasWaAccess) return;

    let unsubscribe = () => {};
    import('firebase/database').then(({ ref, onValue }) => {
      const dbRef = ref(rtdb, 'whatsapp_conversations');
      unsubscribe = onValue(dbRef, (snapshot) => {
        let totalUnread = 0;
        if (snapshot.exists()) {
          const data = snapshot.val();
          Object.values(data).forEach(convo => {
            if (convo.metadata?.unreadCount > 0) {
              totalUnread += convo.metadata.unreadCount;
            }
          });
        }
        setUnreadWhatsAppCount(totalUnread);
      });
    });
    return () => unsubscribe();
  }, [hasWaAccess]);

  // Tamil Birthday Fetcher
  React.useEffect(() => {
    // Only run if they have access to at least one directory
    if (!hasStudentAccess && !hasStaffAccess) return;

    const fetchBirthdays = async () => {
      try {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const currentTamilDate = getCurrentTamilDate();
        if (!currentTamilDate) return;

        const bdayMembers = [];

        // Fetch Students
        if (hasStudentAccess) {
          const studentsRef = collection(firestore, 'students');
          const qStud = query(studentsRef, where('tamilMonth', '==', currentTamilDate.tamilMonth), where('tamilDay', '==', currentTamilDate.tamilDay));
          const snapStud = await getDocs(qStud);
          snapStud.forEach((doc) => {
            bdayMembers.push({ id: doc.id, name: doc.data().name, type: 'student', path: '/students', ...currentTamilDate });
          });
        }

        // Fetch Staff
        if (hasStaffAccess) {
          const staffRef = collection(firestore, 'staff');
          const qStaff = query(staffRef, where('tamilMonth', '==', currentTamilDate.tamilMonth), where('tamilDay', '==', currentTamilDate.tamilDay));
          const snapStaff = await getDocs(qStaff);
          snapStaff.forEach((doc) => {
            bdayMembers.push({ id: doc.id, name: doc.data().name, type: 'staff', path: '/staff', ...currentTamilDate });
          });
        }

        setTamilBirthdayMembers(bdayMembers);
      } catch (error) {
        console.error("Failed to fetch Tamil Birthdays", error);
      }
    };
    fetchBirthdays();
  }, [hasStudentAccess, hasStaffAccess]);

  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(hasStudentAccess ? [{ id: 'students', label: 'Students', icon: Users }] : []),
    ...(hasStaffAccess ? [{ id: 'staff', label: 'Staff Directory', icon: Briefcase }] : []),
    ...(hasAttendanceAccess ? [{ id: 'attendance', label: 'Attendance', icon: ClipboardCheck }] : []),
    ...(hasSmartCampusAccess ? [{ id: 'smart-campus', label: 'Smart Campus', icon: Cpu }] : []),
    ...(hasWaAccess ? [{ id: 'whatsapp', label: 'Communications', icon: MessageSquare }] : []),
    ...(hasFeeCollectionAccess ? [{ id: 'fee-collection', label: 'Fee Collection', icon: CreditCard }] : []),
    ...(hasAccountingAccess ? [{ id: 'accounting', label: 'Accounting', icon: Landmark }] : []),
    { id: 'calendar', label: 'School Calendar', icon: CalendarDays },
    ...(isMaster ? [{ id: 'settings', label: 'Settings', icon: Settings }] : []),
  ];

  if (location.pathname.startsWith('/public-calendar')) {
    return (
      <div className="min-h-screen w-full bg-[#fdf8ef] text-brand-text font-sans flex flex-col transition-colors duration-300">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&family=Playfair+Display:wght@600;700;900&display=swap');

          body {
            background-color: #fdf8ef !important;
            font-family: 'Open Sans', sans-serif !important;
            color: #334155 !important;
          }

          :root {
            --bg-color: #fdf8ef !important;
            --card-bg: #ffffff !important;
            --card-border: #e2d9c8 !important;
            --text-color: #334155 !important;
            --text-dim-color: #64748b !important;
          }

          h1, h2, h3, h4, .month-title, .tracking-tight {
            font-family: 'Playfair Display', Georgia, serif !important;
            color: #1e293b !important;
            font-weight: 700 !important;
          }

          .bg-brand-primary {
            background-color: #ef5e58 !important;
          }
          .text-brand-primary {
            color: #ef5e58 !important;
          }
          .border-brand-primary {
            border-color: #ef5e58 !important;
          }
          .ring-brand-primary {
            --tw-ring-color: #ef5e58 !important;
          }
        `}</style>

        {/* Public Standalone Header matching main website */}
        <header className="bg-[#fdf8ef] border-b border-[#e2d9c8] h-16 sm:h-24 flex items-center justify-between px-4 sm:px-12 shrink-0 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <img src="/logo-coral.png" alt="Abhishri Academy Logo" className="h-10 sm:h-16 w-auto object-contain" />
          </div>
          <div className="flex items-center gap-4">
            <a 
              href="https://abhishriacademy.in/" 
              className="bg-[#ef5e58] hover:bg-[#d9534f] text-white px-4 py-2 sm:px-6 sm:py-3 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
              style={{ fontFamily: "'Open Sans', sans-serif" }}
            >
              Visit Website
            </a>
          </div>
        </header>

        {/* Content Wrapper */}
        <main className="flex-1 overflow-y-auto p-4 md:p-12 max-w-6xl mx-auto w-full">
          <SchoolCalendar />
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-brand-bg transition-colors duration-300">
        <div className="relative flex flex-col items-center">
          <div className="absolute inset-0 bg-brand-primary/20 blur-3xl rounded-full w-48 h-48 animate-pulse"></div>
          <img src="/logo-coral.png" alt="Abhishri Engine" className="h-24 w-auto object-contain block dark:hidden relative z-10" />
          <img src="/logo-white.png" alt="Abhishri Engine" className="h-24 w-auto object-contain hidden dark:block relative z-10" />
          <div className="mt-8 flex flex-col items-center gap-3 relative z-10">
            <div className="w-8 h-8 border-4 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin"></div>
            <p className="text-sm font-semibold tracking-widest text-brand-text-dim uppercase">Initializing Workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  const isStudentOrParent = userData?.dashboardType === 'student' || userData?.dashboardType === 'parent' || userData?.role === 'student' || userData?.role === 'parent';
  if (isStudentOrParent) {
    return <StudentPortal />;
  }

  // Block unauthorized users from seeing the main admin dashboard and sidebar
  const authorizedRoles = ['admin', 'staff', 'teacher', 'pro'];
  const isAuthorizedAdminOrStaff = userData?.isAdmin || authorizedRoles.includes(userData?.role) || Object.keys(userData?.permissions || {}).length > 0;
  if (!isAuthorizedAdminOrStaff) {
    return <UnauthorizedScreen user={currentUser} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden text-brand-text bg-brand-bg font-sans transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-[260px] bg-brand-sidebar border-r border-brand-card-border hidden md:flex flex-col z-50 transition-colors duration-300">
        <div className="flex items-center justify-center p-6 border-b border-brand-card-border h-24">
          <img src="/logo-coral.png" alt="Abhishri Logo" className="h-16 w-auto object-contain block dark:hidden" />
          <img src="/logo-white.png" alt="Abhishri Logo" className="h-16 w-auto object-contain hidden dark:block" />
        </div>
        
        <nav className="flex flex-col gap-1 flex-1 p-4">
          <div className="text-xs font-semibold text-brand-text-dim uppercase tracking-wider mb-2 px-3">Main Menu</div>
          {navItems.map((item) => {
            const path = item.id === 'dashboard' ? '/' : `/${item.id}`;
            const isActive = activeTab === item.id;
            return (
              <Link
                key={item.id}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-primary/10 text-brand-primary' 
                    : 'text-brand-text-dim hover:bg-black/5 dark:hover:bg-white/5 hover:text-brand-text'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-brand-primary' : 'opacity-70'} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-brand-card-border">
          <button 
            onClick={() => signOut(auth)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-brand-text-dim hover:bg-black/5 dark:hover:bg-white/5 hover:text-brand-text w-full transition-colors"
          >
            <LogOut size={18} className="opacity-70 rotate-180" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setShowMobileSidebar(false)}
          ></div>
          
          {/* Drawer Content */}
          <aside className="relative w-[280px] bg-brand-sidebar border-r border-brand-card-border flex flex-col h-full z-50 animate-in slide-in-from-left duration-300">
            {/* Close Button */}
            <button 
              onClick={() => setShowMobileSidebar(false)}
              className="absolute right-4 top-6 text-brand-text-dim hover:text-brand-text p-2 rounded-lg bg-black/5 dark:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center justify-center p-6 border-b border-brand-card-border h-24 shrink-0">
              <img src="/logo-coral.png" alt="Abhishri Logo" className="h-16 w-auto object-contain block dark:hidden" />
              <img src="/logo-white.png" alt="Abhishri Logo" className="h-16 w-auto object-contain hidden dark:block" />
            </div>
            
            <nav className="flex flex-col gap-1 flex-1 p-4 overflow-y-auto">
              <div className="text-xs font-semibold text-brand-text-dim uppercase tracking-wider mb-2 px-3">Main Menu</div>
              {navItems.map((item) => {
                const path = item.id === 'dashboard' ? '/' : `/${item.id}`;
                const isActive = activeTab === item.id;
                return (
                  <Link
                    key={item.id}
                    to={path}
                    onClick={() => setShowMobileSidebar(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-primary/10 text-brand-primary' 
                        : 'text-brand-text-dim hover:bg-black/5 dark:hover:bg-white/5 hover:text-brand-text'
                    }`}
                  >
                    <item.icon size={18} className={isActive ? 'text-brand-primary' : 'opacity-70'} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            
            <div className="p-4 border-t border-brand-card-border shrink-0">
              <button 
                onClick={() => { setShowMobileSidebar(false); signOut(auth); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-brand-text-dim hover:bg-black/5 dark:hover:bg-white/5 hover:text-brand-text w-full transition-colors"
              >
                <LogOut size={18} className="opacity-70 rotate-180" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="bg-brand-sidebar border-b border-brand-card-border h-16 flex items-center justify-between px-4 md:px-8 shrink-0 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowMobileSidebar(true)}
              className="text-brand-text-dim hover:text-brand-text p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 md:hidden transition-colors"
              aria-label="Open Sidebar"
            >
              <Menu size={20} />
            </button>
            <GlobalSearch />
          </div>
          
          <div className="flex items-center gap-5">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="text-brand-text-dim hover:text-brand-text transition-colors p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative text-brand-text-dim hover:text-brand-text transition-colors p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Bell size={20} className={(pendingLoginsCount > 0 || unreadWhatsAppCount > 0 || tamilBirthdayMembers.length > 0) ? 'text-brand-primary' : ''} />
                {(pendingLoginsCount > 0 || unreadWhatsAppCount > 0 || tamilBirthdayMembers.length > 0) && (
                  <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-primary border-2 border-brand-sidebar"></span>
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
                  <div className="absolute right-0 mt-3 w-64 bg-brand-card border border-brand-card-border rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-2 border-b border-brand-card-border mb-1">
                      <p className="text-xs font-bold text-brand-text-dim uppercase">Notifications</p>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {pendingLoginsCount > 0 && (
                        <Link 
                          onClick={() => setShowNotifications(false)}
                          to="/settings/users"
                          className="w-full text-left px-4 py-3 text-sm text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-start gap-3 border-b border-brand-card-border last:border-b-0"
                        >
                          <div className="mt-0.5 text-orange-500"><AlertTriangle size={16} /></div>
                          <div>
                            <p className="font-semibold text-orange-600 dark:text-orange-400">Access Requests</p>
                            <p className="text-xs text-brand-text-dim mt-0.5">There are {pendingLoginsCount} pending requests awaiting review.</p>
                          </div>
                        </Link>
                      )}

                      {unreadWhatsAppCount > 0 && (
                        <Link 
                          onClick={() => setShowNotifications(false)}
                          to="/whatsapp"
                          className="w-full text-left px-4 py-3 text-sm text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-start gap-3 border-b border-brand-card-border last:border-b-0"
                        >
                          <div className="mt-0.5 text-green-500"><MessageCircle size={16} /></div>
                          <div>
                            <p className="font-semibold text-green-600 dark:text-green-400">WhatsApp Livechat</p>
                            <p className="text-xs text-brand-text-dim mt-0.5">You have {unreadWhatsAppCount} unread message{unreadWhatsAppCount > 1 ? 's' : ''}.</p>
                          </div>
                        </Link>
                      )}

                      {tamilBirthdayMembers.map(member => (
                        <Link 
                          key={`bday-${member.type}-${member.id}`}
                          onClick={() => setShowNotifications(false)}
                          to={member.path}
                          className="w-full text-left px-4 py-3 text-sm text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-start gap-3 border-b border-brand-card-border last:border-b-0"
                        >
                          <div className="mt-0.5 text-pink-500"><Cake size={16} /></div>
                          <div>
                            <p className="font-semibold text-pink-600 dark:text-pink-400">Tamil Birthday Today!</p>
                            <p className="text-xs text-brand-text-dim mt-0.5">It is <b>{member.name}'s</b> ({member.type === 'staff' ? 'Staff' : 'Student'}) Tamil Birthday today ({member.tamilMonth} {member.tamilDay}).</p>
                          </div>
                        </Link>
                      ))}

                      {(pendingLoginsCount === 0 && unreadWhatsAppCount === 0 && tamilBirthdayMembers.length === 0) && (
                        <div className="px-4 py-6 text-center text-brand-text-dim text-sm">
                          No new notifications
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <div className="h-6 w-px bg-brand-card-border"></div>

            <div className="relative">
              <div 
                className="flex items-center gap-3 cursor-pointer group"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
              >
                <div className="w-8 h-8 rounded-full bg-brand-secondary/20 flex items-center justify-center text-brand-secondary font-bold text-sm uppercase">
                  {userData?.displayName ? userData.displayName.substring(0, 2) : (currentUser?.email ? currentUser.email.substring(0, 2) : 'U')}
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-sm leading-tight text-brand-text">
                    {userData?.displayName || currentUser?.email?.split('@')[0] || 'User'}
                  </span>
                  <span className="text-xs text-brand-text-dim leading-tight capitalize">
                    {userData?.role === 'pro' ? 'PRO' : (userData?.role || 'User')}
                  </span>
                </div>
                <ChevronDown size={14} className={`text-brand-text-dim group-hover:text-brand-text ml-1 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
              </div>

              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)}></div>
                  <div className="absolute right-0 mt-3 w-48 bg-brand-card border border-brand-card-border rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-2 border-b border-brand-card-border mb-1">
                      <p className="text-xs font-bold text-brand-text-dim uppercase">Signed in as</p>
                      <p className="text-sm font-semibold text-brand-text truncate">{currentUser?.email}</p>
                    </div>
                    <Link 
                      onClick={() => { setShowProfileMenu(false); }}
                      to="/settings"
                      className="w-full text-left px-4 py-2 text-sm text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <Settings size={16} /> Account Settings
                    </Link>
                    <button 
                      onClick={() => signOut(auth)}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
                    >
                      <LogOut size={16} className="rotate-180" /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          {activeTab !== 'dashboard' && (
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-brand-text">
                  {navItems.find(i => i.id === activeTab)?.label || 'Overview'}
                </h2>
              </div>
            </div>
          )}
          
          {/* Routes */}
          <Routes>
            <Route path="/" element={<MainDashboard />} />
            <Route path="/students" element={<StudentDirectory />} />
            <Route path="/staff" element={<StaffDirectory />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/smart-campus/*" element={<SmartCampus />} />
            <Route path="/whatsapp/*" element={<WhatsAppManager />} />
            <Route path="/fee-collection/*" element={<FeeCollection />} />
            <Route path="/accounting/*" element={<Accounting />} />
            <Route path="/calendar" element={<SchoolCalendar />} />

            <Route path="/settings/*" element={<SettingsAdmin />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;

function UnauthorizedScreen({ user }) {
  React.useEffect(() => {
    if (user?.email) {
      const timer = setTimeout(() => {
        import('firebase/firestore').then(({ doc, setDoc, serverTimestamp }) => {
          import('./firebase').then(({ firestore }) => {
            setDoc(doc(firestore, 'unauthorized_logins', user.email.toLowerCase()), {
              email: user.email.toLowerCase(),
              displayName: user.displayName || '',
              photoURL: user.photoURL || '',
              timestamp: serverTimestamp()
            }, { merge: true }).catch(console.error);
          });
        });
      }, 5000); // 5-second delay to prevent false positives during backend migrations
      
      return () => clearTimeout(timer);
    }
  }, [user]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-brand-bg text-brand-text p-6">
      <div className="max-w-md w-full p-8 bg-brand-card border border-brand-card-border rounded-2xl shadow-lg text-center space-y-6">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black">Access Unauthorized</h2>
          <p className="text-brand-text-dim text-sm">
            Your account ({user?.email}) is not authorized to access this workspace. Please contact the administrator to grant access.
          </p>
        </div>
        <button 
          onClick={() => signOut(auth)}
          className="w-full py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <LogOut size={16} className="rotate-180" /> Sign Out
        </button>
      </div>
    </div>
  );
}
