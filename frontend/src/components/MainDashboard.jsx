import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, onSnapshot, doc, where, collectionGroup } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { firestore, rtdb } from '../firebase';
import { classifyIncomeTx } from '../utils/reportUtils';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Users, CreditCard, ClipboardCheck, Briefcase, 
  ArrowUpRight, ArrowDownRight, Activity, Calendar, 
  TrendingUp, Award, UserPlus, FileText, CheckCircle2, 
  Clock, Plus, MessageSquare
} from 'lucide-react';

export default function MainDashboard() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('Welcome');
  
  const role = userData?.role || 'teacher';
  const isMaster = userData?.isAdmin || role === 'admin';
  const perms = userData?.permissions || {};

  const showTotalStudents = isMaster || perms.student_directory?.view;
  const showMonthlyRevenue = isMaster || perms.fees_accounting?.view_dashboard;
  const showStudentAttendance = isMaster || perms.attendance?.view;
  const showStaffAttendance = isMaster || perms.staff_directory?.view;
  const showWingBreakdown = isMaster || perms.student_directory?.view;
  const showRecentCollections = isMaster || perms.fees_accounting?.view_dashboard;
  
  const showQuickAddStudent = isMaster || perms.student_directory?.manage;
  const showQuickMarkRoster = isMaster || perms.attendance?.mark;
  const showQuickLogExpense = isMaster || perms.fees_accounting?.exp_own || perms.fees_accounting?.exp_all;
  const showQuickComms = isMaster || perms.whatsapp_sender?.access;
  const showSmartCampusStatus = isMaster || perms.smart_campus?.view;
  
  // Dynamic Stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    preschoolCount: 0,
    tuitionCount: 0,
    monthlyRevenue: 0,
    presentStaffCount: 0,
    totalStaffCount: 0,
    presentStudentsCount: 0,
    totalStudentsToday: 0
  });

  const [recentTxns, setRecentTxns] = useState([]);
  const [recentAdmissions, setRecentAdmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Today's Date String YYYY-MM-DD
  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    // Dynamic greeting based on hour
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  useEffect(() => {
    // Fetch live metrics
    let unsubStudents = null;
    let unsubTuition = null;
    let unsubTransactions = null;
    let unsubStaff = null;

    try {
      // 1. Live Students Count
      const studentsRef = collection(firestore, 'students');

      
      let preschoolCount = 0;
      let tuitionCount = 0;

      const updateStats = () => {
        const total = preschoolCount + tuitionCount;
        setStats(prev => ({
          ...prev,
          totalStudents: total,
          preschoolCount: preschoolCount,
          tuitionCount: tuitionCount,
          totalStudentsToday: total
        }));
      };

      if (showTotalStudents || showWingBreakdown) {
        unsubStudents = onSnapshot(query(studentsRef), (snap) => {
          let pCount = 0;
          let tCount = 0;
          const allStudents = [];
          snap.forEach(doc => {
            const data = doc.data();
            const type = data.studentType || data.programType || 'preschool';
            if (type === 'tuition') tCount++;
            else pCount++;
            allStudents.push({ id: doc.id, ...data });
          });
          preschoolCount = pCount;
          tuitionCount = tCount;
          updateStats();

          if (!showRecentCollections && showTotalStudents) {
             const recent = allStudents.sort((a, b) => {
               const dateA = new Date(a.enrollmentDate || 0).getTime();
               const dateB = new Date(b.enrollmentDate || 0).getTime();
               return dateB - dateA;
             }).slice(0, 4);
             setRecentAdmissions(recent);
          }
        }, (err) => {
          console.error("studentsRef snapshot error", err);
        });
      }

      // 2. Live Transactions & Revenue
      let txnsRef;
      if (showMonthlyRevenue || showRecentCollections) {

        txnsRef = collectionGroup(firestore, 'transactions');
        unsubTransactions = onSnapshot(query(txnsRef), (snap) => {
        let revenueThisMonth = 0;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const txnsList = [];

        snap.forEach(d => {
          const data = d.data();
          // Shared classifier so the dashboard can never drift from the Reports tab.
          if (classifyIncomeTx(data) === 'discount') {
            return; // Ignore non-cash ledger adjustments
          }
          const tDate = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp || 0);
          
          if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
            revenueThisMonth += (data.amount || 0);
          }

          txnsList.push({
            id: d.id,
            studentName: data.studentName || 'Anonymous',
            amount: data.amount || 0,
            date: tDate,
            method: data.method || 'Cash'
          });
        });

        // Sort latest first and take top 4
        txnsList.sort((a, b) => b.date - a.date);
        setRecentTxns(txnsList.slice(0, 4));

        setStats(prev => ({
          ...prev,
          monthlyRevenue: revenueThisMonth
        }));
      });
      }

      // 3. Live Staff Roster Count from allowed_users
      const allowed_usersRef = collection(firestore, 'allowed_users');
      if (showStaffAttendance) {
        unsubStaff = onSnapshot(query(allowed_usersRef), (snap) => {
          let count = 0;
          snap.forEach(d => {
            const role = d.data().role;
            if (role !== 'student' && role !== 'parent') {
              count++;
            }
          });
          setStats(prev => ({
            ...prev,
            totalStaffCount: count
          }));
        }, (err) => {
          console.error("allowed_usersRef snapshot error", err);
        });
      }

    } catch (err) {
      console.error("Failed to set up dashboard listeners:", err);
    }

    return () => {
      if (unsubStudents) unsubStudents();
      if (unsubTransactions) unsubTransactions();
      if (unsubStaff) unsubStaff();
    };
  }, []);

  // 4. Today's Live Attendance Counts from Realtime Database
  useEffect(() => {
    const studentAttRef = ref(rtdb, `modules/student_directory/attendance/${todayStr}`);
    const staffAttendanceRef = ref(rtdb, `modules/staff_directory/attendance/${todayStr}`);

    const unsubStudentAtt = onValue(studentAttRef, (snap) => {
      let presentCount = 0;
      if (snap.exists()) {
        Object.values(snap.val()).forEach(att => {
          if (att.status === 'present' || att.status === 'late') presentCount++;
        });
      }
      setStats(prev => ({ ...prev, presentStudentsCount: presentCount }));
    });

    const unsubStaffAtt = onValue(staffAttendanceRef, (snap) => {
      if (snap.exists()) {
        let present = 0;
        Object.values(snap.val()).forEach(att => {
          if (att.status === 'present' || att.status === 'late') {
            present++;
          }
        });
        setStats(prev => ({ ...prev, presentStaffCount: present }));
      } else {
        setStats(prev => ({ ...prev, presentStaffCount: 0 }));
      }
    });

    setLoading(false);

    return () => {
      unsubStudentAtt();
      unsubStaffAtt();
    };
  }, [todayStr]);

  const studentAttPct = stats.totalStudentsToday > 0 
    ? Math.round((stats.presentStudentsCount / stats.totalStudentsToday) * 100) 
    : 0;

  const staffAttPct = stats.totalStaffCount > 0 
    ? Math.round((stats.presentStaffCount / stats.totalStaffCount) * 100) 
    : 0;

  // Format Current Date
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formattedDate = new Date().toLocaleDateString('en-US', dateOptions);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Dynamic Welcome Banner */}
      <div className="relative overflow-hidden bg-brand-card rounded-2xl p-8 shadow-sm border-l-4 border-l-brand-primary border-y border-r border-brand-card-border">
        <div className="relative z-10 max-w-xl">
          <span className="text-brand-text-dim text-xs font-bold tracking-widest uppercase">{formattedDate}</span>
          <h1 className="text-4xl md:text-5xl font-black mt-2 tracking-tight text-brand-text leading-none">
            {greeting}, {userData?.displayName || currentUser?.email?.split('@')[0]}!
          </h1>
          <p className="text-brand-text-dim mt-3 text-sm md:text-base leading-relaxed">
            Welcome to your administrative command center. Here is a live pulse of Abhishri Academy today.
          </p>
        </div>
      </div>

      {/* KPI Dashboard Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total Students */}
        {showTotalStudents && (
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-start justify-between">
            <div>
              <p className="text-brand-text-dim text-xs font-bold uppercase tracking-wider mb-2">Total Students</p>
              <h3 className="text-3xl font-black text-brand-text leading-none mb-2">{stats.totalStudents}</h3>
              <p className="text-brand-text-dim text-xs">
                <span className="text-brand-secondary font-bold">{stats.preschoolCount}</span> Preschool • <span className="text-yellow-500 font-bold">{stats.tuitionCount}</span> Tuition
              </p>
            </div>
            <div className="p-3 rounded-xl bg-brand-primary/10 text-brand-primary shrink-0"><Users size={22} /></div>
          </div>
        )}

        {/* Monthly Revenue */}
        {showMonthlyRevenue && (
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-start justify-between">
            <div>
              <p className="text-brand-text-dim text-xs font-bold uppercase tracking-wider mb-2">Monthly Revenue</p>
              <h3 className="text-3xl font-black text-brand-text leading-none mb-2">₹ {stats.monthlyRevenue.toLocaleString()}</h3>
              <p className="text-brand-text-dim text-xs flex items-center gap-1">
                <TrendingUp size={14} className="text-green-500" /> realization this month
              </p>
            </div>
            <div className="p-3 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400 shrink-0"><CreditCard size={22} /></div>
          </div>
        )}

        {/* Smart Campus Overview (Fallback for PROs without Revenue access) */}
        {!showMonthlyRevenue && showSmartCampusStatus && (
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-start justify-between">
            <div>
              <p className="text-brand-text-dim text-xs font-bold uppercase tracking-wider mb-2">Smart Campus</p>
              <h3 className="text-3xl font-black text-brand-text leading-none mb-2">Online</h3>
              <p className="text-brand-text-dim text-xs flex items-center gap-1">
                <Activity size={14} className="text-blue-500" /> System active
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0"><Activity size={22} /></div>
          </div>
        )}

        {/* Student Attendance */}
        {showStudentAttendance && (
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-start justify-between">
          <div>
            <p className="text-brand-text-dim text-xs font-bold uppercase tracking-wider mb-2">Student Attendance</p>
            <h3 className="text-3xl font-black text-brand-text leading-none mb-2">
              {stats.presentStudentsCount} <span className="text-lg font-normal text-brand-text-dim">/ {stats.totalStudentsToday}</span>
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1.5 w-24 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-brand-secondary rounded-full" style={{ width: `${studentAttPct}%` }}></div>
              </div>
              <span className="text-brand-secondary text-xs font-black">{studentAttPct}%</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-brand-secondary/10 text-brand-secondary shrink-0"><ClipboardCheck size={22} /></div>
        </div>
        )}

        {/* Staff Attendance */}
        {showStaffAttendance && (
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-start justify-between">
          <div>
            <p className="text-brand-text-dim text-xs font-bold uppercase tracking-wider mb-2">Active Staff Today</p>
            <h3 className="text-3xl font-black text-brand-text leading-none mb-2">
              {stats.presentStaffCount} <span className="text-lg font-normal text-brand-text-dim">/ {stats.totalStaffCount}</span>
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1.5 w-24 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${staffAttPct}%` }}></div>
              </div>
              <span className="text-yellow-600 dark:text-yellow-400 text-xs font-black">{staffAttPct}%</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500 shrink-0"><Briefcase size={22} /></div>
        </div>
        )}

      </div>

      {/* Analytical Panel & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Enrollment Breakdown SVG Chart */}
        {showWingBreakdown && (
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-bold text-lg text-brand-text">Wing Breakdown Analysis</h3>
                <p className="text-xs text-brand-text-dim">Comparison between Preschool and Tuition branches</p>
              </div>
              <span className="bg-brand-primary/10 text-brand-primary text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border border-brand-primary/20">Enrollment ratio</span>
            </div>

            {/* Custom SVG Horizontal Bar Chart */}
            <div className="space-y-6 my-4">
              
              {/* Preschool bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-brand-text flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-primary"></span>
                    Preschool Wing
                  </span>
                  <span className="font-bold text-brand-text">{stats.preschoolCount} Students ({stats.totalStudents > 0 ? Math.round((stats.preschoolCount / stats.totalStudents) * 100) : 0}%)</span>
                </div>
                <div className="h-4 w-full bg-black/5 dark:bg-white/5 rounded-lg overflow-hidden flex">
                  <div 
                    className="h-full bg-brand-primary rounded-lg" 
                    style={{ width: `${stats.totalStudents > 0 ? (stats.preschoolCount / stats.totalStudents) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>

              {/* Tuition bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-brand-text flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-secondary"></span>
                    Tuition Wing
                  </span>
                  <span className="font-bold text-brand-text">{stats.tuitionCount} Students ({stats.totalStudents > 0 ? Math.round((stats.tuitionCount / stats.totalStudents) * 100) : 0}%)</span>
                </div>
                <div className="h-4 w-full bg-black/5 dark:bg-white/5 rounded-lg overflow-hidden flex">
                  <div 
                    className="h-full bg-brand-secondary rounded-lg" 
                    style={{ width: `${stats.totalStudents > 0 ? (stats.tuitionCount / stats.totalStudents) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>

            </div>
          </div>

          <div className="border-t border-brand-card-border pt-4 mt-6 flex justify-between items-center text-xs text-brand-text-dim">
            <span>Ratios reflect active students verified in database directory.</span>
            <Link to="/students" className="text-brand-primary font-bold hover:underline">View Roster</Link>
          </div>
        </div>
        )}

        {/* Quick Commands Dashboard Card */}
        <div className={`bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm flex flex-col justify-between ${showWingBreakdown ? '' : 'lg:col-span-3'}`}>
          <div>
            <h3 className="font-bold text-lg text-brand-text mb-1">Administrative Actions</h3>
            <p className="text-xs text-brand-text-dim mb-6">Quick shortcuts to execute tasks</p>
            
            <div className={`grid gap-3 ${showWingBreakdown ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
              
              {showQuickAddStudent && (
                <button 
                  onClick={() => navigate('/students', { state: { action: 'add' } })}
                  className="flex flex-col items-center justify-center p-4 border border-brand-card-border hover:border-brand-primary/40 hover:bg-brand-primary/5 rounded-xl transition-all group"
                >
                  <div className="p-2.5 rounded-xl bg-brand-primary/10 text-brand-primary mb-2 group-hover:scale-110 transition-transform"><UserPlus size={18} /></div>
                  <span className="text-xs font-bold text-brand-text text-center">Add Student</span>
                </button>
              )}

              {showQuickMarkRoster && (
                <button 
                  onClick={() => navigate('/attendance')}
                  className="flex flex-col items-center justify-center p-4 border border-brand-card-border hover:border-brand-secondary/40 hover:bg-brand-secondary/5 rounded-xl transition-all group"
                >
                  <div className="p-2.5 rounded-xl bg-brand-secondary/10 text-brand-secondary mb-2 group-hover:scale-110 transition-transform"><ClipboardCheck size={18} /></div>
                  <span className="text-xs font-bold text-brand-text text-center">Mark Roster</span>
                </button>
              )}

              {showQuickLogExpense && (
                <button 
                  onClick={() => navigate('/fees/my-expenses', { state: { action: 'add' } })}
                  className="flex flex-col items-center justify-center p-4 border border-brand-card-border hover:border-yellow-500/40 hover:bg-yellow-500/5 rounded-xl transition-all group"
                >
                  <div className="p-2.5 rounded-xl bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 mb-2 group-hover:scale-110 transition-transform"><Plus size={18} /></div>
                  <span className="text-xs font-bold text-brand-text text-center">Log Expense</span>
                </button>
              )}

              {showQuickComms && (
                <button 
                  onClick={() => navigate('/whatsapp')}
                  className="flex flex-col items-center justify-center p-4 border border-brand-card-border hover:border-purple-500/40 hover:bg-purple-500/5 rounded-xl transition-all group"
                >
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 mb-2 group-hover:scale-110 transition-transform"><MessageSquare size={18} /></div>
                  <span className="text-xs font-bold text-brand-text text-center">Communications</span>
                </button>
              )}

              {showSmartCampusStatus && (
                <button 
                  onClick={() => navigate('/smart-campus')}
                  className="flex flex-col items-center justify-center p-4 border border-brand-card-border hover:border-blue-500/40 hover:bg-blue-500/5 rounded-xl transition-all group"
                >
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 mb-2 group-hover:scale-110 transition-transform"><Activity size={18} /></div>
                  <span className="text-xs font-bold text-brand-text text-center">Smart Campus</span>
                </button>
              )}

            </div>
          </div>

          <div className="border-t border-brand-card-border pt-4 mt-6 text-center text-xs text-brand-text-dim">
            Shortcut actions scale based on role privileges.
          </div>
        </div>

      </div>

      {/* Bottom Row: Recent Collections Feed */}
      {showRecentCollections && (
        <div className="bg-brand-card border border-brand-card-border rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-bold text-lg text-brand-text">Recent Realized Payments</h3>
              <p className="text-xs text-brand-text-dim">Real-time incoming fee collections feed</p>
            </div>
            <Link to="/fees/transactions" className="text-xs font-bold text-brand-primary hover:underline">View All Collections</Link>
          </div>

          {recentTxns.length === 0 ? (
            <div className="py-8 text-center text-brand-text-dim text-sm">No transaction receipts logged this month.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentTxns.map(t => (
                <div key={t.id} className="p-4 rounded-xl border border-brand-card-border bg-brand-bg/50 dark:bg-black/10 flex items-center justify-between">
                  <div className="min-w-0">
                    <h4 className="font-bold text-brand-text text-sm truncate">{t.studentName}</h4>
                    <p className="text-brand-text-dim text-[10px] mt-0.5">{t.date.toLocaleDateString()}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span className="text-sm font-black text-green-600 dark:text-green-400">+ ₹{t.amount.toLocaleString()}</span>
                    <p className="text-[9px] uppercase tracking-wider font-bold text-brand-text-dim mt-0.5">{t.method}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alternate Bottom Row: Recent Admissions Feed for PROs */}
      {!showRecentCollections && showTotalStudents && (
        <div className="bg-brand-card border border-brand-card-border rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-bold text-lg text-brand-text">Recent Admissions</h3>
              <p className="text-xs text-brand-text-dim">Latest enrollments across all wings</p>
            </div>
            <Link to="/students" className="text-xs font-bold text-brand-primary hover:underline">View Directory</Link>
          </div>

          {recentAdmissions.length === 0 ? (
            <div className="py-8 text-center text-brand-text-dim text-sm">No students currently enrolled.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentAdmissions.map(student => (
                <div key={student.id} className="p-4 rounded-xl border border-brand-card-border bg-brand-bg/50 dark:bg-black/10 flex items-center justify-between">
                  <div className="min-w-0">
                    <h4 className="font-bold text-brand-text text-sm truncate">{student.name}</h4>
                    <p className="text-brand-text-dim text-[10px] mt-0.5">{student.studentType || student.programType || 'Preschool'}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span className="text-xs font-bold text-brand-primary">Active</span>
                    <p className="text-[9px] uppercase tracking-wider font-bold text-brand-text-dim mt-0.5">{student.enrollmentDate ? new Date(student.enrollmentDate).toLocaleDateString() : 'N/A'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
