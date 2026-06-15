import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, query, where } from 'firebase/firestore';
import { ref, onValue, set, serverTimestamp, get } from 'firebase/database';
import { firestore, rtdb } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Calendar, CheckCircle, XCircle, Clock, BarChart2, CheckSquare } from 'lucide-react';

export default function Attendance() {
  const { currentUser, userData } = useAuth();
  const [activeTab, setActiveTab] = useState('preschool'); // 'staff' | 'preschool' | 'tuition'
  const [mode, setMode] = useState('mark'); // 'mark' | 'report'
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [entities, setEntities] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [reportData, setReportData] = useState({});
  const [loadingReport, setLoadingReport] = useState(false);

  const isAdmin = userData?.isAdmin;
  const attPerms = userData?.permissions?.attendance || {};

  const canViewStaff = isAdmin || attPerms === true || attPerms.view || attPerms.mark || attPerms.edit;
  const canMarkStaff = isAdmin || attPerms === true || attPerms.mark;
  
  const canViewStudents = isAdmin || attPerms === true || attPerms.view || attPerms.mark || attPerms.edit;
  const canMarkStudents = isAdmin || attPerms === true || attPerms.mark;

  // Auto-switch away from tab if not allowed
  useEffect(() => {
    if (activeTab === 'staff' && !canViewStaff && canViewStudents) setActiveTab('preschool');
    if ((activeTab === 'preschool' || activeTab === 'tuition') && !canViewStudents && canViewStaff) setActiveTab('staff');
  }, [activeTab, canViewStaff, canViewStudents]);

  // Fetch Entities (Firestore)
  useEffect(() => {
    async function fetchEntities() {
      setEntities([]);
      setLoadingEntities(true);
      try {
        if (activeTab === 'staff') {
          if (!canViewStaff) return;
          const snap = await getDocs(collection(firestore, 'staff'));
          const data = [];
          snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
          data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setEntities(data);
        } else {
          if (!canViewStudents) return;
          const snap = await getDocs(collection(firestore, 'students'));
          const data = [];
          snap.forEach(doc => {
            const sData = doc.data();
            const sType = sData.programType || sData.studentType || 'preschool';
            if (sType === activeTab) {
              data.push({ id: doc.id, ...sData });
            }
          });
          data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setEntities(data);
        }
      } catch (err) {
        console.error("Failed to fetch entities:", err);
      } finally {
        setLoadingEntities(false);
      }
    }
    fetchEntities();
  }, [activeTab, canViewStaff, canViewStudents]);

  // Fetch Attendance Records (RTDB) for Single Day
  useEffect(() => {
    if (mode !== 'mark' || !selectedDate) return;
    let modulePath = activeTab === 'staff' ? 'staff_directory' : 'student_directory';
    const dbRef = ref(rtdb, `modules/${modulePath}/attendance/${selectedDate}`);
    
    const unsubscribe = onValue(dbRef, (snap) => {
      setAttendance(snap.val() || {});
    });

    return () => unsubscribe();
  }, [activeTab, selectedDate, mode]);

  // Fetch Report Data for 30 Days
  useEffect(() => {
    if (mode !== 'report') return;
    
    async function fetchReport() {
      setLoadingReport(true);
      const map = {}; 
      
      try {
        const snap = await getDocs(collection(firestore, 'attendance_aggregates'));
        snap.forEach(doc => {
          const data = doc.data();
          map[doc.id] = {
            present: data.presentDays || 0,
            absent: data.absentDays || 0,
            late: data.lateDays || 0,
            total: data.totalDays || 0
          };
        });
        setReportData(map);
      } catch (err) {
        console.error("Failed to fetch attendance report:", err);
      } finally {
        setLoadingReport(false);
      }
    }
    fetchReport();
  }, [activeTab, mode]);

  const markAttendance = (entityId, status) => {
    const canMark = activeTab === 'staff' ? canMarkStaff : canMarkStudents;
    if (!canMark) return;

    let modulePath = activeTab === 'staff' ? 'staff_directory' : 'student_directory';
    const dbRef = ref(rtdb, `modules/${modulePath}/attendance/${selectedDate}/${entityId}`);
    
    set(dbRef, {
      status,
      timestamp: serverTimestamp(),
      performedBy: currentUser.email
    });
  };

  const getStatusCounts = () => {
    let present = 0, absent = 0, late = 0;
    entities.forEach(e => {
      const status = attendance[e.id]?.status;
      if (status === 'present') present++;
      if (status === 'absent') absent++;
      if (status === 'late') late++;
    });
    return { present, absent, late, total: entities.length };
  };

  const stats = getStatusCounts();

  if (!canViewStaff && !canViewStudents) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-8 rounded-xl text-center">
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim">You do not have permission to view or mark attendance.</p>
      </div>
    );
  }

  const canMarkActive = activeTab === 'staff' ? canMarkStaff : canMarkStudents;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header & Controls */}
      <div className="bg-brand-card border border-brand-card-border p-6 rounded-xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        
        <div className="flex bg-black/5 dark:bg-white/5 rounded-lg p-1 w-full md:w-auto">
          {canViewStudents && (
            <>
              <button onClick={() => setActiveTab('preschool')} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'preschool' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Preschool</button>
              <button onClick={() => setActiveTab('tuition')} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'tuition' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Tuition</button>
            </>
          )}
          {canViewStaff && (
            <button onClick={() => setActiveTab('staff')} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'staff' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Staff</button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex bg-brand-primary/10 rounded-lg p-1">
            <button onClick={() => setMode('mark')} className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 ${mode === 'mark' ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-primary hover:bg-brand-primary/20'}`}>
              <CheckSquare size={16} /> Mark
            </button>
            <button onClick={() => setMode('report')} className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 ${mode === 'report' ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-primary hover:bg-brand-primary/20'}`}>
              <BarChart2 size={16} /> Report
            </button>
          </div>
          {mode === 'mark' && (
            <div className="relative w-full md:w-auto">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-brand-bg border border-brand-card-border rounded-md py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary w-full md:w-40 text-brand-text font-medium"
              />
            </div>
          )}
        </div>
      </div>

      {mode === 'mark' ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-brand-card border border-brand-card-border p-4 rounded-xl shadow-sm flex flex-col">
              <span className="text-brand-text-dim text-xs font-bold uppercase mb-1">Total Roster</span>
              <span className="text-2xl font-black text-brand-text">{stats.total}</span>
            </div>
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 p-4 rounded-xl shadow-sm flex flex-col">
              <span className="text-green-600 dark:text-green-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><CheckCircle size={14}/> Present</span>
              <span className="text-2xl font-black text-green-700 dark:text-green-400">{stats.present}</span>
            </div>
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-4 rounded-xl shadow-sm flex flex-col">
              <span className="text-red-600 dark:text-red-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><XCircle size={14}/> Absent</span>
              <span className="text-2xl font-black text-red-700 dark:text-red-400">{stats.absent}</span>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 p-4 rounded-xl shadow-sm flex flex-col">
              <span className="text-yellow-600 dark:text-yellow-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Clock size={14}/> Late</span>
              <span className="text-2xl font-black text-yellow-700 dark:text-yellow-400">{stats.late}</span>
            </div>
          </div>

          {/* Roster Table */}
          <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
            {loadingEntities ? (
              <div className="py-12 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div></div>
            ) : entities.length === 0 ? (
              <div className="py-12 text-center text-brand-text-dim">No records found for this category.</div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm text-left text-brand-text-dim">
                    <thead className="text-xs uppercase bg-black/5 dark:bg-white/5 text-brand-text">
                      <tr>
                        <th className="px-6 py-4 w-1/2">Name</th>
                        <th className="px-6 py-4 text-right">Status Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entities.map(entity => {
                        const name = entity.name || entity.email;
                        const currentStatus = attendance[entity.id]?.status || 'none';
                        
                        return (
                          <tr key={entity.id} className="border-b border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold">
                                  {(name || 'U').charAt(0).toUpperCase()}
                                </div>
                                <span className="font-bold text-brand-text text-base">{name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => markAttendance(entity.id, 'present')}
                                  disabled={!canMarkActive}
                                  className={`px-4 py-1.5 rounded-full font-bold text-xs tracking-wider transition-all border ${
                                    currentStatus === 'present' 
                                      ? 'bg-green-500 text-white border-green-500 shadow-sm' 
                                      : 'bg-transparent text-green-600 dark:text-green-500 border-green-200 dark:border-green-900/50 hover:bg-green-50 dark:hover:bg-green-900/20'
                                  } ${!canMarkActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  PRESENT
                                </button>
                                
                                <button 
                                  onClick={() => markAttendance(entity.id, 'absent')}
                                  disabled={!canMarkActive}
                                  className={`px-4 py-1.5 rounded-full font-bold text-xs tracking-wider transition-all border ${
                                    currentStatus === 'absent' 
                                      ? 'bg-red-500 text-white border-red-500 shadow-sm' 
                                      : 'bg-transparent text-red-600 dark:text-red-500 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20'
                                  } ${!canMarkActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  ABSENT
                                </button>
                                
                                <button 
                                  onClick={() => markAttendance(entity.id, 'late')}
                                  disabled={!canMarkActive}
                                  className={`px-4 py-1.5 rounded-full font-bold text-xs tracking-wider transition-all border ${
                                    currentStatus === 'late' 
                                      ? 'bg-yellow-500 text-white border-yellow-500 shadow-sm' 
                                      : 'bg-transparent text-yellow-600 dark:text-yellow-500 border-yellow-200 dark:border-yellow-900/50 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                                  } ${!canMarkActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  LATE
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards List View */}
                <div className="block sm:hidden divide-y divide-brand-card-border">
                  {entities.map(entity => {
                    const name = entity.name || entity.email;
                    const currentStatus = attendance[entity.id]?.status || 'none';
                    return (
                      <div key={entity.id} className="p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold shrink-0">
                            {(name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-bold text-brand-text text-base">{name}</span>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => markAttendance(entity.id, 'present')}
                            disabled={!canMarkActive}
                            className={`flex-1 py-2 rounded-full font-bold text-xs tracking-wider transition-all border text-center ${
                              currentStatus === 'present' 
                                ? 'bg-green-500 text-white border-green-500 shadow-sm' 
                                : 'bg-transparent text-green-600 dark:text-green-500 border-green-200 dark:border-green-900/50 hover:bg-green-50 dark:hover:bg-green-900/20'
                            } ${!canMarkActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            PRESENT
                          </button>
                          <button 
                            onClick={() => markAttendance(entity.id, 'absent')}
                            disabled={!canMarkActive}
                            className={`flex-1 py-2 rounded-full font-bold text-xs tracking-wider transition-all border text-center ${
                              currentStatus === 'absent' 
                                ? 'bg-red-500 text-white border-red-500 shadow-sm' 
                                : 'bg-transparent text-red-600 dark:text-red-500 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20'
                            } ${!canMarkActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            ABSENT
                          </button>
                          <button 
                            onClick={() => markAttendance(entity.id, 'late')}
                            disabled={!canMarkActive}
                            className={`flex-1 py-2 rounded-full font-bold text-xs tracking-wider transition-all border text-center ${
                              currentStatus === 'late' 
                                ? 'bg-yellow-500 text-white border-yellow-500 shadow-sm' 
                                : 'bg-transparent text-yellow-600 dark:text-yellow-500 border-yellow-200 dark:border-yellow-900/50 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                            } ${!canMarkActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            LATE
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* Report Mode View */
        <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-brand-card-border">
            <h3 className="font-bold text-brand-text text-lg">30-Day Attendance Report</h3>
            <p className="text-sm text-brand-text-dim">Summarized metrics for the last 30 working days.</p>
          </div>
          
          {loadingReport || loadingEntities ? (
            <div className="py-12 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div></div>
          ) : entities.length === 0 ? (
            <div className="py-12 text-center text-brand-text-dim">No records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-brand-text-dim">
                <thead className="text-xs uppercase bg-black/5 dark:bg-white/5 text-brand-text">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4 text-center">Present</th>
                    <th className="px-6 py-4 text-center">Absent</th>
                    <th className="px-6 py-4 text-center">Late</th>
                    <th className="px-6 py-4 text-right">Attendance %</th>
                  </tr>
                </thead>
                <tbody>
                  {entities.map(entity => {
                    const name = entity.name || entity.email;
                    const rData = reportData[entity.id] || { present: 0, absent: 0, late: 0, total: 0 };
                    const attendancePct = rData.total > 0 ? Math.round(((rData.present + rData.late) / rData.total) * 100) : 0;
                    
                    return (
                      <tr key={entity.id} className="border-b border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-bold text-brand-text">{name}</td>
                        <td className="px-6 py-4 text-center text-green-600 dark:text-green-500 font-medium">{rData.present}</td>
                        <td className="px-6 py-4 text-center text-red-500 font-medium">{rData.absent}</td>
                        <td className="px-6 py-4 text-center text-yellow-500 font-medium">{rData.late}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-black ${attendancePct >= 75 ? 'text-green-500' : attendancePct >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                            {attendancePct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
