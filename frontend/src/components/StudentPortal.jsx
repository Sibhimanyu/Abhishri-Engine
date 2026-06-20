import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { firestore, rtdb, auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { LogOut, Calendar, Wallet, CheckCircle, XCircle, Clock, Moon, Sun, MinusCircle, CalendarDays } from 'lucide-react';
import SchoolCalendar from './SchoolCalendar';

export default function StudentPortal() {
  const { currentUser, userData } = useAuth();
  const [student, setStudent] = useState(null);
  const [fees, setFees] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activePortalTab, setActivePortalTab] = useState('overview');

  const isStudent = userData?.dashboardType === 'student' || userData?.role === 'student';

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  useEffect(() => {
    async function fetchData() {
      const sid = userData?.studentId || userData?.linkedStudentId;
      if (!sid) {
        setError('not_linked');
        setLoading(false);
        return;
      }

      try {
        const studentType = userData?.studentType || 'preschool';
        const directoryPath = 'student_directory';

        // Fetch Student Profile
        const sSnap = await getDoc(doc(firestore, 'students', sid));
        if (!sSnap.exists()) {
          setError('not_found');
          setLoading(false);
          return;
        }
        const sData = { id: sSnap.id, ...sSnap.data() };
        setStudent(sData);

        // Fetch Fees
        const fSnap = await getDoc(doc(firestore, 'students', sid, 'fee_ledger', 'plan_details'));
        let feeData = fSnap.exists() ? fSnap.data() : null;
        
        // Fee Calculation Logic
        let calculatedFees = null;
        if (feeData && feeData.components) {
          let annualNetFee = feeData.annualNetFee;
          if (annualNetFee === undefined) {
             const onetime = feeData.components.filter(c => c.frequency !== 'monthly').reduce((a, b) => a + (b.amount || 0), 0);
             const monthly = feeData.components.filter(c => c.frequency === 'monthly').reduce((a, b) => a + (b.amount || 0), 0);
             annualNetFee = onetime + (monthly * (feeData.billingCycle || 12));
          }
          const paid = feeData.paid || 0;
          const discounted = feeData.discounted || 0;
          
          calculatedFees = { 
             ...feeData, 
             totalAnnual: feeData.annualBaseFee || annualNetFee, 
             paid, 
             due: Math.max(0, annualNetFee - paid - discounted) 
          };
        }
        setFees(calculatedFees);

        // Fetch Transactions
        if (!isStudent) {
          const txQ = query(collection(firestore, 'students', sid, 'transactions'), orderBy('timestamp', 'desc'), limit(10));
          const txSnap = await getDocs(txQ);
          const txs = [];
          txSnap.forEach(d => txs.push({ id: d.id, ...d.data() }));
          setTransactions(txs);
        }

        // Fetch 35 days of attendance (RTDB)
        const attMap = {};
        const promises = [];
        for (let i = 0; i < 35; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dk = d.toISOString().split('T')[0];
          promises.push(get(ref(rtdb, `modules/${directoryPath}/attendance/${dk}/${sid}`)).then(snap => {
            if (snap.exists()) attMap[dk] = snap.val();
          }));
        }
        await Promise.all(promises);
        setAttendance(attMap);

        setLoading(false);
      } catch (err) {
        console.error("Portal fetch error:", err);
        setError('rules_error');
        setLoading(false);
      }
    }
    fetchData();
  }, [userData]);

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-brand-bg"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div></div>;
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-brand-bg text-brand-text p-6 text-center">
        <XCircle className="text-red-500 mb-4" size={64} />
        <h2 className="text-2xl font-bold mb-2">Access Issue</h2>
        <p className="text-brand-text-dim max-w-md mb-8">
          {error === 'not_linked' ? "Your account hasn't been linked to a student record yet. Please contact the school administrator." : 
           "Your account is linked but Firestore rules are blocking the read. Please ask the administrator to add the student portal rule."}
        </p>
        <button onClick={() => signOut(auth)} className="bg-brand-primary text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:opacity-90">
          <LogOut size={18} /> Sign Out
        </button>
      </div>
    );
  }

  // Analytics Helpers
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAtt = attendance[todayStr]?.status || 'none';
  const attMap = { 
    present: { color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/20', icon: CheckCircle, label: 'Present' }, 
    absent: { color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20', icon: XCircle, label: 'Absent' }, 
    late: { color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: Clock, label: 'Late' }, 
    none: { color: 'text-brand-text-dim', bg: 'bg-black/5 dark:bg-white/5 border-transparent', icon: MinusCircle, label: 'Not Marked' } 
  };
  const tStat = attMap[todayAtt] || attMap.none;
  const TIcon = tStat.icon;

  let presentCount = 0, absentCount = 0, lateCount = 0, totalDays = 0;
  Object.entries(attendance).forEach(([date, data]) => {
    // Only count Mon-Sat
    const d = new Date(date);
    if (d.getDay() !== 0) {
      totalDays++;
      if (data.status === 'present') presentCount++;
      if (data.status === 'absent') absentCount++;
      if (data.status === 'late') lateCount++;
    }
  });
  const attPct = totalDays > 0 ? Math.round(((presentCount + lateCount) / totalDays) * 100) : 0;

  // Render Calendar Grid (28 days)
  const renderCalendar = () => {
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const cells = [];
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startMonday = new Date(today);
    startMonday.setDate(today.getDate() - daysToMonday - 21);

    for (let i = 0; i < 28; i++) {
      const d = new Date(startMonday);
      d.setDate(startMonday.getDate() + i);
      const dk = d.toISOString().split('T')[0];
      const isFuture = d > today;
      const isWeekend = d.getDay() === 0;
      const status = attendance[dk]?.status || 'none';
      const isToday = dk === todayStr;

      let style = "bg-black/5 dark:bg-white/5 border-transparent text-brand-text";
      if (isFuture || isWeekend) style = "opacity-30 bg-black/5 dark:bg-white/5 border-transparent";
      else if (status === 'present') style = "bg-green-500/20 border-green-500 text-green-700 dark:text-green-400";
      else if (status === 'absent') style = "bg-red-500/20 border-red-500 text-red-700 dark:text-red-400";
      else if (status === 'late') style = "bg-yellow-500/20 border-yellow-500 text-yellow-700 dark:text-yellow-400";

      cells.push(
        <div key={dk} className={`aspect-square flex flex-col items-center justify-center rounded-lg border ${style} ${isToday ? 'ring-2 ring-brand-primary shadow-lg' : ''}`}>
          <span className={`text-sm font-bold ${isToday ? 'text-brand-primary' : ''}`}>{d.getDate()}</span>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-7 gap-2 mt-6">
        {days.map((d, i) => <div key={i} className="text-center text-xs font-bold text-brand-text-dim uppercase">{d}</div>)}
        {cells}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-brand-bg font-sans transition-colors duration-300 pb-20">
      
      {/* Top Navbar */}
      <header className="bg-brand-sidebar border-b border-brand-card-border h-16 flex items-center justify-between px-6 shrink-0 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo-coral.png" alt="Abhishri Logo" className="h-10 object-contain block dark:hidden" />
          <img src="/logo-white.png" alt="Abhishri Logo" className="h-10 object-contain hidden dark:block" />
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="text-brand-text-dim hover:text-brand-text transition-colors p-2 rounded-full hover:bg-black/5 dark:bg-white/5">
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => signOut(auth)} className="text-brand-text-dim hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Feed Container */}
      <main className="max-w-2xl mx-auto w-full px-4 pt-8 space-y-6">
        
        {/* Profile Card */}
        <div className="bg-gradient-to-br from-brand-primary/10 to-brand-secondary/5 border border-brand-card-border p-8 rounded-3xl shadow-sm">
          <p className="text-brand-text-dim text-sm font-medium mb-1">
            {new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 17 ? 'Good Afternoon' : 'Good Evening'}, {isStudent ? 'Student' : 'Parent'}
          </p>
          <h1 className="text-3xl font-black text-brand-text mb-3 tracking-tight">{student.name}</h1>
          <div className="flex gap-2">
            <span className="bg-white/50 dark:bg-black/20 text-brand-text font-bold px-3 py-1 rounded-lg text-xs uppercase tracking-wide border border-black/5 dark:border-white/5">
              {student.studentType === 'tuition' ? 'Tuition' : 'Preschool'}
            </span>
            {student.admissionForClass && (
              <span className="bg-brand-primary/10 text-brand-primary font-bold px-3 py-1 rounded-lg text-xs tracking-wide">
                Class {student.admissionForClass}
              </span>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`border ${tStat.bg} p-6 rounded-3xl shadow-sm`}>
            <div className="text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-3">Today's Status</div>
            <div className={`flex items-center gap-2 text-2xl font-black ${tStat.color}`}>
              <TIcon size={28} /> {tStat.label}
            </div>
            {!isStudent && <div className="text-xs text-brand-text-dim mt-2 font-medium">{attPct}% monthly rate</div>}
          </div>

          <div className={`border ${fees && fees.due > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'} p-6 rounded-3xl shadow-sm`}>
            <div className="text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-3 flex items-center gap-2"><Wallet size={14}/> Fee Balance</div>
            {fees ? (
              <>
                <div className={`text-2xl font-black ${fees.due > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {fees.due > 0 ? `₹${fees.due.toLocaleString()}` : 'Cleared'}
                </div>
                {!isStudent && <div className="text-xs text-brand-text-dim mt-2 font-medium">₹{fees.paid.toLocaleString()} paid ytd</div>}
              </>
            ) : (
              <div className="text-lg font-bold text-brand-text-dim opacity-50">No Data</div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-2xl border border-brand-card-border/40">
          <button 
            onClick={() => setActivePortalTab('overview')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activePortalTab === 'overview' 
                ? 'bg-brand-card text-brand-primary shadow-sm border border-brand-card-border/40 font-bold' 
                : 'text-brand-text-dim hover:text-brand-text'
            }`}
          >
            Overview
          </button>
          <button 
            onClick={() => setActivePortalTab('calendar')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activePortalTab === 'calendar' 
                ? 'bg-brand-card text-brand-primary shadow-sm border border-brand-card-border/40 font-bold' 
                : 'text-brand-text-dim hover:text-brand-text'
            }`}
          >
            <CalendarDays size={14} /> School Calendar
          </button>
        </div>

        {activePortalTab === 'overview' ? (
          <>
            {/* Extended Parent View Components */}
            {!isStudent && (
              <>
                {/* Attendance Calendar */}
                <div className="bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-brand-text uppercase tracking-widest text-xs">28-Day Heatmap</h3>
                    <span className="text-2xl font-black text-brand-text">{attPct}%</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <div className="text-center"><span className="text-green-500 font-bold text-lg">{presentCount}</span><p className="text-[10px] text-brand-text-dim uppercase font-bold">Present</p></div>
                    <div className="text-center"><span className="text-red-500 font-bold text-lg">{absentCount}</span><p className="text-[10px] text-brand-text-dim uppercase font-bold">Absent</p></div>
                    <div className="text-center"><span className="text-yellow-500 font-bold text-lg">{lateCount}</span><p className="text-[10px] text-brand-text-dim uppercase font-bold">Late</p></div>
                  </div>
                  {renderCalendar()}
                </div>

                {/* Fee Breakdown */}
                {fees && fees.components && (
                  <div className="bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-sm">
                    <h3 className="font-bold text-brand-text uppercase tracking-widest text-xs mb-6">Annual Plan Breakdown</h3>
                    <div className="space-y-3 mb-6">
                      {fees.components.filter(c => c.amount > 0).map((c, i) => (
                        <div key={i} className="flex justify-between items-center border-b border-brand-card-border pb-3 last:border-0 last:pb-0">
                          <span className="text-sm font-semibold text-brand-text">{c.name}</span>
                          <div className="text-right">
                            <span className="text-sm font-bold text-brand-text">₹{(c.amount * (c.frequency === 'monthly' ? fees.billingCycle : 1)).toLocaleString()}</span>
                            <p className="text-[10px] text-brand-text-dim">{c.frequency === 'monthly' ? `₹${c.amount}/mo × ${fees.billingCycle}` : 'One-time'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 flex justify-between items-center">
                      <span className="font-bold text-brand-text">Total Expected</span>
                      <span className="font-black text-xl text-brand-text">₹{fees.totalAnnual.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {/* Recent Payments */}
                {transactions.length > 0 && (
                  <div className="bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-sm">
                    <h3 className="font-bold text-brand-text uppercase tracking-widest text-xs mb-6">Recent Payments</h3>
                    <div className="space-y-4">
                      {transactions.map(tx => {
                        const date = tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp || Date.now());
                        return (
                          <div key={tx.id} className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center"><CheckCircle size={18}/></div>
                              <div>
                                <p className="text-sm font-bold text-brand-text">{tx.description || tx.method || 'Payment'}</p>
                                <p className="text-xs text-brand-text-dim">{date.toLocaleDateString()}</p>
                              </div>
                            </div>
                            <span className="font-black text-green-500">+ ₹{tx.amount.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {isStudent && (
              <div className="bg-brand-card border border-brand-card-border p-8 rounded-3xl shadow-sm text-center py-12">
                <CalendarDays size={48} className="text-brand-primary/40 mx-auto mb-4" />
                <p className="text-sm font-bold text-brand-text mb-1">Welcome to your Portal!</p>
                <p className="text-xs text-brand-text-dim max-w-sm mx-auto">Click on the "School Calendar" tab above to check upcoming school holidays and events.</p>
              </div>
            )}
          </>
        ) : (
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-sm">
            <SchoolCalendar />
          </div>
        )}
      </main>
    </div>
  );
}
